import { effectivePrice } from "./pricing";

/**
 * Resolves a Choice Section's own required/selection-type/min/max against an optional
 * per-attachment override (set when a product attaches the section — see ProductChoiceGroup).
 * Deal slots don't support overrides, so callers pass `undefined` there.
 */

export type ChoiceGroupRules = {
  isRequired: boolean;
  selectionType: "SINGLE" | "MULTIPLE";
  minSelect: number;
  maxSelect: number;
};

export type ChoiceGroupOverride = {
  isRequiredOverride?: boolean | null;
  minSelectOverride?: number | null;
  maxSelectOverride?: number | null;
};

export function resolveChoiceGroupRules(group: ChoiceGroupRules, override?: ChoiceGroupOverride | null): ChoiceGroupRules {
  return {
    isRequired: override?.isRequiredOverride ?? group.isRequired,
    selectionType: group.selectionType,
    minSelect: override?.minSelectOverride ?? group.minSelect,
    maxSelect: override?.maxSelectOverride ?? group.maxSelect,
  };
}

/** Returns the lone option's id if exactly one active option exists (auto-select, still shown as pre-checked), else []. */
export function autoSelectSingleOption(activeOptions: { id: string }[]): string[] {
  return activeOptions.length === 1 ? [activeOptions[0]!.id] : [];
}

/**
 * Price effect of picking a choice option.
 * Normally the option's price is an extra added on top of the product price. In a section marked "full price"
 * (priceReplacesBase) the option's price IS the item's price (e.g. Regular Rs. 1,990 / Full Rs. 3,690), so what it
 * adds is the difference from the product's own price. Carts and orders keep the same shape (unit price + adjustments).
 */
export function choiceOptionAdjustment(
  group: { priceReplacesBase?: boolean | null },
  option: { priceAdjustment: number; discountPriceAdjustment?: number | null; useListingPrice?: boolean | null },
  productPrice: number,
  productRegularPrice: number = productPrice,
): { adjustment: number; regularAdjustment: number } {
  // "Same listing price" / "no price change": nothing is added and nothing replaces the product price.
  if (option.useListingPrice) return { adjustment: 0, regularAdjustment: 0 };
  const price = effectivePrice(option.priceAdjustment, option.discountPriceAdjustment);
  if (!group.priceReplacesBase) return { adjustment: price, regularAdjustment: option.priceAdjustment };
  return { adjustment: price - productPrice, regularAdjustment: option.priceAdjustment - productRegularPrice };
}
