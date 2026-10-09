"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaUsers } from "react-icons/fa6";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useSelectedBranch } from "../../../lib/useSelectedBranch";
import { useMe, hasPermission } from "../../../lib/useMe";
import { OrderDetailModal } from "../../../components/orders/OrderDetailModal";
import { SearchInput } from "../../../components/SearchFilterBar";
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
  openOrder: { id: string; orderNumber: string; status: string; grandTotal: number; paidTotal: number; balanceDue: number; itemCount: number; createdAt: string } | null;
};

const STATUS_META: Record<TableStatus, { label: string; badge: string; dot: string; card: string; trigger: string; item: string }> = {
  AVAILABLE: { label: "Available", badge: "bg-green-50 text-green-700", dot: "bg-green-500", card: "border-green-200", trigger: "focus:border-green-500 focus:ring-green-300 data-[state=open]:border-green-500 data-[state=open]:ring-green-300", item: "data-[highlighted]:bg-green-50 data-[highlighted]:text-green-700 data-[state=checked]:bg-green-50 data-[state=checked]:text-green-700" },
  OCCUPIED: { label: "Occupied", badge: "bg-red-50 text-red-700", dot: "bg-red-500", card: "border-red-300", trigger: "focus:border-red-500 focus:ring-red-300 data-[state=open]:border-red-500 data-[state=open]:ring-red-300", item: "data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700 data-[state=checked]:bg-red-50 data-[state=checked]:text-red-700" },
  RESERVED: { label: "Reserved", badge: "bg-blue-50 text-blue-700", dot: "bg-blue-500", card: "border-blue-200", trigger: "focus:border-blue-500 focus:ring-blue-300 data-[state=open]:border-blue-500 data-[state=open]:ring-blue-300", item: "data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700" },
  CLEANING: { label: "Cleaning", badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500", card: "border-amber-200", trigger: "focus:border-amber-500 focus:ring-amber-300 data-[state=open]:border-amber-500 data-[state=open]:ring-amber-300", item: "data-[highlighted]:bg-amber-50 data-[highlighted]:text-amber-700 data-[state=checked]:bg-amber-50 data-[state=checked]:text-amber-700" },
};
const STATUSES = Object.keys(STATUS_META) as TableStatus[];

function openFor(createdAt: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function SectionTitle({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white">{n}</span>
      <div>
        <p className="text-sm font-semibold text-neutral-900">{title}</p>
        <p className="text-xs text-neutral-500">{hint}</p>
      </div>
    </div>
  );
}

type TableFormState = { number: string; name: string; capacity: string; section: string };
const EMPTY_FORM: TableFormState = { number: "", name: "", capacity: "4", section: "" };

function TableFormModal({
  branchId,
  initial,
  sections,
  onClose,
  onSaved,
}: {
  branchId: string;
  initial: RestaurantTable | null;
  sections: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TableFormState>(
    initial ? { number: initial.number, name: initial.name ?? "", capacity: String(initial.capacity), section: initial.section ?? "" } : EMPTY_FORM,
  );
  const [multi, setMulti] = useState(false);
  const [range, setRange] = useState({ prefix: "", from: "1", to: "10" });
  const [saving, setSaving] = useState(false);

  const rangeCount = Math.max(0, Number(range.to) - Number(range.from) + 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const capacity = Math.max(1, Number(form.capacity) || 1);
    setSaving(true);
    try {
      if (initial) {
        await api.patch(`/tables/${initial.id}`, { branchId, number: form.number.trim(), name: form.name.trim() || undefined, capacity, section: form.section.trim() || undefined });
        toast.success("Table updated.");
      } else if (multi) {
        if (!(rangeCount >= 1 && rangeCount <= 50)) {
          toast.error("Choose a range of 1 to 50 tables");
          return;
        }
        let created = 0;
        const skipped: string[] = [];
        for (let n = Number(range.from); n <= Number(range.to); n++) {
          const number = `${range.prefix.trim()}${n}`;
          try {
            await api.post("/tables", { branchId, number, capacity, section: form.section.trim() || undefined });
            created++;
          } catch {
            skipped.push(number);
          }
        }
        if (created > 0) toast.success(`${created} table${created === 1 ? "" : "s"} created.`);
        if (skipped.length > 0) toast.error(`Skipped (already exist): ${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? "..." : ""}`);
      } else {
        await api.post("/tables", { branchId, number: form.number.trim(), name: form.name.trim() || undefined, capacity, section: form.section.trim() || undefined });
        toast.success("Table created.");
      }
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
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">{initial ? `Edit Table ${initial.number}` : "New Table"}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
            <CloseIcon size={14} />
          </button>
        </div>

        <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {!initial && (
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [false, "Single table", "Add one table"],
                  [true, "Multiple tables", "Add a numbered range, e.g. 1-10"],
                ] as [boolean, string, string][]
              ).map(([value, label, hint]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setMulti(value)}
                  className={`rounded-lg border p-3 text-left ${multi === value ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}
                >
                  <span className="block text-sm font-medium text-neutral-900">{label}</span>
                  <span className="block text-xs text-neutral-500">{hint}</span>
                </button>
              ))}
            </div>
          )}

          <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
            <SectionTitle n={1} title="Table details" hint={multi && !initial ? "Numbers are generated from the range below." : "How the table is identified in POS and on the floor."} />
            {multi && !initial ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Prefix</p>
                    <input placeholder="e.g. T-" value={range.prefix} onChange={(e) => setRange({ ...range, prefix: e.target.value })} className="input w-full" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">From</p>
                    <input type="number" min={1} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="input w-full" required />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">To</p>
                    <input type="number" min={1} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="input w-full" required />
                  </div>
                </div>
                <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                  {rangeCount >= 1 && rangeCount <= 50
                    ? `Creates ${rangeCount} table${rangeCount === 1 ? "" : "s"}: ${range.prefix}${range.from}${rangeCount > 1 ? ` … ${range.prefix}${range.to}` : ""}. Existing numbers are skipped.`
                    : "Enter a valid range (max 50 at a time)."}
                </p>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Table number *</p>
                  <input placeholder="e.g. 5 or A1" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="input w-full" required />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Name</p>
                  <input placeholder="Optional, e.g. Window table" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
            <SectionTitle n={2} title="Seating & area" hint="Capacity and the section it belongs to." />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Capacity (seats) *</p>
                <input type="number" min={1} max={100} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="input w-full" required />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Section</p>
                <input list="table-sections" placeholder="e.g. Indoor, Rooftop" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="input w-full" />
                <datalist id="table-sections">
                  {sections.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>
          </section>

          <div className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 flex items-center gap-3 border-t border-neutral-200 bg-white px-5 py-3">
            <button disabled={saving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {saving ? "Saving..." : initial ? "Save Changes" : multi ? `Create ${rangeCount > 0 && rangeCount <= 50 ? rangeCount : ""} Tables` : "Create Table"}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">
              Cancel
            </button>
          </div>
        </form>

        <style jsx global>{`.input { border-radius: 0.5rem; border: 1px solid #d4d4d4; padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
      </div>
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
  const [deleteTarget, setDeleteTarget] = useState<RestaurantTable | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState<"floor" | "list">("floor");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TableStatus | "">("");
  const [sectionFilter, setSectionFilter] = useState("");

  const { data: tables } = useQuery({
    queryKey: ["tables", branchId],
    queryFn: () => api.get<RestaurantTable[]>(`/tables/overview?branchId=${branchId}`),
    enabled: !!branchId,
    refetchInterval: 10000,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["tables"] });
  }

  async function setStatus(t: RestaurantTable, status: TableStatus) {
    try {
      await api.patch(`/tables/${t.id}`, { status });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update table status");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/tables/${deleteTarget.id}`);
      await refresh();
      toast.success(`Table ${deleteTarget.number} deleted.`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete table");
    } finally {
      setDeleting(false);
    }
  }

  const all = tables ?? [];
  const sections = useMemo(() => [...new Set(all.map((t) => t.section).filter((s): s is string => !!s))].sort(), [all]);
  const sorted = useMemo(
    () => [...all].sort((a, b) => (a.section ?? "~").localeCompare(b.section ?? "~") || a.number.localeCompare(b.number, undefined, { numeric: true })),
    [all],
  );
  const filtered = sorted.filter((t) => {
    const q = search.trim().toLowerCase();
    if (q && !`${t.number} ${t.name ?? ""} ${t.section ?? ""}`.toLowerCase().includes(q)) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    if (sectionFilter && (t.section ?? "") !== (sectionFilter === "__none" ? "" : sectionFilter)) return false;
    return true;
  });
  const groups = useMemo(() => {
    const m = new Map<string, RestaurantTable[]>();
    for (const t of filtered) m.set(t.section ?? "", [...(m.get(t.section ?? "") ?? []), t]);
    return [...m.entries()];
  }, [filtered]);
  const isFiltering = search.trim() !== "" || statusFilter !== "" || sectionFilter !== "";
  const openBills = all.filter((t) => t.openOrder);
  const totalSeats = all.reduce((n, t) => n + t.capacity, 0);

  if (!branchId && branches.length > 1) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
        <p className="text-sm font-medium text-neutral-700">Select a branch above to manage tables</p>
        <p className="mt-1 text-xs text-neutral-400">You have access to {branches.length} branches. Pick one from the switcher in the header.</p>
      </div>
    );
  }

  function StatusControl({ t }: { t: RestaurantTable }) {
    return canEdit ? (
      <Select value={t.status} onValueChange={(v) => setStatus(t, v as TableStatus)}>
        <SelectTrigger className={`h-auto w-32 border border-transparent px-2 py-1 text-xs font-medium ${STATUS_META[t.status].badge} ${STATUS_META[t.status].trigger}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s} className={STATUS_META[s].item}>{STATUS_META[s].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_META[t.status].badge}`}>{STATUS_META[t.status].label}</span>
    );
  }

  function RowActions({ t }: { t: RestaurantTable }) {
    return (
      <div className="flex items-center gap-2">
        {canEdit && (
          <button onClick={() => { setEditingTable(t); setFormOpen(true); }} aria-label="Edit table" className="text-neutral-400 hover:text-brand-red"><EditIcon size={15} /></button>
        )}
        {canDelete && (
          <button onClick={() => setDeleteTarget(t)} aria-label="Delete table" className="text-neutral-400 hover:text-red-600"><TrashIcon size={15} /></button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Tables</h1>
          <p className="mt-1 text-sm text-neutral-500">Your floor at a glance. Running bills update automatically from POS.</p>
        </div>
        {canCreate && branchId && (
          <button onClick={() => { setEditingTable(null); setFormOpen(true); }} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
            + New Table
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs text-neutral-500">Tables</p>
          <p className="text-xl font-semibold text-neutral-900">{all.length}</p>
          <p className="text-[11px] text-neutral-400">{totalSeats} seats</p>
        </div>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`rounded-xl border bg-white px-4 py-3 text-left transition hover:shadow-sm ${statusFilter === s ? "border-brand-red ring-1 ring-brand-red" : "border-neutral-200"}`}
          >
            <p className="flex items-center gap-1.5 text-xs text-neutral-500"><span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />{STATUS_META[s].label}</p>
            <p className="text-xl font-semibold text-neutral-900">{all.filter((t) => t.status === s).length}</p>
          </button>
        ))}
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs text-neutral-500">Open bills</p>
          <p className="text-xl font-semibold text-neutral-900">{formatPaisa(openBills.reduce((n, t) => n + (t.openOrder?.balanceDue ?? 0), 0))}</p>
          <p className="text-[11px] text-neutral-400">{openBills.length} running</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search table, name, section..." />
          {sections.length > 0 && (
            <Select value={sectionFilter || "all"} onValueChange={(v) => setSectionFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
                {all.some((t) => !t.section) && <SelectItem value="__none">No section</SelectItem>}
              </SelectContent>
            </Select>
          )}
          {isFiltering && (
            <button onClick={() => { setSearch(""); setStatusFilter(""); setSectionFilter(""); }} className="text-sm font-medium text-brand-red hover:underline">
              Clear filters
            </button>
          )}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-neutral-300 text-xs font-medium">
          {(["floor", "list"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 ${view === v ? "bg-brand-red text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}>
              {v === "floor" ? "Floor view" : "List view"}
            </button>
          ))}
        </div>
      </div>

      {all.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
          No tables yet for this branch. {canCreate && "Click “New Table” to add one, or add a whole range at once."}
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">No tables match your filters.</p>
      ) : view === "floor" ? (
        <div className="mt-4 space-y-6">
          {groups.map(([section, list]) => (
            <div key={section || "none"}>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {section || "No section"} <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">{list.length}</span>
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {list.map((t) => (
                  <div key={t.id} className={`flex flex-col rounded-xl border-2 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md ${STATUS_META[t.status].card}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold text-neutral-900">Table {t.number}</p>
                        {t.name && <p className="truncate text-xs text-neutral-500">{t.name}</p>}
                      </div>
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600"><FaUsers size={11} />{t.capacity}</span>
                    </div>

                    <div className="mt-3 min-h-[3.25rem]">
                      {t.openOrder ? (
                        <button onClick={() => setDetailOrderId(t.openOrder!.id)} className="w-full rounded-lg bg-red-50 p-2 text-left hover:bg-red-100">
                          <span className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-brand-red">{t.openOrder.orderNumber}</span>
                            <span className="text-neutral-500">{t.openOrder.itemCount} item{t.openOrder.itemCount === 1 ? "" : "s"} · {openFor(t.openOrder.createdAt)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between text-xs">
                            <span className="text-neutral-500">Total {formatPaisa(t.openOrder.grandTotal)}</span>
                            <span className="font-semibold text-neutral-900">Due {formatPaisa(t.openOrder.balanceDue)}</span>
                          </span>
                        </button>
                      ) : (
                        <p className="flex h-full items-center text-xs text-neutral-400">No running bill</p>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                      {StatusControl({ t })}
                      {RowActions({ t })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-2">Table</th>
                <th className="px-4 py-2">Section</th>
                <th className="px-4 py-2">Capacity</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Running bill</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 font-medium">
                    Table {t.number}
                    {t.name && <span className="ml-2 text-xs font-normal text-neutral-400">{t.name}</span>}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{t.section ?? "—"}</td>
                  <td className="px-4 py-2">{t.capacity}</td>
                  <td className="px-4 py-2">{StatusControl({ t })}</td>
                  <td className="px-4 py-2">
                    {t.openOrder ? (
                      <button onClick={() => setDetailOrderId(t.openOrder!.id)} className="text-xs">
                        <span className="font-medium text-brand-red underline">{t.openOrder.orderNumber}</span>
                        <span className="ml-2 text-neutral-500">Due {formatPaisa(t.openOrder.balanceDue)} · {openFor(t.openOrder.createdAt)}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{RowActions({ t })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && branchId && (
        <TableFormModal branchId={branchId} initial={editingTable} sections={sections} onClose={() => setFormOpen(false)} onSaved={refresh} />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">Delete Table {deleteTarget.number}</p>
              <button type="button" onClick={() => setDeleteTarget(null)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-600">
                {deleteTarget.openOrder
                  ? "This table has a running bill, so it can't be deleted until the bill is settled or cancelled."
                  : "Delete this table? Past orders keep their details but will no longer be linked to it. This cannot be undone."}
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button type="button" onClick={confirmDelete} disabled={deleting || !!deleteTarget.openOrder} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                  {deleting ? "Deleting..." : "Delete"}
                </button>
                <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailOrderId && <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} onNavigateReceipt={(id) => router.push(`/pos/receipt/${id}`)} />}
    </div>
  );
}
