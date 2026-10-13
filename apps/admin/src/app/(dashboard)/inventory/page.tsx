"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { INVENTORY_UNITS, fromBaseQty, toBaseQty, type InventoryUnit } from "@restaurant/validation";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { toast } from "../../../store/useToastStore";
import { confirmDialog } from "../../../store/useConfirmStore";
import { BranchSelect, Dropdown, Field, INPUT, Modal, UnitSelect, showQty, useInventoryBranch, type StockRow } from "../../../components/inventory/shared";
import { BulkImportModal } from "../../../components/inventory/BulkImportModal";
import { GettingStarted } from "../../../components/inventory/GettingStarted";
import { Th, ThFilter } from "../../../components/inventory/ThFilter";
import { BulkBar, CheckTd, CheckTh, bulkDelete, useSelection } from "../../../components/inventory/bulk";
import { EditIcon, TrashIcon } from "../../../components/icons";

type Summary = { itemCount: number; lowCount: number; outCount: number; stockValue: number };
type Mode = "STOCK_IN" | "STOCK_OUT" | "WASTE" | "COUNT";
type Status = "ALL" | "LOW" | "OUT";
type Sort = "name" | "stock" | "value";

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "STOCK_IN", label: "Stock in", hint: "Goods received or added to the shelf." },
  { key: "STOCK_OUT", label: "Stock out", hint: "Taken out for another use (not an order)." },
  { key: "WASTE", label: "Waste", hint: "Spoiled, spilled or expired. Counted in the waste report." },
  { key: "COUNT", label: "Stock count", hint: "Type what is really on the shelf; the difference is recorded." },
];
const WASTE_REASONS = ["Expired", "Spoiled", "Spilled or dropped", "Staff meal", "Returned by customer"];

