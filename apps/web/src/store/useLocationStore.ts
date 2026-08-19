"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Branch } from "../lib/types";

type OrderType = "DELIVERY" | "PICKUP";

type LocationState = {
  orderType: OrderType;
  city: string | null;
  area: string | null;
  branch: Branch | null;
  isResolved: boolean;
  /** Whether the resolved branch is currently within operating hours. Browsing is allowed either way — checkout is not. */
  isBranchOpen: boolean;
  /** True while the user re-opened the location modal to change an already-resolved location (via the header button). Lets that flow show a close/cancel button without breaking the mandatory first-time gate, where branch is still null and there's nothing to fall back to. */
  isChangeModalOpen: boolean;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setOrderType: (t: OrderType) => void;
  setResolved: (city: string, area: string | null, branch: Branch, isBranchOpen: boolean) => void;
  openChangeModal: () => void;
  closeChangeModal: () => void;
  reset: () => void;
};

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      orderType: "DELIVERY",
      city: null,
      area: null,
      branch: null,
      isResolved: false,
      isBranchOpen: true,
      isChangeModalOpen: false,
      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setOrderType: (orderType) => set({ orderType }),
      setResolved: (city, area, branch, isBranchOpen) => set({ city, area, branch, isResolved: true, isBranchOpen, isChangeModalOpen: false }),
      openChangeModal: () => set({ isChangeModalOpen: true }),
      closeChangeModal: () => set({ isChangeModalOpen: false }),
      reset: () => set({ city: null, area: null, branch: null, isResolved: false, isBranchOpen: true, isChangeModalOpen: false }),
    }),
    {
      name: "restaurant_location",
      // Without this flag, `isResolved` reads as false (the pre-hydration default) for a beat
      // after every refresh, so the mandatory location modal flashes open even when the user
      // already resolved a location in a previous session.
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
