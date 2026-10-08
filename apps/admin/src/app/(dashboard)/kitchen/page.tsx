"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaBoxOpen, FaMagnifyingGlass, FaMotorcycle, FaPrint, FaUtensils } from "react-icons/fa6";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useSelectedBranch } from "../../../lib/useSelectedBranch";

type KitchenOrder = {
  id: string;
  orderNumber: string;
  type: string;
  source: string;
  status: string;
  specialInstructions: string | null;
  createdAt: string;
  table: { number: string; name: string | null } | null;
  items: Array<{
    id: string;
    nameSnapshot: string;
    quantity: number;
    specialInstructions: string | null;
    orderRevisionId: string | null;
    choices: { nameSnapshot: string }[];
    addons: { nameSnapshot: string; quantity: number }[];
    dealSlots: Array<{ nameSnapshot: string; dealSlot: { label: string }; choices: { nameSnapshot: string }[]; addons: { nameSnapshot: string; quantity: number }[] }>;
  }>;
};

// PENDING never reaches the kitchen (an unaccepted order has nothing to cook), so there is no tab for it.
const TABS = ["CONFIRMED", "PREPARING", "READY", "CANCELLED"] as const;
type TabKey = (typeof TABS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  CONFIRMED: "New",
  PREPARING: "Preparing",
  READY: "Ready",
  CANCELLED: "Cancelled",
};

const TYPE_FILTERS = [
  { key: "", label: "All types" },
  { key: "DINE_IN", label: "Dine-in" },
  { key: "PICKUP", label: "Pickup / Takeaway" },
  { key: "DELIVERY", label: "Delivery" },
] as const;

/** Which endpoint a tab's primary action hits, and how the button/bulk action is worded and coloured. */
const ACTIONS: Partial<Record<TabKey, { endpoint: string; bulk: string; button: string; label: (o: KitchenOrder) => string }>> = {
  CONFIRMED: { endpoint: "start-preparing", bulk: "Start Preparing", button: "bg-brand-red hover:opacity-90", label: () => "Start Preparing" },
  PREPARING: { endpoint: "mark-ready", bulk: "Mark Ready", button: "bg-green-600 hover:bg-green-700", label: () => "Mark Ready" },
  READY: {
    endpoint: "complete",
    bulk: "Complete",
    button: "bg-blue-600 hover:bg-blue-700",
    label: (o) => (o.type === "DELIVERY" || o.type === "ONLINE_DELIVERY" ? "Out for Delivery" : o.type === "DINE_IN" ? "Served" : "Handed Over"),
  },
};

function typeGroup(type: string): "DINE_IN" | "PICKUP" | "DELIVERY" {
  if (type === "DINE_IN") return "DINE_IN";
  if (type === "DELIVERY" || type === "ONLINE_DELIVERY") return "DELIVERY";
  return "PICKUP";
}

const TYPE_STYLE: Record<"DINE_IN" | "PICKUP" | "DELIVERY", { label: string; chip: string; icon: React.ReactElement }> = {
  DINE_IN: { label: "Dine-in", chip: "bg-blue-50 text-blue-700", icon: <FaUtensils size={10} /> },
  PICKUP: { label: "Pickup", chip: "bg-purple-50 text-purple-700", icon: <FaBoxOpen size={10} /> },
  DELIVERY: { label: "Delivery", chip: "bg-cyan-50 text-cyan-700", icon: <FaMotorcycle size={11} /> },
};

/** Elapsed-time badge: fresh orders stay calm, slow ones turn amber then red so they get noticed. */
function ageStyle(mins: number, status: string): string {
  if (status === "READY" || status === "CANCELLED") return "bg-neutral-100 text-neutral-600";
  if (mins >= 20) return "bg-red-100 text-red-700";
  if (mins >= 10) return "bg-amber-100 text-amber-700";
  return "bg-green-100 text-green-700";
}

