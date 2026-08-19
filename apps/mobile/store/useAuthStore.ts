import { create } from "zustand";
import { clearTokens, setTokens } from "../lib/storage";

export type Staff = { id: string; name: string; email: string; role: string };
export type Me = {
  id: string;
  name: string;
  email: string;
  role: string;
  isOwner: boolean;
  permissions: string[];
  branches: { id: string; name: string; code: string }[];
};

type AuthState = {
  staff: Staff | null;
  me: Me | null;
  hydrated: boolean;
  selectedBranchId: string | null;
  setHydrated: (staff: Staff | null) => void;
  login: (staff: Staff, accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  setMe: (me: Me | null) => void;
  setSelectedBranchId: (id: string | null) => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  staff: null,
  me: null,
  hydrated: false,
  selectedBranchId: null,
  setHydrated: (staff) => set({ staff, hydrated: true }),
  login: async (staff, accessToken, refreshToken) => {
    await setTokens(accessToken, refreshToken);
    set({ staff });
  },
  logout: async () => {
    await clearTokens();
    set({ staff: null, me: null, selectedBranchId: null });
  },
  setMe: (me) => set({ me, selectedBranchId: me?.branches[0]?.id ?? null }),
  setSelectedBranchId: (selectedBranchId) => set({ selectedBranchId }),
}));

export function hasPermission(me: Me | null, key: string): boolean {
  if (!me) return false;
  return me.isOwner || me.permissions.includes("*") || me.permissions.includes(key);
}
