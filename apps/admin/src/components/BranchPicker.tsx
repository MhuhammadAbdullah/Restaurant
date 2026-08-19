"use client";

import { useSelectedBranch } from "../lib/useSelectedBranch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const ALL_BRANCHES = "__all__";

export function BranchPicker() {
  const { branchId, branches, setBranchId } = useSelectedBranch();
  if (branches.length <= 1) return null;

  return (
    <Select value={branchId ?? ALL_BRANCHES} onValueChange={(v) => setBranchId(v === ALL_BRANCHES ? null : v)}>
      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_BRANCHES}>All Branches</SelectItem>
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
