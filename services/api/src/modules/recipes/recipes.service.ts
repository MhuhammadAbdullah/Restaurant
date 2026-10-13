import { Injectable, NotFoundException } from "@nestjs/common";
import type { RecipeGuideInput } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

/**
 * Recipes are the kitchen's "how to make it" notes for a product. They are plain instructions: nothing here reads or
 * changes inventory, and stock never changes because a recipe exists.
 */
@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  private async assertProduct(productId: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const product = await this.prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true, name: true, category: { select: { name: true } } } });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    return { restaurantId, product };
  }

  /** Every product with whether it has a recipe yet. */
  async list() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const [products, guides] = await Promise.all([
      this.prisma.product.findMany({ where: { restaurantId }, select: { id: true, name: true, status: true, category: { select: { name: true } } }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }] }),
      this.prisma.recipeGuide.findMany({ where: { restaurantId }, select: { productId: true, prepMinutes: true, updatedAt: true, ingredients: true, steps: true } }),
    ]);
    const byProduct = new Map(guides.map((g) => [g.productId, g]));
    return products.map((p) => {
      const g = byProduct.get(p.id);
      return {
        productId: p.id,
        name: p.name,
        category: p.category.name,
        active: p.status === "ACTIVE",
        hasRecipe: !!g && (g.ingredients.trim() !== "" || g.steps.trim() !== ""),
        prepMinutes: g?.prepMinutes ?? null,
        updatedAt: g?.updatedAt ?? null,
      };
    });
  }

  async get(productId: string) {
    const { product } = await this.assertProduct(productId);
    const g = await this.prisma.recipeGuide.findUnique({ where: { productId } });
    return {
      productId,
      name: product.name,
      category: product.category.name,
      prepMinutes: g?.prepMinutes ?? null,
      servings: g?.servings ?? "",
      ingredients: g?.ingredients ?? "",
      steps: g?.steps ?? "",
      notes: g?.notes ?? "",
      updatedAt: g?.updatedAt ?? null,
    };
  }

  async save(productId: string, input: RecipeGuideInput, staffId: string) {
    const { restaurantId } = await this.assertProduct(productId);
    await this.prisma.recipeGuide.upsert({
      where: { productId },
      create: { restaurantId, productId, ...input, updatedByStaffId: staffId },
      update: { ...input, updatedByStaffId: staffId },
    });
    return this.get(productId);
  }

  async remove(productId: string) {
    await this.assertProduct(productId);
    await this.prisma.recipeGuide.deleteMany({ where: { productId } });
  }
}
