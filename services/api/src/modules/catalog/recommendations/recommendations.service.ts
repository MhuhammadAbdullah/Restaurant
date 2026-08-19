import { Injectable } from "@nestjs/common";
import type { CreateRecommendationInput } from "@restaurant/validation";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../../common/restaurant/restaurant-context.service";

const PRODUCT_CARD_SELECT = {
  id: true,
  name: true,
  description: true,
  basePrice: true,
  discountPrice: true,
  isFeatured: true,
  isPopular: true,
  images: { select: { url: true, isPrimary: true }, orderBy: { sortOrder: "asc" as const } },
};

/**
 * "Recommended For You" (CLAUDE.md §10): manual admin overrides take priority, then the
 * remaining slots are filled by order-history-driven stats (most ordered / frequently bought
 * together), never hardcoded — Rule 27 (anti-requirements) forbids hardcoded product lists.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  async getGeneral(branchId: string | undefined, limit: number) {
    const restaurantId = await this.restaurantContext.getRestaurantId();

    const manual = await this.prisma.recommendation.findMany({
      where: { restaurantId, sourceProductId: null, branchId: branchId ?? undefined, type: "MANUAL" },
      orderBy: { score: "desc" },
      include: { recommendedProduct: { select: PRODUCT_CARD_SELECT } },
      take: limit,
    });

    const excludeIds = manual.map((m) => m.recommendedProductId);
    const remaining = limit - manual.length;
    let computed: { id: string; count: number }[] = [];

    if (remaining > 0) {
      const grouped = await this.prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          productId: { not: null, notIn: excludeIds },
          order: { restaurantId, branchId, status: { notIn: ["CANCELLED"] } },
        },
        _count: { productId: true },
        orderBy: { _count: { productId: "desc" } },
        take: remaining,
      });
      computed = grouped.filter((g) => g.productId).map((g) => ({ id: g.productId as string, count: g._count.productId }));
    }

    const computedProducts =
      computed.length > 0
        ? await this.prisma.product.findMany({ where: { id: { in: computed.map((c) => c.id) } }, select: PRODUCT_CARD_SELECT })
        : [];
    const computedById = new Map(computedProducts.map((p) => [p.id, p]));

    return [
      ...manual.map((m) => m.recommendedProduct),
      ...computed.map((c) => computedById.get(c.id)).filter((p): p is NonNullable<typeof p> => !!p),
    ];
  }

  async getForProduct(sourceProductId: string, branchId: string | undefined, limit: number) {
    const restaurantId = await this.restaurantContext.getRestaurantId();

    const manual = await this.prisma.recommendation.findMany({
      where: { restaurantId, sourceProductId, branchId: branchId ?? undefined, type: { in: ["MANUAL", "FREQUENTLY_BOUGHT"] } },
      orderBy: { score: "desc" },
      include: { recommendedProduct: { select: PRODUCT_CARD_SELECT } },
      take: limit,
    });
    if (manual.length >= limit) return manual.map((m) => m.recommendedProduct);

    // Frequently-bought-together: other products that appear in the same orders as this one.
    const coOrderIds = await this.prisma.orderItem.findMany({
      where: { productId: sourceProductId, order: { restaurantId, branchId } },
      select: { orderId: true },
    });
    const orderIds = coOrderIds.map((o) => o.orderId);
    if (orderIds.length === 0) return manual.map((m) => m.recommendedProduct);

    const excludeIds = [sourceProductId, ...manual.map((m) => m.recommendedProductId)];
    const grouped = await this.prisma.orderItem.groupBy({
      by: ["productId"],
      where: { orderId: { in: orderIds }, productId: { not: null, notIn: excludeIds } },
      _count: { productId: true },
      orderBy: { _count: { productId: "desc" } },
      take: limit - manual.length,
    });
    const computedProducts = await this.prisma.product.findMany({
      where: { id: { in: grouped.filter((g) => g.productId).map((g) => g.productId as string) } },
      select: PRODUCT_CARD_SELECT,
    });
    const computedById = new Map(computedProducts.map((p) => [p.id, p]));

    return [
      ...manual.map((m) => m.recommendedProduct),
      ...grouped.map((g) => (g.productId ? computedById.get(g.productId) : undefined)).filter((p): p is NonNullable<typeof p> => !!p),
    ];
  }

  /**
   * Most-ordered products in one category, excluding `excludeIds`, filled out with any other
   * eligible product in that category if order history is thin. Restricted to admin-curated
   * `isCartRecommendable` products only — this pool is exclusively for the cart's "Popular with
   * your order" section, not the general popularity/recommendation surfaces.
   */
  private async popularInCategory(categoryId: string, excludeIds: string[], branchId: string | undefined, take: number): Promise<string[]> {
    if (take <= 0) return [];
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const grouped = await this.prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null, notIn: excludeIds },
        product: { categoryId, restaurantId, status: "ACTIVE", isCartRecommendable: true },
        order: { restaurantId, branchId, status: { notIn: ["CANCELLED"] } },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: "desc" } },
      take,
    });
    let ids = grouped.filter((g) => g.productId).map((g) => g.productId as string);

    // Not enough order-history signal yet (new branch, quiet category) — fill with any other
    // cart-recommendable product in the same category so the section isn't sparse.
    if (ids.length < take) {
      const fallback = await this.prisma.product.findMany({
        where: { restaurantId, categoryId, status: "ACTIVE", isCartRecommendable: true, id: { notIn: [...excludeIds, ...ids] } },
        select: { id: true },
        take: take - ids.length,
      });
      ids = [...ids, ...fallback.map((f) => f.id)];
    }
    return ids;
  }

  /**
   * Cart-aware recommendations: related to what's already in the cart (by category), not a
   * generic popular list, and never repeating a product the customer already has. Round-robins
   * across the cart's distinct categories so a multi-category cart (e.g. Burgers + Sides) gets a
   * mixed result instead of one category crowding out the rest.
   *
   * Cross-sell rule: a cart with anything other than a dessert-only order also earns a guaranteed
   * Drinks suggestion, even when Drinks isn't itself one of the cart's own categories — reserved
   * as its own slot rather than left to round-robin luck, so it's never squeezed out.
   */
  async getForCart(cartProductIds: string[], branchId: string | undefined, limit: number) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    if (cartProductIds.length === 0) return this.getGeneral(branchId, limit);

    const cartProducts = await this.prisma.product.findMany({
      where: { id: { in: cartProductIds } },
      select: { categoryId: true, category: { select: { name: true } } },
    });
    const categoryIds = Array.from(new Set(cartProducts.map((p) => p.categoryId)));
    if (categoryIds.length === 0) return this.getGeneral(branchId, limit);

    const isDessertOnly = cartProducts.every((p) => p.category.name.trim().toLowerCase() === "desserts");
    const drinksCategory = isDessertOnly
      ? null
      : await this.prisma.category.findFirst({ where: { restaurantId, name: { equals: "Drinks", mode: "insensitive" } }, select: { id: true } });
    const drinksAlreadyInCart = !!drinksCategory && categoryIds.includes(drinksCategory.id);
    const reserveForDrink = drinksCategory && !drinksAlreadyInCart ? 1 : 0;

    const roundRobinLimit = Math.max(limit - reserveForDrink, 1);
    const perCategory = await Promise.all(categoryIds.map((categoryId) => this.popularInCategory(categoryId, cartProductIds, branchId, roundRobinLimit)));

    const merged: string[] = [];
    for (let i = 0; merged.length < roundRobinLimit && perCategory.some((c) => c.length > i); i++) {
      for (const list of perCategory) {
        if (merged.length >= roundRobinLimit) break;
        if (list[i] && !merged.includes(list[i]!)) merged.push(list[i]!);
      }
    }

    if (reserveForDrink && drinksCategory) {
      const [drinkPick] = await this.popularInCategory(drinksCategory.id, [...cartProductIds, ...merged], branchId, 1);
      if (drinkPick) merged.push(drinkPick);
    }

    // Unlike the empty-cart/no-category cases above, this is a real cart whose categories simply
    // have no admin-curated (isCartRecommendable) products yet — show nothing rather than falling
    // back to uncurated popular items, which would defeat the point of the curation flag.
    if (merged.length === 0) return [];

    const products = await this.prisma.product.findMany({ where: { id: { in: merged } }, select: PRODUCT_CARD_SELECT });
    const byId = new Map(products.map((p) => [p.id, p]));
    return merged.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  }

  async createManual(input: CreateRecommendationInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.recommendation.create({
      data: {
        restaurantId,
        branchId: input.branchId,
        sourceProductId: input.sourceProductId,
        recommendedProductId: input.recommendedProductId,
        score: input.score ?? 100,
        type: "MANUAL",
      },
    });
  }

  async listManual(branchId?: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.recommendation.findMany({
      where: { restaurantId, type: "MANUAL", branchId: branchId ?? undefined },
      include: { recommendedProduct: { select: { id: true, name: true } }, sourceProduct: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async findManualOrThrow(id: string) {
    const rec = await this.prisma.recommendation.findUniqueOrThrow({ where: { id } });
    return rec;
  }

  async removeManual(id: string) {
    await this.prisma.recommendation.delete({ where: { id } });
    return { deleted: true };
  }
}
