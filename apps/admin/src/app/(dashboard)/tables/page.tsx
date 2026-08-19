"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useSelectedBranch } from "../../../lib/useSelectedBranch";
import { useMe, hasPermission } from "../../../lib/useMe";
import { OrderDetailModal } from "../../../components/orders/OrderDetailModal";
import { CloseIcon, EditIcon, TrashIcon } from "../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING";
type RestaurantTable = {
  id: string;
  branchId: string;
  number: string;
  name: string | null;
  capacity: number;
  section: string | null;
  status: TableStatus;
};
type OpenOrder = { id: string; orderNumber: string; status: string; grandTotal: number; table: { id: string } | null };

const STATUS_BADGE_STYLES: Record<TableStatus, string> = {
  AVAILABLE: "bg-green-50 text-green-700",
  OCCUPIED: "bg-red-50 text-red-700",
  RESERVED: "bg-blue-50 text-blue-700",
  CLEANING: "bg-amber-50 text-amber-700",
};
const NON_TERMINAL_STATUSES = new Set(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"]);

type TableFormState = { number: string; name: string; capacity: string; section: string };
const EMPTY_FORM: TableFormState = { number: "", name: "", capacity: "2", section: "" };

function TableFormModal({
  branchId,
  initial,
  onClose,
  onSaved,
}: {
  branchId: string;
  initial: RestaurantTable | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TableFormState>(
    initial
      ? { number: initial.number, name: initial.name ?? "", capacity: String(initial.capacity), section: initial.section ?? "" }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        branchId,
        number: form.number,
        name: form.name || undefined,
        capacity: Number(form.capacity) || 1,
        section: form.section || undefined,
      };
      if (initial) {
        await api.patch(`/tables/${initial.id}`, body);
      } else {
        await api.post("/tables", body);
      }
      toast.success(initial ? "Table updated." : "Table created.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save table");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-neutral-900">{initial ? `Edit Table ${initial.number}` : "New Table"}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200"><CloseIcon size={14} /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <input placeholder="Table number" value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} className="input" required />
          <input type="number" min={1} placeholder="Capacity" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} className="input" required />
          <input placeholder="Name (optional)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input col-span-2" />
          <input placeholder="Section (optional, e.g. Indoor, Rooftop)" value={form.section} onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))} className="input col-span-2" />

          <div className="col-span-2 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm font-medium">Cancel</button>
            <button disabled={saving} className="flex-1 rounded-lg bg-brand-red py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving..." : initial ? "Save Changes" : "Create Table"}
            </button>
          </div>
        </div>

        <style jsx global>{`.input { border-radius: 0.5rem; border: 1px solid #d4d4d4; padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
      </form>
    </div>
  );
}

export default function TablesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { branchId, branches } = useSelectedBranch();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "tables.create");
  const canEdit = hasPermission(me, "tables.edit");
  const canDelete = hasPermission(me, "tables.delete");

  const [formOpen, setFormOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  const { data: tables } = useQuery({
    queryKey: ["tables", branchId],
    queryFn: () => api.get<RestaurantTable[]>(`/tables?branchId=${branchId}`),
    enabled: !!branchId,
  });
  const { data: openOrders } = useQuery({
    queryKey: ["tables-open-orders", branchId],
    queryFn: () => api.get<OpenOrder[]>(`/staff/orders?branchId=${branchId}`),
    enabled: !!branchId,
  });
  const orderForTable = (tableId: string) =>
    openOrders?.find((o) => o.table?.id === tableId && NON_TERMINAL_STATUSES.has(o.status));

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["tables"] });
    await queryClient.invalidateQueries({ queryKey: ["tables-open-orders"] });
  }

  function openCreate() {
    setEditingTable(null);
    setFormOpen(true);
  }
  function openEdit(t: RestaurantTable) {
    setEditingTable(t);
    setFormOpen(true);
  }

  async function setStatus(t: RestaurantTable, status: TableStatus) {
    try {
      await api.patch(`/tables/${t.id}`, { status });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update table status");
    }
  }

  async function removeTable(t: RestaurantTable) {
    if (!confirm(`Delete Table ${t.number}?`)) return;
    try {
      await api.delete(`/tables/${t.id}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete table");
    }
  }

  if (!branchId && branches.length > 1) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
        <p className="text-sm font-medium text-neutral-700">Select a branch above to manage tables</p>
        <p className="mt-1 text-xs text-neutral-400">You have access to {branches.length} branches. Pick one from the switcher in the header.</p>
      </div>
    );
  }

  const sortedTables = [...(tables ?? [])].sort((a, b) => (a.section ?? "").localeCompare(b.section ?? "") || a.number.localeCompare(b.number, undefined, { numeric: true }));
  const colSpan = 6;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Tables</h1>
        {canCreate && branchId && (
          <button onClick={openCreate} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">+ New Table</button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">Table</th>
              <th className="px-4 py-2">Section</th>
              <th className="px-4 py-2">Capacity</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedTables.map((t) => {
              const order = t.status === "OCCUPIED" ? orderForTable(t.id) : undefined;
              return (
                <tr key={t.id}>
                  <td className="px-4 py-2 font-medium">{t.name ?? `Table ${t.number}`}</td>
                  <td className="px-4 py-2 text-neutral-500">{t.section ?? "—"}</td>
                  <td className="px-4 py-2">{t.capacity}</td>
                  <td className="px-4 py-2">
                    {canEdit ? (
                      <Select value={t.status} onValueChange={(v) => setStatus(t, v as TableStatus)}>
                        <SelectTrigger className={`h-auto w-32 border-0 px-2 py-1 text-xs font-medium ${STATUS_BADGE_STYLES[t.status]}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AVAILABLE">Available</SelectItem>
                          <SelectItem value="OCCUPIED">Occupied</SelectItem>
                          <SelectItem value="RESERVED">Reserved</SelectItem>
                          <SelectItem value="CLEANING">Cleaning</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_STYLES[t.status]}`}>{t.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {order ? (
                      <button onClick={() => setDetailOrderId(order.id)} className="text-xs font-medium text-brand-red underline">
                        {order.orderNumber}
                      </button>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <button onClick={() => openEdit(t)} aria-label="Edit" className="text-neutral-400 hover:text-brand-red"><EditIcon size={14} /></button>
                      )}
                      {canDelete && (
                        <button onClick={() => removeTable(t)} aria-label="Delete" className="text-neutral-400 hover:text-red-600"><TrashIcon size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {sortedTables.length === 0 && (
              <tr><td colSpan={colSpan} className="px-4 py-6 text-center text-neutral-400">No tables yet for this branch. {canCreate && "Add one to get started."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && branchId && (
        <TableFormModal branchId={branchId} initial={editingTable} onClose={() => setFormOpen(false)} onSaved={refresh} />
      )}

      {detailOrderId && <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} onNavigateReceipt={(id) => router.push(`/pos/receipt/${id}`)} />}
    </div>
  );
}
