import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ProductOrderItemInput } from "@restaurant/validation";
import { effectivePrice, resolveChoiceGroupRules } from "@restaurant/utils";
import { PrismaService } from "../../common/prisma/prisma.service";

export type ProductLineBreakdown = {
  productId: string;
  productName: string;
  unitPrice: number;
  regularUnitPrice: number;
  quantity: number;
  choices: Array<{ choiceOptionId: string; name: string; priceAdjustment: number; regularPriceAdjustment: number }>;
  addons: Array<{ addonId: string; name: string; price: number; regularPrice: number; quantity: number }>;
  lineTotal: number;
};

/**
 * Standalone-product equivalent of DealPricingService: validates choice/addon selections
 * against what's actually configured on the product, and computes price server-side —
 * a client-sent price is never trusted (Rule 8).
 */
@Injectable()
export class ProductPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async priceItem(branchId: string, item: ProductOrderItemInput): Promise<ProductLineBreakdown> {
    const product = await this.prisma.product.findUnique({
      where: { id: item.productId },
      include: {
        choiceGroups: { include: { choiceGroup: { include: { options: true } } } },
        addons: { include: { addon: true } },
        branchAvailability: { where: { branchId } },
      },
    });
    if (!product || product.status !== "ACTIVE") {
      throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    }
    const availability = product.branchAvailability[0];
    if (!availability || !availability.isAvailable) {
      throw new BadRequestException({
        code: "PRODUCT_UNAVAILABLE_AT_BRANCH",
        message: `"${product.name}" is not available at the selected branch`,
      });
    }

    const choiceBreakdown: ProductLineBreakdown["choices"] = [];
    const choicesByGroup = new Map<string, typeof item.choices>();
    for (const c of item.choices) {
      const list = choicesByGroup.get(c.choiceGroupId) ?? [];
      list.push(c);
      choicesByGroup.set(c.choiceGroupId, list);
    }
    for (const assignment of product.choiceGroups) {
      const group = assignment.choiceGroup;
      const rules = resolveChoiceGroupRules(group, assignment);
      const activeOptions = group.options.filter((o) => o.status === "ACTIVE");
      const picked = choicesByGroup.get(group.id) ?? [];

      if (rules.isRequired && picked.length === 0) {
        throw new BadRequestException({ code: "MISSING_REQUIRED_CHOICE", message: `"${group.name}" is required` });
      }
      if (picked.length > 0 && (picked.length < rules.minSelect || picked.length > rules.maxSelect)) {
        throw new BadRequestException({
          code: "INVALID_CHOICE_COUNT",
          message: `"${group.name}" requires between ${rules.minSelect} and ${rules.maxSelect} selections`,
        });
      }
      for (const pick of picked) {
        const option = activeOptions.find((o) => o.id === pick.choiceOptionId);
        if (!option) throw new BadRequestException({ code: "INVALID_CHOICE_OPTION", message: `Invalid option for "${group.name}"` });
        choiceBreakdown.push({
          choiceOptionId: option.id,
          name: option.name,
          priceAdjustment: effectivePrice(option.priceAdjustment, option.discountPriceAdjustment),
          regularPriceAdjustment: option.priceAdjustment,
        });
      }
    }

    const addonBreakdown: ProductLineBreakdown["addons"] = [];
    const validAddons = new Map(product.addons.filter((pa) => pa.addon.status === "ACTIVE").map((pa) => [pa.addonId, pa.addon]));
    for (const pick of item.addons) {
      const addon = validAddons.get(pick.addonId);
      if (!addon) throw new BadRequestException({ code: "INVALID_ADDON", message: "Selected addon is not valid for this product" });
      if (pick.quantity > addon.maxQuantity) {
        throw new BadRequestException({ code: "ADDON_QUANTITY_EXCEEDED", message: `"${addon.name}" allows at most ${addon.maxQuantity}` });
      }
      addonBreakdown.push({
        addonId: addon.id,
        name: addon.name,
        price: effectivePrice(addon.price, addon.discountPrice),
        regularPrice: addon.price,
        quantity: pick.quantity,
      });
    }

    const unitPrice = effectivePrice(product.basePrice, product.discountPrice);
    const choiceTotal = choiceBreakdown.reduce((s, c) => s + c.priceAdjustment, 0);
    const addonTotal = addonBreakdown.reduce((s, a) => s + a.price * a.quantity, 0);
    const lineTotal = (unitPrice + choiceTotal + addonTotal) * item.quantity;

    return {
      productId: product.id,
      productName: product.name,
      unitPrice,
      regularUnitPrice: product.basePrice,
      quantity: item.quantity,
      choices: choiceBreakdown,
      addons: addonBreakdown,
      lineTotal,
    };
  }
}
