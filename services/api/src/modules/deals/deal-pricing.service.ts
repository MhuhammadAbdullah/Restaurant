import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { DealSlotSelectionInput } from "@restaurant/validation";
import { effectivePrice, resolveChoiceGroupRules } from "@restaurant/utils";
import { PrismaService } from "../../common/prisma/prisma.service";

export type SlotPriceBreakdown = {
  dealSlotId: string;
  label: string;
  productId: string;
  productName: string;
  unitPrice: number;
  regularUnitPrice: number;
  choices: Array<{ choiceGroupId: string; choiceOptionId: string; name: string; priceAdjustment: number; regularPriceAdjustment: number }>;
  addons: Array<{ addonId: string; name: string; price: number; regularPrice: number; quantity: number }>;
  slotTotal: number;
};

export type DealPriceResult = {
  dealId: string;
  dealName: string;
  dealPrice: number;
  originalPrice: number | null;
  normalTotal: number;
  youSave: number;
  slots: SlotPriceBreakdown[];
};

/**
 * Single source of truth for deal pricing (CLAUDE.md §7 "Deal Pricing (server-side only)").
 * Used by the price-preview endpoint (website deal configurator) AND, later, by the order
 * creation pipeline — never trust a client-submitted deal total or slot selection.
 */
@Injectable()
export class DealPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async priceSelections(dealId: string, selections: DealSlotSelectionInput[]): Promise<DealPriceResult> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        slots: {
          include: {
            productOptions: true,
            choiceGroups: { include: { choiceGroup: { include: { options: true } } } },
            addons: { include: { addon: true } },
          },
        },
      },
    });
    if (!deal || deal.status !== "ACTIVE") {
      throw new NotFoundException({ code: "DEAL_NOT_FOUND", message: "Deal not found or no longer available" });
    }

    const slotById = new Map(deal.slots.map((s) => [s.id, s]));
    const selectionBySlotId = new Map(selections.map((s) => [s.dealSlotId, s]));

    if (selectionBySlotId.size !== selections.length) {
      throw new BadRequestException({ code: "DUPLICATE_SLOT_SELECTION", message: "Each deal slot may only be selected once" });
    }
    for (const slot of deal.slots) {
      if (!selectionBySlotId.has(slot.id)) {
        throw new BadRequestException({
          code: "MISSING_SLOT_SELECTION",
          message: `Missing selection for "${slot.label}"`,
        });
      }
    }
    for (const dealSlotId of selectionBySlotId.keys()) {
      if (!slotById.has(dealSlotId)) {
        throw new BadRequestException({ code: "INVALID_SLOT", message: "Selection references a slot that isn't part of this deal" });
      }
    }

    const slotBreakdowns: SlotPriceBreakdown[] = [];
    let extraTotal = 0;

    for (const slot of deal.slots) {
      const selection = selectionBySlotId.get(slot.id)!;

      const validProductIds = new Set(slot.productOptions.map((p) => p.productId));
      if (!validProductIds.has(selection.productId)) {
        throw new BadRequestException({
          code: "INVALID_SLOT_PRODUCT",
          message: `Selected product is not a valid option for "${slot.label}"`,
        });
      }
      const product = await this.prisma.product.findUnique({ where: { id: selection.productId } });
      if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });

      const choiceBreakdown: SlotPriceBreakdown["choices"] = [];
      const choicesByGroup = new Map<string, typeof selection.choices>();
      for (const c of selection.choices) {
        const list = choicesByGroup.get(c.choiceGroupId) ?? [];
        list.push(c);
        choicesByGroup.set(c.choiceGroupId, list);
      }

      for (const assignment of slot.choiceGroups) {
        const group = assignment.choiceGroup;
        const rules = resolveChoiceGroupRules(group);
        const activeOptions = group.options.filter((o) => o.status === "ACTIVE");
        const picked = choicesByGroup.get(group.id) ?? [];

        if (rules.isRequired && picked.length === 0) {
          throw new BadRequestException({
            code: "MISSING_REQUIRED_CHOICE",
            message: `"${group.name}" is required for "${slot.label}"`,
          });
        }
        if (picked.length > 0 && (picked.length < rules.minSelect || picked.length > rules.maxSelect)) {
          throw new BadRequestException({
            code: "INVALID_CHOICE_COUNT",
            message: `"${group.name}" requires between ${rules.minSelect} and ${rules.maxSelect} selections`,
          });
        }
        const validOptionIds = new Set(activeOptions.map((o) => o.id));
        for (const pick of picked) {
          if (!validOptionIds.has(pick.choiceOptionId)) {
            throw new BadRequestException({
              code: "INVALID_CHOICE_OPTION",
              message: `Invalid option selected for "${group.name}"`,
            });
          }
          const option = activeOptions.find((o) => o.id === pick.choiceOptionId)!;
          choiceBreakdown.push({
            choiceGroupId: group.id,
            choiceOptionId: option.id,
            name: option.name,
            priceAdjustment: effectivePrice(option.priceAdjustment, option.discountPriceAdjustment),
            regularPriceAdjustment: option.priceAdjustment,
          });
        }
      }

      const addonBreakdown: SlotPriceBreakdown["addons"] = [];
      const validAddons = new Map(slot.addons.filter((sa) => sa.addon.status === "ACTIVE").map((sa) => [sa.addonId, sa.addon]));
      for (const pick of selection.addons) {
        const addon = validAddons.get(pick.addonId);
        if (!addon) {
          throw new BadRequestException({
            code: "INVALID_ADDON",
            message: `Selected addon is not valid for "${slot.label}"`,
          });
        }
        if (pick.quantity > addon.maxQuantity) {
          throw new BadRequestException({
            code: "ADDON_QUANTITY_EXCEEDED",
            message: `"${addon.name}" allows at most ${addon.maxQuantity}`,
          });
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
      const choiceTotal = choiceBreakdown.reduce((sum, c) => sum + c.priceAdjustment, 0);
      const addonTotal = addonBreakdown.reduce((sum, a) => sum + a.price * a.quantity, 0);
      const slotTotal = (unitPrice + choiceTotal + addonTotal) * slot.quantity;
      // The deal's flat price already covers each slot's base product — only the *extra* cost of
      // paid choices (e.g. Pepperoni +Rs.100) and addons rides on top, so a deal stays a bundle
      // price while upgrades still cost what they say they cost, both here and at checkout.
      extraTotal += (choiceTotal + addonTotal) * slot.quantity;

      slotBreakdowns.push({
        dealSlotId: slot.id,
        label: slot.label,
        productId: product.id,
        productName: product.name,
        unitPrice,
        regularUnitPrice: product.basePrice,
        choices: choiceBreakdown,
        addons: addonBreakdown,
        slotTotal,
      });
    }

    const normalTotal = slotBreakdowns.reduce((sum, s) => sum + s.slotTotal, 0);
    const dealPrice = deal.dealPrice + extraTotal;
    const youSave = Math.max(0, normalTotal - dealPrice);

    return { dealId: deal.id, dealName: deal.name, dealPrice, originalPrice: deal.originalPrice, normalTotal, youSave, slots: slotBreakdowns };
  }
}
