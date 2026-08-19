"use client";

import { useEffect } from "react";
import { useMe } from "./useMe";
import { useAuthStore } from "../store/useAuthStore";

export function useSelectedBranch() {
  const { data: me } = useMe();
  const { selectedBranchId, setSelectedBranchId } = useAuthStore();

  useEffect(() => {
    // Only force a selection when there's exactly one branch to pick from — there's no real
    // choice there anyway. Anyone with more than one branch (including the Owner, who now always
    // sees every branch — see StaffAuthService.me) starts on "All Branches" instead of silently
    // defaulting to whichever branch happened to be first; every list page already treats a null
    // branchId as "don't filter" (scoped to the staff's own branches server-side either way).
    if (!selectedBranchId && me?.branches && me.branches.length === 1) {
      setSelectedBranchId(me.branches[0]!.id);
    }
  }, [me, selectedBranchId, setSelectedBranchId]);

  return {
    branchId: selectedBranchId,
    branches: me?.branches ?? [],
    setBranchId: setSelectedBranchId,
  };
}
