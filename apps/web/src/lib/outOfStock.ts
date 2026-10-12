"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useCartStore } from "../store/useCartStore";
import { useLocationStore } from "../store/useLocationStore";
import { toast } from "../store/useToastStore";
import type { CartItem } from "./types";

export type BranchAvailability = { branchId: string; isAvailable: boolean }[];

/** An item the branch has switched off (sold out). Items with no row for the branch are simply not sold there. */
export function isSoldOutAt(availability: BranchAvailability | undefined, branchId: string | undefined): boolean {
  if (!availability || !branchId) return false;
  const row = availability.find((a) => a.branchId === branchId);
  return !!row && !row.isAvailable;
}

/** An option (choice) switched off at this branch. */
export function isOptionUnavailableAt(option: { outOfStock?: { branchId: string }[] }, branchId: string | undefined): boolean {
  return !!branchId && !!option.outOfStock?.some((o) => o.branchId === branchId);
}

export const OPTION_UNAVAILABLE_LABEL = "Not available";
export const OPTION_UNAVAILABLE_NOTE = "Out of stock right now";

export const SOLD_OUT_TITLE = "Sold out";
export const SOLD_OUT_TAGLINE = "Restocking soon";
export const SOLD_OUT_CART_MESSAGE = "This one just flew off the kitchen counter! Please remove it to place your order.";
export const OPTION_OUT_CART_MESSAGE = "An option you picked is not available right now. Please remove this item and add it again with another option.";
export const SOLD_OUT_INACTIVE_MESSAGE = "This item is no longer on the menu. Please remove it to place your order.";

/** Friendly toast when someone taps a sold-out item. */
export function soldOutToast(name: string) {
  toast.error(`Oh no! ${name} is sold out right now. Our chefs are restocking, so try another favourite meanwhile.`);
}

export type CartIssue = "INACTIVE" | "OUT_OF_STOCK" | "OPTION_OUT";

export type CartAvailability = {
  /** why a cart line cannot be ordered (the item itself, or an option picked on it) */
  reasonFor: (item: CartItem) => CartIssue | null;
  hasUnavailable: boolean;
};

/**
 * Checks the items in the cart against the branch: an item that was switched off or removed after it was added
 * shows as sold out and blocks checkout until it is removed.
 */
export function useCartAvailability(): CartAvailability {
  const items = useCartStore((s) => s.items);
  const branchId = useLocationStore((s) => s.branch?.id);
  const productIds = [...new Set(items.filter((i) => i.kind === "product").map((i) => (i as { productId: string }).productId))].sort();
  const dealIds = [...new Set(items.filter((i) => i.kind === "deal").map((i) => (i as { dealId: string }).dealId))].sort();
  const optionIdsOf = (item: CartItem): string[] =>
    item.kind === "product" ? item.choices.map((c) => c.choiceOptionId) : item.slots.flatMap((s) => s.choices.map((c) => c.choiceOptionId));
  const choiceOptionIds = [...new Set(items.flatMap(optionIdsOf))].sort();

  const { data } = useQuery({
    queryKey: ["cart-availability", branchId, productIds, dealIds, choiceOptionIds],
    queryFn: () =>
      api.public.post<{ unavailable: { kind: "product" | "deal" | "choice"; id: string; reason: "INACTIVE" | "OUT_OF_STOCK" }[] }>("/catalog/products/availability", {
        branchId,
        productIds,
        dealIds,
        choiceOptionIds,
      }),
    enabled: !!branchId && items.length > 0,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const map = new Map((data?.unavailable ?? []).map((u) => [`${u.kind}:${u.id}`, u.reason]));
  const reasonFor = (item: CartItem): CartIssue | null => {
    const id = item.kind === "product" ? (item as { productId: string }).productId : (item as { dealId: string }).dealId;
    const own = map.get(`${item.kind}:${id}`);
    if (own) return own;
    return optionIdsOf(item).some((o) => map.has(`choice:${o}`)) ? "OPTION_OUT" : null;
  };
  return { reasonFor, hasUnavailable: items.some((i) => reasonFor(i) !== null) };
}
