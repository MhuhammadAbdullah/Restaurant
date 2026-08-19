"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, getAccessToken } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useSelectedBranch } from "../../../lib/useSelectedBranch";
import { useMe, hasPermission } from "../../../lib/useMe";
import { OrderDetailModal, STATUSES, NEXT_STATUS, TERMINAL } from "../../../components/orders/OrderDetailModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { DateRangePopover } from "../../../components/ui/date-range-popover";

type Order = {
  id: string;
  orderNumber: string;
  type: string;
  source: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  grandTotal: number;
  createdAt: string;
  branch: { name: string };
  customer: { name: string; phone: string } | null;
  assignedRider: { name: string } | null;
};

const ORDER_TYPES = ["ONLINE_DELIVERY", "ONLINE_PICKUP", "DINE_IN", "WALK_IN", "TAKEAWAY", "DELIVERY"];
const PAYMENT_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID", "FAILED", "REFUNDED"];

// Local YYYY-MM-DD (matches <input type="date">) — avoids UTC-shift off-by-one near midnight.
function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Default view = last 2 days only, so the page-load query stays cheap; older orders are one
// date-filter change away (server-side range query, not a client-side filter of a full fetch).
function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateInput(d);
}

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { branchId } = useSelectedBranch();
  const { data: me } = useMe();
  const canRefund = hasPermission(me, "orders.refund");
  const canExport = hasPermission(me, "orders.export");
  const canCancel = hasPermission(me, "orders.cancel");
  const canEdit = hasPermission(me, "orders.edit");

  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(() => toDateInput(new Date()));
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTargetStatus, setBulkTargetStatus] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);

  // Deep-link from the notification bell ("?openOrderId=...") — open the modal once, then strip
  // the param so a page refresh/back-nav doesn't keep re-opening it.
  useEffect(() => {
    const openOrderId = searchParams.get("openOrderId");
    if (openOrderId) {
      setDetailOrderId(openOrderId);
      router.replace("/orders");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Filters changed → the underlying result set changed, so any prior selection is stale.
  useEffect(() => {
    setSelected(new Set());
  }, [branchId, statusFilter, sourceFilter, typeFilter, paymentStatusFilter, search, fromDate, toDate]);

  function buildQuery() {
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (paymentStatusFilter) params.set("paymentStatus", paymentStatusFilter);
    if (search.trim()) params.set("search", search.trim());
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return params.toString();
  }

  const { data: orders } = useQuery({
    queryKey: ["admin-orders", branchId, statusFilter, sourceFilter, typeFilter, paymentStatusFilter, search, fromDate, toDate],
    queryFn: () => api.get<Order[]>(`/staff/orders?${buildQuery()}`),
    refetchInterval: 8000,
  });

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    await api.patch(`/staff/orders/${order.id}/status`, { status: next });
    await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  }

  async function cancel(order: Order) {
    await api.patch(`/staff/orders/${order.id}/status`, { status: "CANCELLED" });
    await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  }

  async function refund(order: Order) {
    if (!confirm(`Refund order ${order.orderNumber}? This cannot be undone.`)) return;
    await api.patch(`/staff/orders/${order.id}/status`, { status: "REFUNDED" });
    await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!orders) return;
    setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))));
  }

  async function runBulkStatusChange() {
    if (!bulkTargetStatus || selected.size === 0) return;
    setBulkRunning(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selected).map((id) => api.patch(`/staff/orders/${id}/status`, { status: bulkTargetStatus })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setSelected(new Set());
      setBulkTargetStatus("");
      if (failed > 0) toast.error(`${failed} of ${results.length} orders could not be updated (invalid transition or permission denied).`);
    } finally {
      setBulkRunning(false);
    }
  }

  // "Delete" is intentionally implemented as bulk-cancel, never a hard delete — CLAUDE.md §49
  // requires cancelled orders to stay in history with an auditable reason/user/timestamp.
  async function runBulkCancel() {
    if (selected.size === 0) return;
    const cancellable = orders?.filter((o) => selected.has(o.id) && !TERMINAL.has(o.status)) ?? [];
    if (cancellable.length === 0) {
      toast.error("None of the selected orders can be cancelled (already in a final state).");
      return;
    }
    if (
      !confirm(
        `This will CANCEL ${cancellable.length} order(s), not permanently delete them. Cancelled orders stay in the order history with a record of who cancelled them and when. Continue?`,
      )
    )
      return;
    setBulkRunning(true);
    try {
      const results = await Promise.allSettled(
        cancellable.map((o) => api.patch(`/staff/orders/${o.id}/status`, { status: "CANCELLED" })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setSelected(new Set());
      if (failed > 0) toast.error(`${failed} of ${results.length} orders could not be cancelled (permission denied).`);
    } finally {
      setBulkRunning(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const token = getAccessToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";
      const res = await fetch(`${apiUrl}/staff/orders/export.csv?${buildQuery()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not export orders");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Orders</h1>
        {canExport && (
          <button onClick={exportCsv} disabled={exporting} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:border-brand-red hover:text-brand-red disabled:opacity-50">
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input placeholder="Search order #, name, phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter || "all"} onValueChange={(v) => setSourceFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="POS">POS</SelectItem>
            <SelectItem value="ONLINE">Online</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter || "all"} onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ORDER_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={paymentStatusFilter || "all"} onValueChange={(v) => setPaymentStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment statuses</SelectItem>
            {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateRangePopover from={fromDate} to={toDate} onChange={(from, to) => { setFromDate(from); setToDate(to); }} />
      </div>
      <p className="mt-1.5 text-xs text-neutral-400">Showing the last 2 days by default to keep this page fast. Widen the date range above to load older orders.</p>

      {selected.size > 0 && (canEdit || canCancel) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-red/30 bg-red-50 px-3 py-2">
          <span className="text-sm font-medium text-neutral-700">{selected.size} selected</span>
          {canEdit && (
            <>
              <Select value={bulkTargetStatus || undefined} onValueChange={setBulkTargetStatus}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Change status to…" /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <button
                onClick={runBulkStatusChange}
                disabled={!bulkTargetStatus || bulkRunning}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Apply
              </button>
            </>
          )}
          {canCancel && (
            <button
              onClick={runBulkCancel}
              disabled={bulkRunning}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              Cancel Selected
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="text-sm text-neutral-400 hover:text-neutral-600">Clear</button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="w-8 px-4 py-2">
                <input
                  type="checkbox"
                  checked={!!orders?.length && selected.size === orders.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all orders"
                />
              </th>
              <th className="px-4 py-2">Order #</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Branch</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Payment</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Rider</th>
              <th className="px-4 py-2">Date/Time</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders?.map((o) => (
              <tr key={o.id} className={selected.has(o.id) ? "bg-red-50/40" : undefined}>
                <td className="px-4 py-2">
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelected(o.id)} aria-label={`Select order ${o.orderNumber}`} />
                </td>
                <td className="px-4 py-2 font-medium">
                  <button onClick={() => setDetailOrderId(o.id)} className="hover:text-brand-red hover:underline">{o.orderNumber}</button>
                </td>
                <td className="px-4 py-2 text-xs text-neutral-600">{o.customer?.name ?? "Guest"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${o.source === "POS" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>{o.source}</span>
                </td>
                <td className="px-4 py-2">{o.branch.name}</td>
                <td className="px-4 py-2">{o.type.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">{formatPaisa(o.grandTotal)}</td>
                <td className="px-4 py-2 text-xs">{o.paymentMethod} · {o.paymentStatus}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{o.status}</span>
                </td>
                <td className="px-4 py-2 text-xs text-neutral-500">{o.assignedRider?.name ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-neutral-500 whitespace-nowrap">{new Date(o.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                  {NEXT_STATUS[o.status] && (
                    <button onClick={() => advance(o)} className="text-xs font-medium text-brand-red">
                      {o.status === "PENDING" && NEXT_STATUS[o.status] === "CONFIRMED" ? "Accept" : `Mark ${NEXT_STATUS[o.status]}`}
                    </button>
                  )}
                  {!TERMINAL.has(o.status) && (
                    <button onClick={() => cancel(o)} className="text-xs text-neutral-400">Cancel</button>
                  )}
                  {canRefund && o.paymentStatus !== "REFUNDED" && o.status !== "REFUNDED" && (
                    <button onClick={() => refund(o)} className="text-xs text-red-600">Refund</button>
                  )}
                </td>
              </tr>
            ))}
            {orders?.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-neutral-400">No orders match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailOrderId && <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} onNavigateReceipt={(id) => router.push(`/pos/receipt/${id}`)} />}
    </div>
  );
}