export default function KitchenPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { branchId, branches } = useSelectedBranch();

  const [activeTab, setActiveTab] = useState<TabKey>("CONFIRMED");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["key"]>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Age badges re-render every 30s; the order list itself polls every 5s.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const { data: orders, isError } = useQuery({
    queryKey: ["kitchen-orders", branchId],
    queryFn: () => api.get<KitchenOrder[]>(`/kitchen/orders?branchId=${branchId}`),
    enabled: !!branchId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    setSelected(new Set());
  }, [activeTab]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { CONFIRMED: 0, PREPARING: 0, READY: 0, CANCELLED: 0 };
    for (const o of orders ?? []) if (o.status in c) c[o.status as TabKey]++;
    return c;
  }, [orders]);

  const tabOrders = useMemo(() => (orders ?? []).filter((o) => o.status === activeTab), [orders, activeTab]);
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabOrders.filter((o) => {
      if (q) {
        const tableLabel = o.table ? (o.table.name ?? `T${o.table.number}`).toLowerCase() : "";
        if (!o.orderNumber.toLowerCase().includes(q) && !tableLabel.includes(q)) return false;
      }
      if (typeFilter && typeGroup(o.type) !== typeFilter) return false;
      return true;
    });
  }, [tabOrders, search, typeFilter]);
  const isFiltering = search.trim() !== "" || typeFilter !== "";

  const action = ACTIONS[activeTab];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
  }

  async function act(order: KitchenOrder) {
    if (!action) return;
    setActingId(order.id);
    try {
      await api.patch(`/kitchen/orders/${order.id}/${action.endpoint}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update the order");
    } finally {
      setActingId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((s) => (s.size === filteredOrders.length ? new Set() : new Set(filteredOrders.map((o) => o.id))));
  }

  async function runBulkAction() {
    if (!action || selected.size === 0) return;
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled([...selected].map((id) => api.patch(`/kitchen/orders/${id}/${action.endpoint}`)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) toast.error(`${failed} order${failed === 1 ? "" : "s"} could not be updated`);
      setSelected(new Set());
      await refresh();
    } finally {
      setBulkLoading(false);
    }
  }

  if (!branchId && branches.length > 1) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
        <p className="text-sm font-medium text-neutral-700">Select a branch above to view the kitchen board</p>
        <p className="mt-1 text-xs text-neutral-400">You have access to {branches.length} branches. Pick one from the switcher in the header.</p>
      </div>
    );
  }

  const branchName = branches.find((b) => b.id === branchId)?.name;
  const colCount = (action ? 1 : 0) + 6;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-900">
            Kitchen Board
            <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Live
            </span>
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            {branchName ? `${branchName} · ` : ""}
            {counts.CONFIRMED + counts.PREPARING + counts.READY} active order{counts.CONFIRMED + counts.PREPARING + counts.READY === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              activeTab === t ? "border-brand-red text-brand-red" : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {TAB_LABELS[t]}
            <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeTab === t ? "bg-brand-red/10 text-brand-red" : "bg-neutral-100 text-neutral-500"}`}>{counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <FaMagnifyingGlass size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order # or table..."
              className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-neutral-400 focus:border-brand-red focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setTypeFilter(f.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  typeFilter === f.key ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 bg-white text-neutral-600 hover:border-brand-red hover:text-brand-red"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {isFiltering && (
            <button
              onClick={() => {
                setSearch("");
                setTypeFilter("");
              }}
              className="text-xs font-medium text-brand-red hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="text-xs text-neutral-500">
          Showing {filteredOrders.length} of {tabOrders.length} order{tabOrders.length === 1 ? "" : "s"}
        </p>
      </div>

      {isError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Could not refresh the board. Retrying...</p>}

      {selected.size > 0 && action && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-brand-red/20 bg-red-50 px-4 py-2.5">
          <p className="text-sm font-medium text-brand-red">
            {selected.size} order{selected.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(new Set())} className="text-xs text-neutral-500 hover:text-neutral-700">
              Clear
            </button>
            <button onClick={runBulkAction} disabled={bulkLoading} className="rounded-lg bg-brand-red px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {bulkLoading ? "Working..." : `${action.bulk} (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              {action && (
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={filteredOrders.length > 0 && selected.size === filteredOrders.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                    className="h-4 w-4 accent-brand-red"
                  />
                </th>
              )}
              <th className="px-4 py-2.5">Order</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Table</th>
              <th className="px-4 py-2.5">Notes</th>
              <th className="px-4 py-2.5">Age</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 align-top">
            {filteredOrders.map((o) => {
              const mins = Math.max(0, Math.floor((now - new Date(o.createdAt).getTime()) / 60000));
              const style = TYPE_STYLE[typeGroup(o.type)];
              const hasAdditional = o.items.some((i) => i.orderRevisionId != null);
              const overdue = mins >= 20 && (o.status === "CONFIRMED" || o.status === "PREPARING");
              return (
                <tr key={o.id} className={`${activeTab === "CANCELLED" ? "opacity-60" : ""} ${overdue ? "bg-red-50/50" : "hover:bg-neutral-50/70"} ${selected.has(o.id) ? "bg-red-50" : ""}`}>
                  {action && (
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} aria-label={`Select ${o.orderNumber}`} className="h-4 w-4 accent-brand-red" />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <p className="font-semibold text-neutral-900">{o.orderNumber}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">{new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    {hasAdditional && <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Additional items</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.chip}`}>
                      {style.icon}
                      {style.label}
                    </span>
                    {o.source === "ONLINE" && <span className="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-brand-red">Online</span>}
                  </td>
                  <td className="px-4 py-3">
                    {o.table ? <span className="rounded-md bg-neutral-900 px-2 py-0.5 text-xs font-semibold text-white">{o.table.name ?? `T${o.table.number}`}</span> : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="max-w-[200px] px-4 py-3 text-xs">
                    {o.specialInstructions ? <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900">{o.specialInstructions}</span> : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${ageStyle(mins, o.status)}`}>
                      {mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {action ? (
                        <button
                          onClick={() => act(o)}
                          disabled={actingId === o.id}
                          className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition disabled:opacity-60 ${action.button}`}
                        >
                          {actingId === o.id ? "Updating..." : action.label(o)}
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-400">Called off — stop preparing</span>
                      )}
                      <button
                        onClick={() => router.push(`/pos/kitchen-ticket/${o.id}?full=true`)}
                        aria-label="Print kitchen ticket"
                        title="Print ticket"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 transition hover:border-brand-red hover:text-brand-red"
                      >
                        <FaPrint size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!orders && (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-neutral-400">Loading orders...</td>
              </tr>
            )}
            {orders && tabOrders.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-neutral-400">
                  No {TAB_LABELS[activeTab].toLowerCase()} orders right now.
                </td>
              </tr>
            )}
            {tabOrders.length > 0 && filteredOrders.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-neutral-400">No orders match your search/filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
