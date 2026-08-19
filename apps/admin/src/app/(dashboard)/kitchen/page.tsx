"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { useSelectedBranch } from "../../../lib/useSelectedBranch";
import { SearchInput, FilterBar, FilterSelect, ClearFiltersButton, ResultsSummary } from "../../../components/SearchFilterBar";

type KitchenOrder = {
  id: string;
  orderNumber: string;
  type: string;
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

const TABS = ["PENDING", "CONFIRMED", "PREPARING", "READY", "CANCELLED"] as const;
type TabKey = (typeof TABS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  CANCELLED: "Cancelled",
};

const ORDER_TYPES = ["DINE_IN", "WALK_IN", "TAKEAWAY", "DELIVERY", "ONLINE_DELIVERY", "ONLINE_PICKUP"];

/** Which bulk action (if any) applies on this tab, and which single-order endpoint it hits. */
const BULK_ACTION: Partial<Record<TabKey, { label: string; endpoint: string }>> = {
  PENDING: { label: "Start Preparing", endpoint: "start-preparing" },
  CONFIRMED: { label: "Start Preparing", endpoint: "start-preparing" },
  PREPARING: { label: "Mark Ready", endpoint: "mark-ready" },
  READY: { label: "Complete", endpoint: "complete" },
};

function itemLine(item: KitchenOrder["items"][number]) {
  const parts: string[] = [];
  if (item.choices.length > 0) parts.push(item.choices.map((c) => c.nameSnapshot).join(", "));
  if (item.addons.length > 0) parts.push(item.addons.map((a) => `${a.nameSnapshot} x${a.quantity}`).join(", "));
  return parts.join(" · ");
}

export default function KitchenPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { branchId, branches } = useSelectedBranch();

  const [activeTab, setActiveTab] = useState<TabKey>("PENDING");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: orders } = useQuery({
    queryKey: ["kitchen-orders", branchId],
    queryFn: () => api.get<KitchenOrder[]>(`/kitchen/orders?branchId=${branchId}`),
    enabled: !!branchId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    setSelected(new Set());
  }, [activeTab]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { PENDING: 0, CONFIRMED: 0, PREPARING: 0, READY: 0, CANCELLED: 0 };
    for (const o of orders ?? []) {
      if (o.status in c) c[o.status as TabKey]++;
    }
    return c;
  }, [orders]);

  const tabOrders = useMemo(() => (orders ?? []).filter((o) => o.status === activeTab), [orders, activeTab]);
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabOrders.filter((o) => {
      if (q && !o.orderNumber.toLowerCase().includes(q)) return false;
      if (typeFilter && o.type !== typeFilter) return false;
      return true;
    });
  }, [tabOrders, search, typeFilter]);
  const isFiltering = search.trim() !== "" || typeFilter !== "";

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
  }

  async function startPreparing(id: string) {
    setActingId(id);
    try {
      await api.patch(`/kitchen/orders/${id}/start-preparing`);
      await refresh();
    } finally {
      setActingId(null);
    }
  }
  async function markReady(id: string) {
    setActingId(id);
    try {
      await api.patch(`/kitchen/orders/${id}/mark-ready`);
      await refresh();
    } finally {
      setActingId(null);
    }
  }
  async function complete(id: string) {
    setActingId(id);
    try {
      await api.patch(`/kitchen/orders/${id}/complete`);
      await refresh();
    } finally {
      setActingId(null);
    }
  }

  const bulkAction = BULK_ACTION[activeTab];

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
    if (!bulkAction || selected.size === 0) return;
    setBulkLoading(true);
    try {
      const ids = [...selected];
      await Promise.all(ids.map((id) => api.patch(`/kitchen/orders/${id}/${bulkAction.endpoint}`)));
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

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Kitchen Board</h1>

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
            <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeTab === t ? "bg-brand-red/10 text-brand-red" : "bg-neutral-100 text-neutral-500"}`}>
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search order #..." />
          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="All order types"
            options={ORDER_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
          />
          {isFiltering && (
            <ClearFiltersButton
              onClick={() => {
                setSearch("");
                setTypeFilter("");
              }}
            />
          )}
        </FilterBar>
        <ResultsSummary count={filteredOrders.length} total={tabOrders.length} itemLabel="order" />
      </div>

      {selected.size > 0 && bulkAction && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-brand-red/20 bg-red-50 px-4 py-2.5">
          <p className="text-sm font-medium text-brand-red">{selected.size} order{selected.size === 1 ? "" : "s"} selected</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(new Set())} className="text-xs text-neutral-500 hover:text-neutral-700">
              Clear
            </button>
            <button
              onClick={runBulkAction}
              disabled={bulkLoading}
              className="rounded-lg bg-brand-red px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {bulkLoading ? "Working..." : `${bulkAction.label} (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              {bulkAction && (
                <th className="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={filteredOrders.length > 0 && selected.size === filteredOrders.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 accent-brand-red"
                  />
                </th>
              )}
              <th className="px-4 py-2">Order #</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Table</th>
              <th className="px-4 py-2">Items</th>
              <th className="px-4 py-2">Notes</th>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y align-top">
            {filteredOrders.map((o) => {
              const hasAdditional = o.items.some((i) => i.orderRevisionId != null);
              return (
                <tr key={o.id} className={activeTab === "CANCELLED" ? "opacity-60" : ""}>
                  {bulkAction && (
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} className="h-4 w-4 accent-brand-red" />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium">
                    {o.orderNumber}
                    {hasAdditional && (
                      <span className="ml-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                        Additional
                      </span>
                    )}
                    {activeTab === "CANCELLED" && (
                      <span className="ml-1.5 inline-block rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-600">
                        Cancelled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{o.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{o.table ? (o.table.name ?? `T${o.table.number}`) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    <ul className="space-y-1">
                      {o.items.map((item) => (
                        <li key={item.id} className={item.orderRevisionId ? "rounded bg-amber-50 px-1 py-0.5" : ""}>
                          <span className="font-medium text-neutral-800">
                            {item.quantity}x {item.nameSnapshot}
                          </span>
                          {item.orderRevisionId && <span className="ml-1 font-semibold text-amber-700">(added)</span>}
                          {itemLine(item) && <span className="text-neutral-400"> ({itemLine(item)})</span>}
                          {item.specialInstructions && <span className="block italic text-amber-700">** {item.specialInstructions} **</span>}
                          {item.dealSlots.map((s, i) => (
                            <div key={i} className="ml-2 text-neutral-500">
                              {s.dealSlot.label}: {s.nameSnapshot} {s.choices.length > 0 && `(${s.choices.map((c) => c.nameSnapshot).join(", ")})`}
                            </div>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3 text-xs italic text-amber-600">{o.specialInstructions ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-neutral-400">{new Date(o.createdAt).toLocaleTimeString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {(o.status === "PENDING" || o.status === "CONFIRMED") && (
                        <button
                          onClick={() => startPreparing(o.id)}
                          disabled={actingId === o.id}
                          className="whitespace-nowrap rounded-lg bg-brand-red px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                        >
                          Start Preparing
                        </button>
                      )}
                      {o.status === "PREPARING" && (
                        <button
                          onClick={() => markReady(o.id)}
                          disabled={actingId === o.id}
                          className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                        >
                          Mark Ready
                        </button>
                      )}
                      {o.status === "READY" && (
                        <button
                          onClick={() => complete(o.id)}
                          disabled={actingId === o.id}
                          className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                        >
                          {o.type === "DELIVERY" || o.type === "ONLINE_DELIVERY" ? "Out for Delivery" : "Complete"}
                        </button>
                      )}
                      <button
                        onClick={() => router.push(`/pos/kitchen-ticket/${o.id}`)}
                        className="whitespace-nowrap rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-brand-red hover:text-brand-red"
                      >
                        Print Ticket
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {tabOrders.length === 0 && (
              <tr>
                <td colSpan={bulkAction ? 8 : 7} className="px-4 py-8 text-center text-neutral-400">
                  No {TAB_LABELS[activeTab].toLowerCase()} orders right now.
                </td>
              </tr>
            )}
            {tabOrders.length > 0 && filteredOrders.length === 0 && (
              <tr>
                <td colSpan={bulkAction ? 8 : 7} className="px-4 py-8 text-center text-neutral-400">
                  No orders match your search/filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
