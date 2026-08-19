import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCouponInput, UpdateCouponInput } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

export type CouponEligibleLine = { productId: string; lineTotal: number };

export type CouponPricingResult = {
  couponId: string;
  code: string;
  discountAmount: number;
};

/**
 * Single validation/pricing entry point for coupons — called from both the online checkout
 * (createOnlineOrder) and POS (createPosOrder) so there is exactly one place discount rules
 * are enforced (CLAUDE.md anti-duplication rule). Never trust a discount amount from the client.
 *
 * V1 stacking rule: one coupon per order, and the discount only applies to non-deal
 * (plain product) line items — deal pricing is already a bundled/fixed price and stays untouched.
 */
@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  async list() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.coupon.findMany({
      where: { restaurantId },
      include: { restrictedProducts: { include: { product: { select: { id: true, name: true } } } }, restrictedCategories: { include: { category: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: { restrictedProducts: { include: { product: { select: { id: true, name: true } } } }, restrictedCategories: { include: { category: { select: { id: true, name: true } } } } },
    });
    if (!coupon) throw new NotFoundException({ code: "COUPON_NOT_FOUND", message: "Coupon not found" });
    return coupon;
  }

  async create(input: CreateCouponInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const existing = await this.prisma.coupon.findUnique({ where: { restaurantId_code: { restaurantId, code: input.code } } });
    if (existing) throw new BadRequestException({ code: "COUPON_CODE_TAKEN", message: "A coupon with this code already exists" });

    return this.prisma.coupon.create({
      data: {
        restaurantId,
        code: input.code,
        description: input.description,
        discountType: input.discountType,
        discountValue: input.discountValue,
        maxDiscountAmount: input.maxDiscountAmount,
        minOrderValue: input.minOrderValue,
        startDate: input.startDate,
        endDate: input.endDate,
        usageLimit: input.usageLimit,
        perCustomerLimit: input.perCustomerLimit,
        status: input.status,
        restrictedProducts: { create: input.productIds.map((productId) => ({ productId })) },
        restrictedCategories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
      },
      include: { restrictedProducts: true, restrictedCategories: true },
    });
  }

  async update(id: string, input: UpdateCouponInput) {
    await this.findOne(id);
    if (input.code) {
      const restaurantId = await this.restaurantContext.getRestaurantId();
      const existing = await this.prisma.coupon.findUnique({ where: { restaurantId_code: { restaurantId, code: input.code } } });
      if (existing && existing.id !== id) {
        throw new BadRequestException({ code: "COUPON_CODE_TAKEN", message: "A coupon with this code already exists" });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.productIds) {
        await tx.couponProduct.deleteMany({ where: { couponId: id } });
        await tx.couponProduct.createMany({ data: input.productIds.map((productId) => ({ couponId: id, productId })) });
      }
      if (input.categoryIds) {
        await tx.couponCategory.deleteMany({ where: { couponId: id } });
        await tx.couponCategory.createMany({ data: input.categoryIds.map((categoryId) => ({ couponId: id, categoryId })) });
      }
      return tx.coupon.update({
        where: { id },
        data: {
          code: input.code,
          description: input.description,
          discountType: input.discountType,
          discountValue: input.discountValue,
          maxDiscountAmount: input.maxDiscountAmount,
          minOrderValue: input.minOrderValue,
          startDate: input.startDate,
          endDate: input.endDate,
          usageLimit: input.usageLimit,
          perCustomerLimit: input.perCustomerLimit,
          status: input.status,
        },
        include: { restrictedProducts: true, restrictedCategories: true },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.coupon.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Validates a coupon code against server-known state (existence, window, limits, restrictions)
   * and computes its discount against the given product-only line items. Does not persist a
   * redemption — callers create the CouponRedemption row themselves inside the order transaction,
   * once the order actually commits.
   */
  async validateAndPrice(params: {
    restaurantId: string;
    code: string;
    customerId?: string | null;
    productLines: CouponEligibleLine[];
  }): Promise<CouponPricingResult> {
    const code = params.code.trim().toUpperCase();
    const coupon = await this.prisma.coupon.findUnique({
      where: { restaurantId_code: { restaurantId: params.restaurantId, code } },
      include: { restrictedProducts: true, restrictedCategories: true },
    });
    if (!coupon || coupon.status !== "ACTIVE") {
      throw new BadRequestException({ code: "COUPON_INVALID", message: "Invalid or inactive coupon code" });
    }

    const now = new Date();
    if (coupon.startDate && now < coupon.startDate) {
      throw new BadRequestException({ code: "COUPON_NOT_STARTED", message: "This coupon is not active yet" });
    }
    if (coupon.endDate && now > coupon.endDate) {
      throw new BadRequestException({ code: "COUPON_EXPIRED", message: "This coupon has expired" });
    }

    if (coupon.usageLimit != null) {
      const totalUses = await this.prisma.couponRedemption.count({ where: { couponId: coupon.id } });
      if (totalUses >= coupon.usageLimit) {
        throw new BadRequestException({ code: "COUPON_LIMIT_REACHED", message: "This coupon has reached its usage limit" });
      }
    }
    if (coupon.perCustomerLimit != null && params.customerId) {
      const customerUses = await this.prisma.couponRedemption.count({ where: { couponId: coupon.id, customerId: params.customerId } });
      if (customerUses >= coupon.perCustomerLimit) {
        throw new BadRequestException({ code: "COUPON_ALREADY_USED", message: "You have already used this coupon" });
      }
    }

    const orderSubtotal = params.productLines.reduce((sum, l) => sum + l.lineTotal, 0);
    if (coupon.minOrderValue != null && orderSubtotal < coupon.minOrderValue) {
      throw new BadRequestException({
        code: "COUPON_MIN_ORDER_NOT_MET",
        message: `Minimum order of Rs. ${coupon.minOrderValue / 100} required for this coupon`,
      });
    }

    const restrictedProductIds = new Set(coupon.restrictedProducts.map((p) => p.productId));
    const restrictedCategoryIds = new Set(coupon.restrictedCategories.map((c) => c.categoryId));
    const hasRestrictions = restrictedProductIds.size > 0 || restrictedCategoryIds.size > 0;

    let eligibleLines = params.productLines;
    if (hasRestrictions) {
      let productCategoryMap = new Map<string, string>();
      if (restrictedCategoryIds.size > 0) {
        const productIds = [...new Set(params.productLines.map((l) => l.productId))];
        const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } });
        productCategoryMap = new Map(products.map((p) => [p.id, p.categoryId]));
      }
      eligibleLines = params.productLines.filter(
        (l) => restrictedProductIds.has(l.productId) || restrictedCategoryIds.has(productCategoryMap.get(l.productId) ?? ""),
      );
    }

    const eligibleSubtotal = eligibleLines.reduce((sum, l) => sum + l.lineTotal, 0);
    if (eligibleSubtotal <= 0) {
      throw new BadRequestException({ code: "COUPON_NOT_APPLICABLE", message: "This coupon does not apply to items in your cart" });
    }

    let discountAmount =
      coupon.discountType === "PERCENTAGE" ? Math.round((eligibleSubtotal * coupon.discountValue) / 100) : coupon.discountValue;
    if (coupon.discountType === "PERCENTAGE" && coupon.maxDiscountAmount != null) {
      discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
    }
    discountAmount = Math.min(discountAmount, eligibleSubtotal);

    return { couponId: coupon.id, code: coupon.code, discountAmount };
  }
}
