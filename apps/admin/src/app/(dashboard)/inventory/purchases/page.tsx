"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { INVENTORY_UNITS, fromBaseQty, type InventoryUnit } from "@restaurant/validation";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { confirmDialog } from "../../../../store/useConfirmStore";
import { Th, ThFilter } from "../../../../components/inventory/ThFilter";
import { BulkBar, CheckTd, CheckTh, bulkDelete, useSelection } from "../../../../components/inventory/bulk";
import { EditIcon, TrashIcon } from "../../../../components/icons";
import { BranchSelect, Dropdown, Field, INPUT, Modal, UnitSelect, dateTime, showQty, useInventoryBranch, type StockRow } from "../../../../components/inventory/shared";

type PoLine = { id: string; itemId: string; itemName: string; unit: InventoryUnit; quantity: number; receivedQty: number; unitCost: number; lineTotal: number };
type Po = { id: string; number: string; supplierId: string; status: "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED"; branchId: string; branchName: string; supplierName: string; expectedDate: string | null; notes: string; receivedAt: string | null; createdAt: string; total: number; lines: PoLine[] };
type Supplier = { id: string; name: string };

const STATUS: Record<Po["status"], { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "bg-neutral-100 text-neutral-600" },
  ORDERED: { label: "Ordered", tone: "bg-blue-50 text-blue-700" },
  RECEIVED: { label: "Received", tone: "bg-green-50 text-green-700" },
  CANCELLED: { label: "Cancelled", tone: "bg-red-50 text-red-600" },
};