/** The little bar under the stock figure: how far above the alert level the stock is. */
function LevelBar({ row }: { row: StockRow }) {
  const target = row.effectiveMinLevel > 0 ? row.effectiveMinLevel * 2 : Math.max(row.quantity, 1);
  const pct = row.out ? 0 : Math.min(100, Math.round((row.quantity / target) * 100));
  const tone = row.out ? "bg-red-500" : row.low ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${row.out ? 100 : Math.max(pct, 4)}%`, opacity: row.out ? 0.25 : 1 }} />
    </div>
  );
}

function StatusChip({ row }: { row: StockRow }) {
  if (row.out) return <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">Finished</span>;
  if (row.low) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Running low</span>;
  return <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">OK</span>;
}

function csvCell(v: string | number) {
  const t = String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export default function InventoryStockPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "inventoryStock.create");
  const canEdit = hasPermission(me, "inventoryStock.edit");
  const canDelete = hasPermission(me, "inventoryStock.delete");
  const { branchId, setBranchId, branches } = useInventoryBranch();
  const branchName = branches.find((b) => b.id === branchId)?.name ?? "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("ALL");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [showInactive, setShowInactive] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["inventory-stock", branchId, showInactive],
    queryFn: () => api.get<StockRow[]>(`/inventory/stock?branchId=${branchId}${showInactive ? "&includeInactive=true" : ""}`),
    enabled: !!branchId,
  });
  const { data: summary } = useQuery({ queryKey: ["inventory-summary", branchId], queryFn: () => api.get<Summary>(`/inventory/summary?branchId=${branchId}`), enabled: !!branchId });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
  };

  const all = useMemo(() => rows ?? [], [rows]);
  const categories = useMemo(() => [...new Set(all.map((r) => r.category).filter(Boolean))].sort(), [all]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = all.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)) &&
        (!category || r.category === category) &&
        (status === "ALL" || (status === "OUT" ? r.out : r.low && !r.out)),
    );
    return [...list].sort((a, b) => (sort === "stock" ? a.quantity / Math.max(a.effectiveMinLevel, 1) - b.quantity / Math.max(b.effectiveMinLevel, 1) : sort === "value" ? b.value - a.value : a.name.localeCompare(b.name)));
  }, [all, search, category, status, sort]);
  const attention = useMemo(() => all.filter((r) => r.status === "ACTIVE" && (r.out || r.low)).sort((a, b) => Number(b.out) - Number(a.out)).slice(0, 5), [all]);

  const sel = useSelection(shown.map((r) => r.id));
  const [bulkBusy, setBulkBusy] = useState(false);
  async function removeSelected() {
    setBulkBusy(true);
    try {
      const reload = await bulkDelete({ path: "/inventory/items/bulk-delete", ids: sel.selected, noun: "item", message: "They are removed. Items that have history or are used in an order are only switched off, so reports stay correct.", deactivatedText: "switched off (they have history)" });
      if (reload) { sel.clear(); refresh(); }
    } finally {
      setBulkBusy(false);
    }
  }

  const [editing, setEditing] = useState<StockRow | "new" | null>(null);
  const [acting, setActing] = useState<{ row: StockRow; mode: Mode } | null>(null);
  const [importing, setImporting] = useState(false);

  async function remove(r: StockRow) {
    if (!(await confirmDialog({ title: "Remove this item?", message: `"${r.name}" is removed. If it has history or is used in a recipe it is only switched off, so reports stay correct.`, confirmLabel: "Remove", tone: "danger" }))) return;
    try {
      const res = await api.delete<{ removed: boolean; deactivated: boolean }>(`/inventory/items/${r.id}`);
      toast.success(res.deactivated ? "Item switched off (it has history)." : "Item removed.");
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove the item");
    }
  }

  function exportCsv() {
    const head = ["Item", "Category", "Code", "Unit", "In stock", "Alert at", "Cost per unit (Rs.)", "Value (Rs.)", "Status"];
    const lines = shown.map((r) => [r.name, r.category, r.sku, INVENTORY_UNITS[r.unit].label, fromBaseQty(r.quantity, r.unit), r.effectiveMinLevel ? fromBaseQty(r.effectiveMinLevel, r.unit) : "", r.costPerUnit / 100, Math.max(0, r.value) / 100, r.out ? "Finished" : r.low ? "Running low" : "OK"].map(csvCell).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stock-${branchName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const steps = [
    { done: all.length > 0, title: "Add your ingredients", text: "Chicken, oil, buns, boxes... anything you buy and use.", action: canCreate ? { label: "Add items", onClick: () => setImporting(true) } : undefined },
    { done: all.some((r) => r.quantity > 0), title: "Put in today's stock", text: "Use + In on an item, or type the stock when adding many items. After that, record Out and Waste as it happens.", action: undefined },
  ];

  const chip = (key: Status, label: string, count?: number, tone = "") => (
    <button key={key} type="button" onClick={() => setStatus(key)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${status === key ? "border-brand-red bg-red-50 text-brand-red" : `border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 ${tone}`}`}>
      {label}
      {count !== undefined && <span className="ml-1.5 text-neutral-400">{count}</span>}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <BranchSelect value={branchId} onChange={setBranchId} branches={branches} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items, categories or codes" className={`${INPUT} !w-full sm:!w-72`} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {all.length > 0 && (
            <button type="button" onClick={exportCsv} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export</button>
          )}
          {canCreate && (
            <>
              <button type="button" onClick={() => setImporting(true)} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Add many</button>
              <button type="button" onClick={() => setEditing("new")} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Add item</button>
            </>
          )}
        </div>
      </div>

      <GettingStarted steps={steps} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Items", value: summary?.itemCount ?? "-", tone: "text-neutral-900", go: "ALL" as Status },
          { label: "Running low", value: summary?.lowCount ?? "-", tone: (summary?.lowCount ?? 0) > 0 ? "text-amber-600" : "text-neutral-900", go: "LOW" as Status },
          { label: "Finished", value: summary?.outCount ?? "-", tone: (summary?.outCount ?? 0) > 0 ? "text-red-600" : "text-neutral-900", go: "OUT" as Status },
          { label: "Stock value", value: summary ? formatPaisa(summary.stockValue) : "-", tone: "text-neutral-900", go: null },
        ].map((c) => (
          <button key={c.label} type="button" disabled={!c.go} onClick={() => c.go && setStatus(c.go)} className="rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition enabled:hover:border-brand-red disabled:cursor-default">
            <p className="text-xs text-neutral-500">{c.label}</p>
            <p className={`mt-1 text-xl font-semibold ${c.tone}`}>{c.value}</p>
          </button>
        ))}
      </div>

      {attention.length > 0 && status === "ALL" && !search && !category && (
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Needs your attention at {branchName}</p>
          <div className="mt-2 divide-y divide-amber-100">
            {attention.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <p className="text-sm text-amber-900">
                  <b>{r.name}</b> {r.out ? "is finished" : `is running low: ${showQty(r.quantity, r.unit)} left`}
                </p>
                {canEdit && (
                  <button type="button" onClick={() => setActing({ row: r, mode: "STOCK_IN" })} className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-green-700 shadow-sm ring-1 ring-green-200 hover:bg-green-50">+ Add stock</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {chip("ALL", "All", all.length)}
        {chip("LOW", "Running low", all.filter((r) => r.low && !r.out).length)}
        {chip("OUT", "Finished", all.filter((r) => r.out).length)}
        <Dropdown className="ml-auto !py-1.5 text-xs" value={sort} onChange={(v) => setSort(v as Sort)} ariaLabel="Sort" options={[{ value: "name", label: "Sort: Name" }, { value: "stock", label: "Sort: Lowest first" }, { value: "value", label: "Sort: Highest value" }]} />
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-[#ED2320]" /> Switched-off items
        </label>
      </div>

      {canDelete && <BulkBar count={sel.selected.length} noun="item" busy={bulkBusy} onDelete={() => void removeSelected()} onClear={sel.clear} />}

      {/* Phones: one card per item */}
      <div className="mt-3 space-y-2 md:hidden">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-neutral-400">Loading...</p>
        ) : shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">{all.length === 0 ? "No items yet. Add your first ingredient." : "Nothing matches."}</p>
        ) : (
          shown.map((r) => (
            <div key={r.id} className={`rounded-xl border border-neutral-200 bg-white p-3 shadow-sm ${r.status === "INACTIVE" ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                {canDelete && <input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => sel.toggle(r.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#ED2320]" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-neutral-900">{r.name}</p>
                  <p className="text-xs text-neutral-400">{[r.category, r.sku].filter(Boolean).join(" · ") || INVENTORY_UNITS[r.unit].name}</p>
                </div>
                <StatusChip row={r} />
              </div>
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <p className={`text-lg font-semibold ${r.out ? "text-red-600" : r.low ? "text-amber-600" : "text-neutral-900"}`}>{showQty(r.quantity, r.unit)}</p>
                  <LevelBar row={r} />
                </div>
                <p className="text-xs text-neutral-500">{formatPaisa(Math.max(0, r.value))}</p>
              </div>
              {(canEdit || canDelete) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {canEdit && <><button type="button" onClick={() => setActing({ row: r, mode: "STOCK_IN" })} className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700">+ In</button>
                  <button type="button" onClick={() => setActing({ row: r, mode: "STOCK_OUT" })} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700">Out</button>
                  <button type="button" onClick={() => setActing({ row: r, mode: "WASTE" })} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700">Waste</button>
                  <button type="button" onClick={() => setActing({ row: r, mode: "COUNT" })} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700">Count</button>
                  <button type="button" onClick={() => setEditing(r)} title="Edit" aria-label="Edit" className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-red hover:bg-red-50"><EditIcon size={14} /></button></>}
                  {canDelete && <button type="button" onClick={() => void remove(r)} title="Remove" aria-label="Remove" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"><TrashIcon size={14} /></button>}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Computers: a table */}
      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm md:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              {canDelete && <CheckTh checked={sel.allChecked} indeterminate={sel.someChecked} onChange={sel.toggleAll} />}
              <ThFilter label="Item" value={search} onChange={setSearch} placeholder="Name, category or code" />
              <ThFilter label="Category" value={category} onChange={setCategory} options={categories.map((c) => ({ value: c, label: c }))} />
              <Th>In stock</Th>
              <ThFilter label="Status" value={status === "ALL" ? "" : status} onChange={(v) => setStatus((v || "ALL") as Status)} options={[{ value: "LOW", label: "Running low" }, { value: "OUT", label: "Finished" }]} />
              <Th>Alert at</Th>
              <Th>Cost</Th>
              <Th>Value</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              <tr><td colSpan={9} className="p-6 text-center text-neutral-400">Loading...</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-neutral-500">{all.length === 0 ? "No items yet. Add your first ingredient, or paste a whole list with Add many." : "Nothing matches."}</td></tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id} className={`transition hover:bg-neutral-50/60 ${r.status === "INACTIVE" ? "opacity-50" : ""}`}>
                  {canDelete && <CheckTd checked={sel.has(r.id)} onChange={() => sel.toggle(r.id)} label={r.name} />}
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{r.name}</p>
                    <p className="text-xs text-neutral-400">{r.sku || INVENTORY_UNITS[r.unit].name}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{r.category || <span className="text-neutral-300">-</span>}</td>
                  <td className="px-4 py-3">
                    <p className={`font-semibold ${r.out ? "text-red-600" : r.low ? "text-amber-600" : "text-neutral-900"}`}>{showQty(r.quantity, r.unit)}</p>
                    <LevelBar row={r} />
                  </td>
                  <td className="px-4 py-3"><StatusChip row={r} /></td>
                  <td className="px-4 py-3 text-neutral-500">{r.effectiveMinLevel > 0 ? showQty(r.effectiveMinLevel, r.unit) : "-"}</td>
                  <td className="px-4 py-3 text-neutral-500">{r.costPerUnit > 0 ? `${formatPaisa(r.costPerUnit)} / ${INVENTORY_UNITS[r.unit].label}` : "-"}</td>
                  <td className="px-4 py-3 text-neutral-700">{formatPaisa(Math.max(0, r.value))}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {canEdit && (
                        <>
                          <button type="button" onClick={() => setActing({ row: r, mode: "STOCK_IN" })} className="rounded-lg border border-green-300 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50">+ In</button>
                          <button type="button" onClick={() => setActing({ row: r, mode: "STOCK_OUT" })} className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Out</button>
                          <button type="button" onClick={() => setActing({ row: r, mode: "WASTE" })} className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Waste</button>
                          <button type="button" onClick={() => setActing({ row: r, mode: "COUNT" })} className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Count</button>
                          <button type="button" onClick={() => setEditing(r)} title="Edit" aria-label="Edit" className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-red hover:bg-red-50"><EditIcon size={14} /></button>
                        </>
                      )}
                      {canDelete && <button type="button" onClick={() => void remove(r)} title="Remove" aria-label="Remove" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"><TrashIcon size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && <ItemModal row={editing === "new" ? null : editing} branchId={branchId} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {acting && <StockModal row={acting.row} mode={acting.mode} branchId={branchId} onClose={() => setActing(null)} onSaved={() => { setActing(null); refresh(); }} />}
      {importing && <BulkImportModal branchId={branchId} branchName={branchName} onClose={() => setImporting(false)} onDone={() => { setImporting(false); refresh(); }} />}
    </div>
  );
}

function ItemModal({ row, branchId, categories, onClose, onSaved }: { row: StockRow | null; branchId: string; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: row?.name ?? "",
    sku: row?.sku ?? "",
    category: row?.category ?? "",
    unit: (row?.unit ?? "KG") as InventoryUnit,
    minLevel: row ? String(fromBaseQty(row.minLevel, row.unit)) : "",
    costPerUnit: row ? String(row.costPerUnit / 100) : "",
    notes: row?.notes ?? "",
    status: row?.status ?? ("ACTIVE" as "ACTIVE" | "INACTIVE"),
  });
  const [openingQty, setOpeningQty] = useState("");
  const [branchLevel, setBranchLevel] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Give the item a name");
    setSaving(true);
    try {
      const body = { name: form.name.trim(), sku: form.sku.trim(), category: form.category.trim(), unit: form.unit, minLevel: Number(form.minLevel || 0), costPerUnit: Number(form.costPerUnit || 0), notes: form.notes.trim(), status: form.status };
      const saved = row ? await api.patch<{ id: string }>(`/inventory/items/${row.id}`, body) : await api.post<{ id: string }>("/inventory/items", body);
      if (!row && Number(openingQty) > 0 && branchId) await api.post("/inventory/stock/adjust", { branchId, itemId: saved.id, mode: "COUNT", quantity: Number(openingQty), unit: form.unit, note: "Opening stock" });
      if (branchLevel.trim() !== "" && branchId) await api.put(`/inventory/stock/min-level?itemId=${saved.id}`, { branchId, level: Number(branchLevel) });
      toast.success("Saved.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={row ? "Edit item" : "Add item"} onClose={onClose} busy={saving}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name *">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={INPUT} placeholder="e.g. Chicken, Cooking oil, Burger box" maxLength={120} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Counted in *" hint={row ? "Can only change within the same kind." : "How you buy and count it."}>
            <UnitSelect value={form.unit} onChange={(u) => set("unit", u)} family={row ? INVENTORY_UNITS[row.unit].family : undefined} className="!w-full" />
          </Field>
          <Field label="Category">
            <input value={form.category} onChange={(e) => set("category", e.target.value)} className={INPUT} placeholder="Meat, Dairy, Packaging" maxLength={60} list="inv-categories" />
            <datalist id="inv-categories">{categories.map((c) => (<option key={c} value={c} />))}</datalist>
          </Field>
        </div>
        {!row && (
          <Field label={`Stock right now (${INVENTORY_UNITS[form.unit].label})`} hint="Optional. What is on the shelf today.">
            <input type="number" min={0} step="any" value={openingQty} onChange={(e) => setOpeningQty(e.target.value)} className={INPUT} placeholder="0" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Alert when below (${INVENTORY_UNITS[form.unit].label})`} hint="You are told when stock falls to this level.">
            <input type="number" min={0} step="any" value={form.minLevel} onChange={(e) => set("minLevel", e.target.value)} className={INPUT} placeholder="0" />
          </Field>
          <Field label={`Cost per ${INVENTORY_UNITS[form.unit].label} (Rs.)`} hint="For stock value and food cost.">
            <input type="number" min={0} step="any" value={form.costPerUnit} onChange={(e) => set("costPerUnit", e.target.value)} className={INPUT} placeholder="0" />
          </Field>
        </div>
        {row && branchId && (
          <Field label={`Alert level for this branch only (${INVENTORY_UNITS[form.unit].label})`} hint="Leave empty to use the level above.">
            <input type="number" min={0} step="any" value={branchLevel} onChange={(e) => setBranchLevel(e.target.value)} className={INPUT} />
          </Field>
        )}
        <Field label="Code (optional)">
          <input value={form.sku} onChange={(e) => set("sku", e.target.value)} className={INPUT} maxLength={40} />
        </Field>
        {row && (
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={form.status === "ACTIVE"} onChange={(e) => set("status", e.target.checked ? "ACTIVE" : "INACTIVE")} className="accent-[#ED2320]" /> Item is in use
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
          <button disabled={saving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

function StockModal({ row, mode: initial, branchId, onClose, onSaved }: { row: StockRow; mode: Mode; branchId: string; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>(row.unit);
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const info = MODES.find((m) => m.key === mode)!;

  const n = Number(qty);
  const valid = qty.trim() !== "" && !Number.isNaN(n) && n >= 0;
  const base = valid ? toBaseQty(n, unit) : 0;
  const after = !valid ? null : mode === "STOCK_IN" ? row.quantity + base : mode === "COUNT" ? base : row.quantity - base;
  const tooMuch = (mode === "STOCK_OUT" || mode === "WASTE") && valid && base > row.quantity;
  const quick = mode === "STOCK_IN" || mode === "STOCK_OUT" || mode === "WASTE" ? (unit === "G" || unit === "ML" || unit === "MG" || unit === "CL" ? [100, 250, 500, 1000] : [1, 5, 10, 25]) : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return toast.error("Enter a quantity");
    if (mode !== "COUNT" && n <= 0) return toast.error("Enter a quantity above zero");
    if (tooMuch) return toast.error(`Only ${showQty(row.quantity, row.unit)} is in stock.`);
    setSaving(true);
    try {
      await api.post("/inventory/stock/adjust", { branchId, itemId: row.id, mode, quantity: n, unit, note: note.trim(), ...(mode === "STOCK_IN" && cost.trim() ? { unitCost: Number(cost) } : {}) });
      toast.success("Stock updated.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update the stock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={row.name} onClose={onClose} busy={saving}>
      <p className="-mt-2 text-sm text-neutral-500">Now in stock: <b className="text-neutral-900">{showQty(row.quantity, row.unit)}</b></p>
      <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-lg border border-neutral-300 text-xs font-medium">
        {MODES.map((m) => (
          <button key={m.key} type="button" onClick={() => setMode(m.key)} className={`px-2 py-2 ${mode === m.key ? "bg-brand-red text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-500">{info.hint}</p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div className="flex gap-2">
          <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={INPUT} placeholder={mode === "COUNT" ? "Counted quantity" : "Quantity"} autoFocus />
          <UnitSelect value={unit} onChange={setUnit} family={row.family} />
        </div>
        {quick.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button key={q} type="button" onClick={() => setQty(String((Number(qty) || 0) + q))} className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-brand-red hover:text-brand-red">+{q}</button>
            ))}
            {(mode === "STOCK_OUT" || mode === "WASTE") && (
              <button type="button" onClick={() => { setUnit(row.unit); setQty(String(fromBaseQty(row.quantity, row.unit))); }} className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-brand-red hover:text-brand-red">All of it</button>
            )}
          </div>
        )}
        {after !== null && (
          <p className={`rounded-lg px-3 py-2 text-sm ${tooMuch ? "bg-red-50 text-red-700" : "bg-neutral-50 text-neutral-700"}`}>
            {tooMuch ? `Only ${showQty(row.quantity, row.unit)} is in stock.` : <>After this: <b>{showQty(Math.round(after * 1000) / 1000, row.unit)}</b></>}
          </p>
        )}
        {mode === "STOCK_IN" && (
          <Field label={`Cost per ${INVENTORY_UNITS[unit].label} of this delivery (Rs., optional)`}>
            <input type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} className={INPUT} />
          </Field>
        )}
        <Field label={mode === "WASTE" ? "Why? (optional)" : "Note (optional)"}>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} maxLength={300} />
        </Field>
        {mode === "WASTE" && (
          <div className="-mt-1 flex flex-wrap gap-1.5">
            {WASTE_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setNote(r)} className={`rounded-full border px-2.5 py-1 text-xs ${note === r ? "border-brand-red bg-red-50 text-brand-red" : "border-neutral-200 text-neutral-600 hover:border-brand-red"}`}>{r}</button>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
          <button disabled={saving || tooMuch} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}
