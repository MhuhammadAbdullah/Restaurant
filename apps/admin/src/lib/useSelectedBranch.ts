"use client";

import { useEffect } from "react";
import { useMe } from "./useMe";
import { useAuthStore } from "../store/useAuthStore";

export function useSelectedBranch() {
  const { data: me } = useMe();
  const { selectedBranchId, setSelectedBranchId } = useAuthStore();

  // The remembered branch can be one this person no longer has (removed, or access changed). Screens that use it would
  // then ask for a branch that does not exist and show nothing, so it is replaced: the only branch if there is just one,
  // otherwise "no branch chosen" so the person is asked to pick.
  const known = me?.branches;
  const stale = !!known && !!selectedBranchId && !known.some((b) => b.id === selectedBranchId);
  const fallback = known && known.length === 1 ? known[0]!.id : null;

  useEffect(() => {
    if (stale) setSelectedBranchId(fallback);
  }, [stale, fallback, setSelectedBranchId]);

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
    branchId: stale ? fallback : selectedBranchId,
    /** False until the person's branches have loaded. */
    ready: !!me,
    branches: me?.branches ?? [],
    setBranchId: setSelectedBranchId,
  };
}