export default function PurchasesPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "inventoryPurchases.create");
  const canEdit = hasPermission(me, "inventoryPurchases.edit");
  const canDelete = hasPermission(me, "inventoryPurchases.delete");
  const { branchId, setBranchId, branches } = useInventoryBranch();
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingPo, setEditingPo] = useState<Po | null>(null);
  const [prefill, setPrefill] = useState<Draft[] | undefined>(undefined);
  const [fOrder, setFOrder] = useState("");
  const [fSupplier, setFSupplier] = useState("");

  // Items that are low or finished here, with a sensible amount to buy (enough to reach double the alert level).
  const { data: low } = useQuery({ queryKey: ["inventory-low", branchId], queryFn: () => api.get<StockRow[]>(`/inventory/stock?branchId=${branchId}&onlyLow=true`), enabled: !!branchId });
  function suggestion(r: StockRow): Draft {
    const wanted = Math.max(r.effectiveMinLevel * 2 - r.quantity, r.effectiveMinLevel, 1);
    const qty = Math.ceil(fromBaseQty(wanted, r.unit) * 10) / 10;
    return { itemId: r.id, quantity: String(qty), unit: r.unit, unitCost: r.costPerUnit ? String(r.costPerUnit / 100) : "" };
  }
  const [receiving, setReceiving] = useState<Po | null>(null);
  const [view, setView] = useState<Po | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["inventory-pos", branchId, status],
    queryFn: () => api.get<Po[]>(`/inventory/purchase-orders?branchId=${branchId}${status ? `&status=${status}` : ""}`),
    enabled: !!branchId,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["inventory-pos"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
  };

  const shownPos = (data ?? []).filter((po) => (!fOrder.trim() || po.number.toLowerCase().includes(fOrder.trim().toLowerCase())) && (!fSupplier || po.supplierName === fSupplier));
  // A received order's goods are in stock, so it cannot be deleted and has no tick box.
  const sel = useSelection(shownPos.filter((p) => p.status !== "RECEIVED").map((p) => p.id));
  const [bulkBusy, setBulkBusy] = useState(false);
  const DELETE_NOTE = "Draft, ordered and cancelled orders can be deleted. A received order cannot, because its goods are already in stock.";
  async function removeSelected() {
    setBulkBusy(true);
    try {
      const reload = await bulkDelete({ path: "/inventory/purchase-orders/bulk-delete", ids: sel.selected, noun: "order", message: DELETE_NOTE });
      if (reload) { sel.clear(); refresh(); }
    } finally {
      setBulkBusy(false);
    }
  }
  async function removeOne(po: Po) {
    if (!(await confirmDialog({ title: `Delete ${po.number}?`, message: "This order is deleted for good.", confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await api.delete(`/inventory/purchase-orders/${po.id}`);
      toast.success("Order deleted.");
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete the order");
    }
  }

  async function setPoStatus(po: Po, next: "ORDERED" | "CANCELLED") {
    if (next === "CANCELLED" && !(await confirmDialog({ title: "Cancel this order?", message: `${po.number} will be marked cancelled.`, confirmLabel: "Cancel order", tone: "danger" }))) return;
    try {
      await api.patch(`/inventory/purchase-orders/${po.id}/status`, { status: next });
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not change the order");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <BranchSelect value={branchId} onChange={setBranchId} branches={branches} />
        {canCreate && (
          <button type="button" onClick={() => { setPrefill(undefined); setCreating(true); }} className="ml-auto rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New purchase order</button>
        )}
      </div>

      {canCreate && (low ?? []).length > 0 && (
        <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">{(low ?? []).length} item{(low ?? []).length === 1 ? " is" : "s are"} low or finished at this branch</p>
            <p className="truncate text-xs text-amber-800">{(low ?? []).slice(0, 4).map((r) => r.name).join(", ")}{(low ?? []).length > 4 ? ` and ${(low ?? []).length - 4} more` : ""}</p>
          </div>
          <button type="button" onClick={() => { setPrefill((low ?? []).map(suggestion)); setCreating(true); }} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-red shadow-sm ring-1 ring-brand-red/30 hover:bg-red-50">Start an order with them</button>
        </section>
      )}

      {canDelete && <BulkBar count={sel.selected.length} noun="order" busy={bulkBusy} onDelete={() => void removeSelected()} onClear={sel.clear} />}

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              {canDelete && <CheckTh checked={sel.allChecked} indeterminate={sel.someChecked} onChange={sel.toggleAll} />}
              <ThFilter label="Order" value={fOrder} onChange={setFOrder} placeholder="Order number" />
              <ThFilter label="Supplier" value={fSupplier} onChange={setFSupplier} options={[...new Set((data ?? []).map((p) => p.supplierName))].sort().map((n) => ({ value: n, label: n }))} />
              <Th>Items</Th>
              <Th>Total</Th>
              <ThFilter label="Status" value={status} onChange={setStatus} options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              <tr><td colSpan={7} className="p-6 text-center text-neutral-400">Loading...</td></tr>
            ) : (data ?? []).length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-neutral-500">No purchase orders yet.</td></tr>
            ) : (
              shownPos.map((po) => (
                <tr key={po.id}>
                  {canDelete && (po.status === "RECEIVED" ? <td className="w-10 px-4 py-3" /> : <CheckTd checked={sel.has(po.id)} onChange={() => sel.toggle(po.id)} label={po.number} />)}
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setView(po)} className="font-semibold text-neutral-900 hover:text-brand-red">{po.number}</button>
                    <p className="text-xs text-neutral-400">{dateTime(po.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{po.supplierName}</td>
                  <td className="px-4 py-3 text-neutral-500">{po.lines.length} item{po.lines.length === 1 ? "" : "s"}</td>
                  <td className="px-4 py-3 text-neutral-900">{formatPaisa(po.total)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS[po.status].tone}`}>{STATUS[po.status].label}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {canEdit && po.status === "DRAFT" && <button type="button" onClick={() => void setPoStatus(po, "ORDERED")} className="rounded-lg border border-blue-300 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">Mark ordered</button>}
                      {canEdit && (po.status === "ORDERED" || po.status === "DRAFT") && <button type="button" onClick={() => setReceiving(po)} className="rounded-lg border border-green-300 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50">Receive</button>}
                      {canEdit && (po.status === "ORDERED" || po.status === "DRAFT") && <button type="button" onClick={() => void setPoStatus(po, "CANCELLED")} className="rounded-lg px-2.5 py-1 text-xs font-medium text-neutral-400 hover:bg-red-50 hover:text-red-600">Cancel</button>}
                      {canEdit && (po.status === "ORDERED" || po.status === "DRAFT") && <button type="button" onClick={() => setEditingPo(po)} title="Edit" aria-label="Edit" className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-red hover:bg-red-50"><EditIcon size={14} /></button>}
                      {canDelete && po.status !== "RECEIVED" && <button type="button" onClick={() => void removeOne(po)} title="Delete" aria-label="Delete" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"><TrashIcon size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && <NewPo branchId={branchId} prefill={prefill} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} />}
      {editingPo && <NewPo branchId={editingPo.branchId} editing={editingPo} onClose={() => setEditingPo(null)} onSaved={() => { setEditingPo(null); refresh(); }} />}
      {receiving && <ReceivePo po={receiving} onClose={() => setReceiving(null)} onSaved={() => { setReceiving(null); refresh(); }} />}
      {view && (
        <Modal title={`${view.number} · ${view.supplierName}`} onClose={() => setView(null)} wide>
          <p className="-mt-2 text-xs text-neutral-500">{view.branchName} · {STATUS[view.status].label}{view.receivedAt ? ` · received ${dateTime(view.receivedAt)}` : ""}</p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-neutral-500"><tr><th className="py-1.5 font-medium">Item</th><th className="py-1.5 font-medium">Ordered</th><th className="py-1.5 font-medium">Received</th><th className="py-1.5 text-right font-medium">Total</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {view.lines.map((l) => (
                <tr key={l.id}><td className="py-2">{l.itemName}</td><td className="py-2">{showQty(l.quantity, l.unit)}</td><td className="py-2">{view.status === "RECEIVED" ? showQty(l.receivedQty, l.unit) : "-"}</td><td className="py-2 text-right">{formatPaisa(l.lineTotal)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-right text-sm font-semibold">Total {formatPaisa(view.total)}</p>
          {view.notes && <p className="mt-2 text-xs text-neutral-500">Note: {view.notes}</p>}
        </Modal>
      )}
    </div>
  );
}

type Draft = { itemId: string; quantity: string; unit: InventoryUnit; unitCost: string };

function NewPo({ branchId, prefill, editing, onClose, onSaved }: { branchId: string; prefill?: Draft[]; editing?: Po; onClose: () => void; onSaved: () => void }) {
  const { data: suppliers } = useQuery({ queryKey: ["inventory-suppliers-active"], queryFn: () => api.get<Supplier[]>("/inventory/suppliers") });
  const { data: items } = useQuery({ queryKey: ["inventory-items-all"], queryFn: () => api.get<StockRow[]>("/inventory/stock") });
  const [supplierId, setSupplierId] = useState(editing?.supplierId ?? "");
  const [expected, setExpected] = useState(editing?.expectedDate ? editing.expectedDate.slice(0, 10) : "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [lines, setLines] = useState<Draft[]>(
    editing
      ? editing.lines.map((l) => ({ itemId: l.itemId, quantity: String(fromBaseQty(l.quantity, l.unit)), unit: l.unit, unitCost: l.unitCost ? String(l.unitCost / 100) : "" }))
      : prefill && prefill.length > 0 ? prefill : [{ itemId: "", quantity: "", unit: "KG", unitCost: "" }],
  );
  const [saving, setSaving] = useState(false);
  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  const total = lines.reduce((n, l) => n + (Number(l.quantity) > 0 && Number(l.unitCost) > 0 ? Math.round(Number(l.quantity) * Number(l.unitCost) * 100) : 0), 0);

  async function save(status: "DRAFT" | "ORDERED") {
    if (!supplierId) return toast.error("Choose a supplier");
    const clean = lines.filter((l) => l.itemId);
    if (clean.length === 0) return toast.error("Add at least one item");
    if (clean.some((l) => !(Number(l.quantity) > 0))) return toast.error("Every item needs a quantity above zero");
    setSaving(true);
    try {
      const body = {
        supplierId,
        status,
        notes: notes.trim(),
        expectedDate: expected ? new Date(expected).toISOString() : null,
        lines: clean.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unit: l.unit, unitCost: Number(l.unitCost || 0) })),
      };
      if (editing) await api.patch(`/inventory/purchase-orders/${editing.id}`, body);
      else await api.post("/inventory/purchase-orders", { branchId, ...body });
      toast.success(editing ? "Order updated." : status === "DRAFT" ? "Saved as draft." : "Purchase order created.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create the order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${editing.number}` : "New purchase order"} onClose={onClose} wide busy={saving}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier *">
          <Dropdown className="w-full" value={supplierId} onChange={setSupplierId} placeholder="Choose supplier..." ariaLabel="Supplier" options={(suppliers ?? []).map((x) => ({ value: x.id, label: x.name }))} />
        </Field>
        <Field label="Expected on (optional)"><input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className={INPUT} /></Field>
      </div>
      {(suppliers ?? []).length === 0 && <p className="mt-2 text-xs text-amber-600">Add a supplier on the Suppliers tab first.</p>}
      <div className="mt-4 space-y-2">
        {lines.map((l, i) => {
          const it = byId.get(l.itemId);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <Dropdown
                className="w-full sm:flex-1"
                value={l.itemId}
                placeholder="Choose item..."
                ariaLabel="Item"
                onChange={(id) => {
                  const next = byId.get(id);
                  setLines((ls) => ls.map((x, j) => (j === i ? { ...x, itemId: id, unit: next ? next.unit : x.unit, unitCost: next && next.costPerUnit ? String(next.costPerUnit / 100) : x.unitCost } : x)));
                }}
                options={(items ?? []).map((x) => ({ value: x.id, label: x.name }))}
              />
              <input type="number" min={0} step="any" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className={`${INPUT} !w-24`} placeholder="Qty" />
              <UnitSelect value={l.unit} family={it?.family} onChange={(u) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unit: u } : x)))} />
              <input type="number" min={0} step="any" value={l.unitCost} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x)))} className={`${INPUT} !w-28`} placeholder={`Rs. / ${INVENTORY_UNITS[l.unit].label}`} />
              <button type="button" onClick={() => setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, j) => j !== i)))} aria-label="Remove" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-600">✕</button>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => setLines((ls) => [...ls, { itemId: "", quantity: "", unit: "KG", unitCost: "" }])} className="mt-3 rounded-lg border border-dashed border-brand-red px-3 py-2 text-sm font-medium text-brand-red hover:bg-red-50">+ Add item</button>
      <Field label="Note (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${INPUT} mt-3`} maxLength={500} /></Field>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {total > 0 && <p className="mr-auto text-sm text-neutral-600">Total: <b className="text-neutral-900">{formatPaisa(total)}</b></p>}
        <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
        {(!editing || editing.status === "DRAFT") && <button type="button" onClick={() => void save("DRAFT")} disabled={saving} className="rounded-lg border border-brand-red px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-50 disabled:opacity-60">Save draft</button>}
        <button type="button" onClick={() => void save("ORDERED")} disabled={saving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Saving..." : editing ? (editing.status === "DRAFT" ? "Save and order" : "Save changes") : "Create order"}</button>
      </div>
    </Modal>
  );
}

