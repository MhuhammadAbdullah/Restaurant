"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { INVENTORY_UNITS, type InventoryUnit } from "@restaurant/validation";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { Th, ThFilter } from "../../../../components/inventory/ThFilter";
import { BulkBar, CheckTd, CheckTh, bulkDelete, useSelection } from "../../../../components/inventory/bulk";
import { confirmDialog } from "../../../../store/useConfirmStore";
import { TrashIcon } from "../../../../components/icons";
import { Dropdown, Field, INPUT, Modal, UnitSelect, dateTime, showQty, useInventoryBranch, type StockRow } from "../../../../components/inventory/shared";

type Transfer = { id: string; number: string; createdAt: string; note: string; fromBranchId: string; fromBranchName: string; toBranchId: string; toBranchName: string; lines: { itemId: string; itemName: string; unit: InventoryUnit; quantity: number }[] };
type Draft = { itemId: string; quantity: string; unit: InventoryUnit };

export default function TransfersPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "inventoryTransfers.create");
  const canDelete = hasPermission(me, "inventoryTransfers.delete");
  const { branchId, branches } = useInventoryBranch();
  const [creating, setCreating] = useState(false);
  const [fNumber, setFNumber] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fItems, setFItems] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["inventory-transfers", branchId], queryFn: () => api.get<Transfer[]>(`/inventory/transfers?branchId=${branchId}`), enabled: !!branchId });

  const shown = (data ?? []).filter(
    (t) =>
      (!fNumber.trim() || t.number.toLowerCase().includes(fNumber.trim().toLowerCase())) &&
      (!fFrom || t.fromBranchName === fFrom) &&
      (!fTo || t.toBranchName === fTo) &&
      (!fItems.trim() || t.lines.some((l) => l.itemName.toLowerCase().includes(fItems.trim().toLowerCase()))),
  );

  const sel = useSelection(shown.map((t) => t.id));
  const [bulkBusy, setBulkBusy] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["inventory-transfers"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
  };
  const DELETE_NOTE = "Deleting a transfer sends its stock back to the branch it came from. If the receiving branch no longer has it, that transfer is not deleted.";
  async function removeSelected() {
    setBulkBusy(true);
    try {
      const reload = await bulkDelete({ path: "/inventory/transfers/bulk-delete", ids: sel.selected, noun: "transfer", message: DELETE_NOTE });
      if (reload) { sel.clear(); refresh(); }
    } finally {
      setBulkBusy(false);
    }
  }
  async function removeOne(t: Transfer) {
    if (!(await confirmDialog({ title: `Delete ${t.number}?`, message: DELETE_NOTE, confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await api.delete(`/inventory/transfers/${t.id}`);
      toast.success("Transfer deleted. The stock went back to " + t.fromBranchName + ".");
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete the transfer");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">Move stock from one branch to another. It leaves the sender and reaches the receiver at once.</p>
        {canCreate && branches.length > 1 && (
          <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New transfer</button>
        )}
      </div>
      {branches.length <= 1 && <p className="mt-3 rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-500">You need access to more than one branch to move stock between branches.</p>}

      {canDelete && <BulkBar count={sel.selected.length} noun="transfer" busy={bulkBusy} onDelete={() => void removeSelected()} onClear={sel.clear} />}

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              {canDelete && <CheckTh checked={sel.allChecked} indeterminate={sel.someChecked} onChange={sel.toggleAll} />}
              <ThFilter label="Transfer" value={fNumber} onChange={setFNumber} placeholder="Transfer number" />
              <ThFilter label="From" value={fFrom} onChange={setFFrom} options={[...new Set((data ?? []).map((t) => t.fromBranchName))].sort().map((n) => ({ value: n, label: n }))} />
              <ThFilter label="To" value={fTo} onChange={setFTo} options={[...new Set((data ?? []).map((t) => t.toBranchName))].sort().map((n) => ({ value: n, label: n }))} />
              <ThFilter label="Items" value={fItems} onChange={setFItems} placeholder="Item name" />
              <Th>Note</Th>
              {canDelete && <Th className="text-right">Actions</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              <tr><td colSpan={7} className="p-6 text-center text-neutral-400">Loading...</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-neutral-500">{(data ?? []).length === 0 ? "No transfers yet." : "No transfers match the filters."}</td></tr>
            ) : (
              shown.map((t) => (
                <tr key={t.id} className="transition hover:bg-neutral-50/60">
                  {canDelete && <CheckTd checked={sel.has(t.id)} onChange={() => sel.toggle(t.id)} label={t.number} />}
                  <td className="px-4 py-3">
                    <p className="font-semibold text-neutral-900">{t.number}</p>
                    <p className="text-xs text-neutral-400">{dateTime(t.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{t.fromBranchName}</td>
                  <td className="px-4 py-3 text-neutral-700">{t.toBranchName}</td>
                  <td className="px-4 py-3 text-neutral-700">{t.lines.map((l) => l.itemName + " " + showQty(l.quantity, l.unit)).join(", ")}</td>
                  <td className="max-w-[220px] px-4 py-3 text-xs text-neutral-500">{t.note || <span className="text-neutral-300">-</span>}</td>
                  {canDelete && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button type="button" onClick={() => void removeOne(t)} title="Delete (stock goes back)" aria-label="Delete" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"><TrashIcon size={14} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <NewTransfer
          branches={branches}
          initialFrom={branchId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function NewTransfer({ branches, initialFrom, onClose, onSaved }: { branches: { id: string; name: string }[]; initialFrom: string; onClose: () => void; onSaved: () => void }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(branches.find((b) => b.id !== initialFrom)?.id ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Draft[]>([{ itemId: "", quantity: "", unit: "KG" }]);
  const [saving, setSaving] = useState(false);
  const { data: items } = useQuery({ queryKey: ["inventory-stock", from, false], queryFn: () => api.get<StockRow[]>(`/inventory/stock?branchId=${from}`), enabled: !!from });
  const byId = new Map((items ?? []).map((i) => [i.id, i]));

  async function save() {
    const clean = lines.filter((l) => l.itemId);
    if (!from || !to || from === to) return toast.error("Choose two different branches");
    if (clean.length === 0) return toast.error("Add at least one item");
    if (clean.some((l) => !(Number(l.quantity) > 0))) return toast.error("Every item needs a quantity above zero");
    setSaving(true);
    try {
      await api.post("/inventory/transfers", { fromBranchId: from, toBranchId: to, note: note.trim(), lines: clean.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unit: l.unit })) });
      toast.success("Transfer done.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not transfer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New transfer" onClose={onClose} wide busy={saving}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From">
          <Dropdown className="w-full" value={from} ariaLabel="From branch" onChange={(v) => { setFrom(v); setLines([{ itemId: "", quantity: "", unit: "KG" }]); if (v === to) setTo(""); }} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </Field>
        <Field label="To">
          <Dropdown className="w-full" value={to} ariaLabel="To branch" placeholder="Choose branch..." onChange={setTo} options={branches.filter((b) => b.id !== from).map((b) => ({ value: b.id, label: b.name }))} />
        </Field>
      </div>
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
                onChange={(id) => { const n = byId.get(id); setLines((ls) => ls.map((x, j) => (j === i ? { ...x, itemId: id, unit: n ? n.unit : x.unit } : x))); }}
                options={(items ?? []).filter((x) => x.quantity > 0).map((x) => ({ value: x.id, label: x.name + " (" + showQty(x.quantity, x.unit) + " here)" }))}
              />
              <input type="number" min={0} step="any" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className={`${INPUT} !w-24`} placeholder="Qty" />
              <UnitSelect value={l.unit} family={it?.family} onChange={(u) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unit: u } : x)))} />
              <span className="hidden w-8 text-xs text-neutral-400 sm:block">{it ? INVENTORY_UNITS[it.unit].label : ""}</span>
              <button type="button" onClick={() => setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, j) => j !== i)))} aria-label="Remove" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-600">✕</button>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => setLines((ls) => [...ls, { itemId: "", quantity: "", unit: "KG" }])} className="mt-3 rounded-lg border border-dashed border-brand-red px-3 py-2 text-sm font-medium text-brand-red hover:bg-red-50">+ Add item</button>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={`${INPUT} mt-3`} maxLength={300} /></Field>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Moving..." : "Transfer"}</button>
      </div>
    </Modal>
  );
}
