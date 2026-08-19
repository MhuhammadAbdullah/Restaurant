"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearTokens, setTokens } from "../lib/api";

type Staff = { id: string; name: string; email: string; role: string };

type AuthState = {
  staff: Staff | null;
  selectedBranchId: string | null;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  login: (staff: Staff, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setSelectedBranchId: (id: string | null) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      staff: null,
      selectedBranchId: null,
      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      login: (staff, accessToken, refreshToken) => {
        setTokens(accessToken, refreshToken);
        set({ staff });
      },
      logout: () => {
        clearTokens();
        set({ staff: null });
      },
      setSelectedBranchId: (selectedBranchId) => set({ selectedBranchId }),
    }),
    {
      name: "restaurant_staff_auth",
      // Without this flag, `staff` reads null for a beat after every hard refresh (persist
      // rehydration from localStorage is async), which sends a still-logged-in user to /login.
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
