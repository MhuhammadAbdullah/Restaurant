"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearTokens, setTokens } from "../lib/api";

type Customer = { id: string; name: string; phone: string; email: string };

type AuthState = {
  customer: Customer | null;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  login: (customer: Customer, accessToken: string, refreshToken: string) => void;
  updateCustomer: (patch: Partial<Customer>) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      customer: null,
      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      login: (customer, accessToken, refreshToken) => {
        setTokens(accessToken, refreshToken);
        set({ customer });
      },
      // For syncing the sidebar/header display after a profile edit — never touches tokens.
      updateCustomer: (patch) => set((s) => (s.customer ? { customer: { ...s.customer, ...patch } } : s)),
      logout: () => {
        clearTokens();
        set({ customer: null });
      },
    }),
    {
      name: "restaurant_customer_auth",
      // Without this flag, `customer` reads null for a beat after every refresh, which flashes
      // the guest checkout form before flipping to the logged-in one.
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
