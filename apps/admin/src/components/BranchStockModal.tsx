"use client";

import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useSelectedBranch } from "../lib/useSelectedBranch";
import { toast } from "../store/useToastStore";
import { CloseIcon } from "./icons";
import { StatusToggle } from "./StatusToggle";

export type BranchAvailability = { branchId: string; isAvailable: boolean }[];

/** Branches where this item is switched off, e.g. "Sold out at DHA Phase 6". Used on the product and deal lists. */
export function outOfStockBranchCount(availability: BranchAvailability | undefined): number {
  return (availability ?? []).filter((a) => !a.isAvailable).length;
}

/**
 * Per-branch stock switch for one product or deal. Turning a branch off marks the item "Sold out" on that branch's
 * website (it stays visible but cannot be ordered, and carts that already hold it are told to remove it).
 */
export function BranchStockModal({
  kind,
  itemId,
  itemName,
  availability,
  onClose,
  onChanged,
}: {
  kind: "products" | "deals" | "options";
  itemId: string;
  itemName: string;
  availability: BranchAvailability | undefined;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const { branches } = useSelectedBranch();
  const [state, setState] = useState<Record<string, boolean>>(() => Object.fromEntries((availability ?? []).map((a) => [a.branchId, a.isAvailable])));
  const [busy, setBusy] = useState<string | null>(null);
  const path =
    kind === "products"
      ? `/catalog/products/${itemId}/branch-availability`
      : kind === "deals"
        ? `/deals/${itemId}/branch-availability`
        : `/catalog/choice-groups/options/${itemId}/stock`;

  async function setStock(branchId: string, inStock: boolean) {
    setBusy(branchId);
    try {
      await api.patch(path, { branchId, isAvailable: inStock });
      setState((s) => ({ ...s, [branchId]: inStock }));
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update stock");
    } finally {
      setBusy(null);
    }
  }

  async function setAll(inStock: boolean) {
    for (const b of branches) if ((state[b.id] ?? true) !== inStock || !(b.id in state)) await setStock(b.id, inStock);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-base font-semibold text-neutral-900">Stock by branch</p>
            <p className="truncate text-xs text-neutral-500">{itemName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-5">
          <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            Switch a branch off when this {kind === "options" ? "option" : "item"} runs out. Customers of that branch see it as <strong>{kind === "options" ? "Not available" : "Sold out"}</strong> and cannot {kind === "options" ? "pick" : "order"} it. Switch it back on when it is available again.
          </p>
          {branches.length > 1 && (
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={busy !== null} onClick={() => setAll(false)} className="rounded-lg border border-brand-red px-3 py-1.5 text-xs font-medium text-brand-red hover:bg-red-50 disabled:opacity-50">
                Sold out everywhere
              </button>
              <button type="button" disabled={busy !== null} onClick={() => setAll(true)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                In stock everywhere
              </button>
            </div>
          )}
          {branches.map((b) => {
            const inStock = state[b.id] ?? false;
            const notOffered = !(b.id in state);
            return (
              <div key={b.id} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${inStock ? "border-neutral-200" : "border-brand-red/30 bg-red-50/50"}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{b.name}</p>
                  <p className={`text-xs ${inStock ? "text-green-600" : "text-brand-red"}`}>{inStock ? "In stock" : notOffered ? "Not offered here" : kind === "options" ? "Not available" : "Sold out"}</p>
                </div>
                <StatusToggle active={inStock} disabled={busy === b.id} onClick={() => setStock(b.id, !inStock)} onLabel="In stock: click to mark sold out" offLabel="Sold out: click to mark in stock" />
              </div>
            );
          })}
          {branches.length === 0 && <p className="py-4 text-center text-sm text-neutral-400">No branches available.</p>}
        </div>
      </div>
    </div>
  );
}