function ReceivePo({ po, onClose, onSaved }: { po: Po; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(po.lines.map((l) => [l.id, String(fromBaseQty(l.quantity, l.unit))])));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.post(`/inventory/purchase-orders/${po.id}/receive`, {
        note: note.trim(),
        lines: po.lines.map((l) => ({ lineId: l.id, quantity: Number(qty[l.id] || 0), unit: l.unit })),
      });
      toast.success("Received. Stock updated.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not receive the order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Receive ${po.number}`} onClose={onClose} busy={saving}>
      <p className="-mt-2 text-xs text-neutral-500">Type what really arrived. It goes into {po.branchName}&apos;s stock.</p>
      <div className="mt-3 space-y-2">
        {po.lines.map((l) => (
          <div key={l.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">{l.itemName}</span>
            <span className="text-xs text-neutral-400">ordered {showQty(l.quantity, l.unit)}</span>
            <input type="number" min={0} step="any" value={qty[l.id]} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))} className={`${INPUT} !w-24`} />
            <span className="w-10 text-xs text-neutral-500">{INVENTORY_UNITS[l.unit as InventoryUnit].label}</span>
          </div>
        ))}
      </div>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={`${INPUT} mt-3`} maxLength={300} /></Field>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Saving..." : "Receive into stock"}</button>
      </div>
    </Modal>
  );
}

