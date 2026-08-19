"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useAuthStore } from "../store/useAuthStore";

export type Me = {
  id: string;
  name: string;
  email: string;
  role: string;
  isOwner: boolean;
  allBranchesAccess: boolean;
  permissions: string[];
  branches: { id: string; name: string; code: string }[];
};

export function useMe() {
  const staff = useAuthStore((s) => s.staff);
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/staff/me"), enabled: !!staff });
}

export function hasPermission(me: Me | undefined, key: string): boolean {
  if (!me) return false;
  return me.isOwner || me.permissions.includes("*") || me.permissions.includes(key);
}
