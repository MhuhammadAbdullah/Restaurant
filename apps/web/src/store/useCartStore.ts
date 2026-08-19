"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "../lib/types";

type CartState = {
  items: CartItem[];
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  addItem: (item: CartItem) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clear: () => void;
};

function makeCartItemId() {
  return `ci_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      addItem: (item) =>
        set((state) => ({ items: [...state.items, { ...item, cartItemId: item.cartItemId || makeCartItemId() }] })),
      removeItem: (cartItemId) => set((state) => ({ items: state.items.filter((i) => i.cartItemId !== cartItemId) })),
      updateQuantity: (cartItemId, quantity) =>
        set((state) => ({
          items: state.items
            .map((i) => (i.cartItemId === cartItemId ? { ...i, quantity } : i))
            .filter((i) => i.quantity > 0),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "restaurant_cart",
      // Persisted `items` load asynchronously after first render — without this flag, any
      // effect that reacts to an empty cart (e.g. redirecting away from checkout) fires on the
      // pre-hydration default state before the real saved cart has loaded.
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export { makeCartItemId };
