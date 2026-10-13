"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useLocationStore } from "../store/useLocationStore";

/**
 * The chosen branch is remembered in the browser. If that branch no longer exists (removed, renamed or the data was
 * replaced), the menu would stay empty for that visitor, so the saved choice is cleared and the location popup asks again.
 */
export function LocationGuard() {
  const { branch, isResolved, hasHydrated, reset } = useLocationStore();
  const { data: branches } = useQuery({
    queryKey: ["branches-guard"],
    queryFn: () => api.public.get<{ id: string }[]>("/branches"),
    enabled: hasHydrated && isResolved && !!branch,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (branches && branch && branches.length > 0 && !branches.some((b) => b.id === branch.id)) reset();
  }, [branches, branch, reset]);

  return null;
}
