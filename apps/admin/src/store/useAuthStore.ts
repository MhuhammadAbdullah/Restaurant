"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { clearTokens, setTokens } from "../lib/api";
import { getQueryClient } from "../lib/queryClient";

type Staff = { id: string; name: string; email: string; role: string };

type AuthState = {
  staff: Staff | null;
  selectedBranchId: string | null;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  login: (staff: Staff, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setSelectedBranchId: (id: string | null) => void;
  /** Keeps the saved name in step after the person edits their own profile. */
  updateStaff: (patch: Partial<Staff>) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      staff: null,
      selectedBranchId: null,
      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      login: (staff, accessToken, refreshToken) => {
        // forget anything cached for whoever used this screen before
        getQueryClient().clear();
        setTokens(accessToken, refreshToken);
        set({ staff });
      },
      logout: () => {
        clearTokens();
        getQueryClient().clear();
        set({ staff: null });
      },
      setSelectedBranchId: (selectedBranchId) => set({ selectedBranchId }),
      updateStaff: (patch) => set((st) => (st.staff ? { staff: { ...st.staff, ...patch } } : st)),
    }),
    {
      name: "restaurant_staff_auth",
      // Session-only (cleared when the browser or tab is closed), in step with the tokens in lib/api.ts.
      storage: createJSONStorage(() => sessionStorage),
      // Without this flag, `staff` reads null for a beat after every hard refresh (persist
      // rehydration from localStorage is async), which sends a still-logged-in user to /login.
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
