"use client";

import { useEffect, useState } from "react";
import { INVENTORY_UNITS, INVENTORY_UNIT_KEYS, formatBestQty, formatQty, unitFamily, type InventoryUnit, type UnitFamily } from "@restaurant/validation";
import { useSelectedBranch } from "../../lib/useSelectedBranch";
import { CloseIcon } from "../icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export type StockRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: InventoryUnit;
  family: UnitFamily;
  status: "ACTIVE" | "INACTIVE";
  notes: string;
  /** Base units (g / ml / pcs). */
  minLevel: number;
  /** Paisa per one of `unit`. */
  costPerUnit: number;
  quantity: number;
  effectiveMinLevel: number;
  out: boolean;
  low: boolean;
  value: number;
};

export const INPUT = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-red";

/** Shows a base-unit quantity in the item's own unit ("2.5 kg"). */
export const showQty = (base: number, unit: InventoryUnit) => formatQty(base, unit);
export { formatBestQty };

/** The branch inventory pages work on: the one chosen in the admin header, or the first the person can use. */
export function useInventoryBranch() {
  const { branchId, branches } = useSelectedBranch();
  const [local, setLocal] = useState<string>("");
  useEffect(() => {
    if (!local && branches.length > 0) setLocal(branchId && branches.some((b) => b.id === branchId) ? branchId : branches[0]!.id);
  }, [branchId, branches, local]);
  return { branchId: local, setBranchId: setLocal, branches };
}

export type DropdownOption = { value: string; label: string; disabled?: boolean; /** A heading shown above this option when it differs from the option before it. */ group?: string };

/**
 * The one dropdown used across Inventory: same look as the rest of the admin (rounded list, red highlight, tick on the
 * chosen row). An option whose value is "" (such as "All items") is allowed.
 */
export function Dropdown({ value, onChange, options, placeholder, ariaLabel, className = "", disabled, display }: { value: string; onChange: (value: string) => void; options: DropdownOption[]; placeholder?: string; ariaLabel?: string; className?: string; disabled?: boolean; display?: string }) {
  const EMPTY = "__empty__";
  const hasEmptyOption = options.some((o) => o.value === "");
  const current = value === "" && hasEmptyOption ? EMPTY : value;
  return (
    <Select value={current} onValueChange={(v) => onChange(v === EMPTY ? "" : v)} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className={`min-w-[8rem] py-2 ${className}`}>
        <SelectValue placeholder={placeholder ?? "Choose..."}>{display}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o, i) => (
          <div key={o.value || EMPTY}>
            {o.group && o.group !== options[i - 1]?.group && <p className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 ${i === 0 ? "pt-1" : "pt-2.5"}`}>{o.group}</p>}
            <SelectItem value={o.value === "" ? EMPTY : o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}

export function BranchSelect({ value, onChange, branches, className = "" }: { value: string; onChange: (id: string) => void; branches: { id: string; name: string }[]; className?: string }) {
  if (branches.length <= 1) return branches[0] ? <span className={`rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700 ${className}`}>{branches[0].name}</span> : null;
  return <Dropdown value={value} onChange={onChange} options={branches.map((b) => ({ value: b.id, label: b.name }))} ariaLabel="Branch" className={`font-medium ${className}`} />;
}

/** All units, grouped (Weight, Volume, Count, Packaging). With `family`, only the units that can be converted to that item's unit (kg with g, lb and oz; litre with ml...). */
export function UnitSelect({ value, onChange, family, className = "" }: { value: InventoryUnit; onChange: (u: InventoryUnit) => void; family?: UnitFamily; className?: string }) {
  const keys = family ? INVENTORY_UNIT_KEYS.filter((k) => unitFamily(k) === family) : INVENTORY_UNIT_KEYS;
  return <Dropdown value={value} onChange={(v) => onChange(v as InventoryUnit)} options={keys.map((k) => ({ value: k, label: INVENTORY_UNITS[k].name, group: family ? undefined : INVENTORY_UNITS[k].group }))} ariaLabel="Unit" display={INVENTORY_UNITS[value].label} className={`min-w-[5.5rem] ${className}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-neutral-500">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] font-normal text-neutral-400">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide, busy }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; busy?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-neutral-900">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="text-neutral-400 hover:text-neutral-700">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  OPENING: { label: "Opening stock", tone: "bg-blue-50 text-blue-700" },
  PURCHASE: { label: "Purchase", tone: "bg-green-50 text-green-700" },
  STOCK_IN: { label: "Stock in", tone: "bg-green-50 text-green-700" },
  SALE: { label: "Used in order", tone: "bg-neutral-100 text-neutral-600" },
  RETURN: { label: "Order cancelled", tone: "bg-amber-50 text-amber-700" },
  STOCK_OUT: { label: "Stock out", tone: "bg-red-50 text-red-700" },
  WASTE: { label: "Waste", tone: "bg-red-50 text-red-700" },
  ADJUSTMENT: { label: "Stock count", tone: "bg-blue-50 text-blue-700" },
  TRANSFER_IN: { label: "Transfer in", tone: "bg-purple-50 text-purple-700" },
  TRANSFER_OUT: { label: "Transfer out", tone: "bg-purple-50 text-purple-700" },
};

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
