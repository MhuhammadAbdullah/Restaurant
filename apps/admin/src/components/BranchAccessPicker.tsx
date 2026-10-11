"use client";

import { SearchInput } from "./SearchFilterBar";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";

type Branch = { id: string; name: string; code?: string };

/** Branch access as a dropdown: tick branches (or "All branches"), changes are saved once, when the dropdown closes. */
export function BranchAccessPicker({
  branches,
  allBranches,
  selectedIds,
  disabled = false,
  onSave,
}: {
  branches: Branch[];
  allBranches: boolean;
  selectedIds: string[];
  disabled?: boolean;
  onSave: (next: { allBranchesAccess: boolean; branchIds: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftAll, setDraftAll] = useState(allBranches);
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [q, setQ] = useState("");

  function onOpenChange(next: boolean) {
    if (next) {
      setDraftAll(allBranches);
      setDraftIds(selectedIds);
      setQ("");
    } else {
      const same = draftAll === allBranches && (draftAll || JSON.stringify([...draftIds].sort()) === JSON.stringify([...selectedIds].sort()));
      if (!same) onSave(draftAll ? { allBranchesAccess: true, branchIds: [] } : { allBranchesAccess: false, branchIds: draftIds });
    }
    setOpen(next);
  }

  const toggle = (id: string) => setDraftIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const shown = branches.filter((b) => !q.trim() || b.name.toLowerCase().includes(q.trim().toLowerCase()));
  const selected = branches.filter((b) => selectedIds.includes(b.id));

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild disabled={disabled}>
        <button type="button" className="flex min-h-[2.5rem] w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-left text-sm hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:border-brand-red">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {allBranches ? (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">All branches</span>
            ) : selected.length === 0 ? (
              <span className="text-neutral-400">Select branches</span>
            ) : (
              <>
                {selected.slice(0, 3).map((b) => (
                  <span key={b.id} className="max-w-[10rem] truncate rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-brand-red">{b.name}</span>
                ))}
                {selected.length > 3 && <span className="text-xs text-neutral-500">+{selected.length - 3} more</span>}
              </>
            )}
          </span>
          <span className="text-[10px] text-neutral-400">▼</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-[16rem] rounded-xl border border-neutral-200 bg-white p-2 shadow-xl">
          <label className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm ${draftAll ? "border-brand-red bg-red-50 font-medium text-brand-red" : "border-neutral-200 text-neutral-800 hover:bg-neutral-50"}`}>
            All branches
            <input type="checkbox" checked={draftAll} onChange={(e) => setDraftAll(e.target.checked)} className="h-4 w-4 accent-[#ED2320]" />
          </label>
          <div className={draftAll ? "pointer-events-none opacity-40" : ""}>
            {branches.length > 6 && <SearchInput value={q} onChange={setQ} placeholder="Search branches..." widthClass="my-2 w-full" compact />}
            <div className="modal-scroll mt-2 max-h-60 space-y-0.5 overflow-y-auto">
              {shown.map((b) => {
                const on = draftIds.includes(b.id);
                return (
                  <label key={b.id} className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm ${on ? "bg-red-50 font-medium text-brand-red" : "text-neutral-700 hover:bg-neutral-50"}`}>
                    {b.name}
                    <input type="checkbox" checked={on} onChange={() => toggle(b.id)} className="h-4 w-4 accent-[#ED2320]" />
                  </label>
                );
              })}
              {shown.length === 0 && <p className="px-3 py-3 text-sm text-neutral-400">No branches match</p>}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2">
            <span className="text-[11px] text-neutral-400">{draftAll ? "All branches" : `${draftIds.length} selected`}</span>
            <Popover.Close asChild>
              <button type="button" className="rounded-lg bg-brand-red px-3 py-1 text-xs font-medium text-white">Done</button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
