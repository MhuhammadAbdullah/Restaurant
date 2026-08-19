"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type BrandState = {
  name: string | null;
  logoUrl: string | null;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setBrand: (name: string, logoUrl: string | null) => void;
};

/**
 * Caches the restaurant name/logo from the last successful `/cms/restaurant` fetch so the global
 * loading screen (GlobalLoadingScreen) can show the real logo immediately on mount instead of
 * racing the very fetch that's causing the loading state — that query's `data` is `undefined` for
 * most of the screen's visible lifetime by definition, since it's still loading.
 */
export const useBrandStore = create<BrandState>()(
  persist(
    (set) => ({
      name: null,
      logoUrl: null,
      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setBrand: (name, logoUrl) => set({ name, logoUrl }),
    }),
    {
      name: "restaurant_brand",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
