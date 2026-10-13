"use client";

import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { toast } from "../../store/useToastStore";
import { confirmDialog } from "../../store/useConfirmStore";
import { TrashIcon } from "../icons";

/** Which rows are ticked in a table. Ids that are no longer in the list (filtered out, deleted) are dropped automatically. */
export function useSelection(visibleIds: string[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const selected = visibleIds.filter((id) => picked.has(id));
  const allChecked = visibleIds.length > 0 && selected.length === visibleIds.length;
  return {
    selected,
    has: (id: string) => picked.has(id),
    toggle: (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    toggleAll: () => setPicked(allChecked ? new Set() : new Set(visibleIds)),
    clear: () => setPicked(new Set()),
    allChecked,
    someChecked: selected.length > 0 && !allChecked,
  };
}

/** The tick box at the start of a table row, and in the heading to tick everything shown. */
export function CheckTh({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  return (
    <th className="w-10 px-4 py-3">
      <input type="checkbox" aria-label="Select all" checked={checked} ref={(el) => { if (el) el.indeterminate = indeterminate; }} onChange={onChange} className="h-4 w-4 cursor-pointer accent-[#ED2320]" />
    </th>
  );
}

export function CheckTd({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <td className="w-10 px-4 py-3">
      <input type="checkbox" aria-label={`Select ${label}`} checked={checked} onChange={onChange} className="h-4 w-4 cursor-pointer accent-[#ED2320]" />
    </td>
  );
}

/** Appears above the table once something is ticked. */
export function BulkBar({ count, onDelete, onClear, busy, noun }: { count: number; onDelete: () => void; onClear: () => void; busy: boolean; noun: string }) {
  if (count === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5" role="region" aria-label="Selected rows">
      <p className="text-sm font-medium text-red-900">{count} {noun}{count === 1 ? "" : "s"} selected</p>
      <button type="button" onClick={onClear} disabled={busy} className="rounded-lg px-2.5 py-1 text-sm text-neutral-600 hover:bg-white">Clear</button>
      <button type="button" onClick={onDelete} disabled={busy} className="ml-auto flex items-center gap-2 rounded-lg bg-brand-red px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
        <TrashIcon size={13} /> {busy ? "Deleting..." : `Delete selected (${count})`}
      </button>
    </div>
  );
}

export type BulkDeleteResult = { removed: number; deactivated: number; failed: { id: string; name: string; reason: string }[] };

/**
 * Asks once, deletes the chosen rows and tells the user plainly what happened, including any that could not be deleted and why.
 * Returns true if the list should be reloaded.
 */
export async function bulkDelete(opts: { path: string; ids: string[]; noun: string; message: string; deactivatedText?: string }): Promise<boolean> {
  const n = opts.ids.length;
  if (!(await confirmDialog({ title: `Delete ${n} ${opts.noun}${n === 1 ? "" : "s"}?`, message: opts.message, confirmLabel: `Delete ${n}`, tone: "danger" }))) return false;
  try {
    const r = await api.post<BulkDeleteResult>(opts.path, { ids: opts.ids });
    const parts: string[] = [];
    if (r.removed > 0) parts.push(`${r.removed} deleted`);
    if (r.deactivated > 0) parts.push(`${r.deactivated} ${opts.deactivatedText ?? "switched off (they have history)"}`);
    if (r.failed.length > 0) parts.push(`${r.failed.length} not deleted`);
    if (r.failed.length === 0) toast.success(parts.join(", ") + ".");
    else toast.error(`${parts.join(", ")}. ${r.failed[0]!.name}: ${r.failed[0]!.reason}`);
    return true;
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Could not delete");
    return false;
  }
}
