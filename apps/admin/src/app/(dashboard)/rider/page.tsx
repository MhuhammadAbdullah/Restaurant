"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";

type RiderOrder = {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  grandTotal: number;
  paymentMethod: string;
  contactName: string | null;
  contactPhone: string | null;
  customer: { name: string; phone: string } | null;
  deliveryAddressSnapshot: string | null;
  deliveryArea: string | null;
  deliveryCity: string | null;
  deliveryLandmark: string | null;
  specialInstructions: string | null;
  branch: { name: string };
  riderAssignedAt: string | null;
  createdAt: string;
  collectionStatus: "PAID" | "COLLECTED" | "PENDING" | "N/A";
  isSubmitted: boolean;
  isSettled?: boolean;
};

type CollectionSummary = {
  date: string;
  codOrderCount: number;
  expectedAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  alreadySubmittedAmount: number;
  paidOrderCount: number;
  paidAmount: number;
};

type Submission = {
  id: string;
  codOrderCount: number;
  expectedAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  submittedAmount: number;
  status: string;
  createdAt: string;
};

const DELIVERED = new Set(["DELIVERED", "COMPLETED"]);
const CANCELLED = new Set(["CANCELLED", "REFUNDED"]);
type CollectionFilter = "all" | "cod" | "paid" | "collected" | "pending";

function isToday(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function RiderDashboardPage() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"deliveries" | "collection">("deliveries");
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>("all");
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  const { data: orders } = useQuery({
    queryKey: ["rider-my-orders"],
    queryFn: () => api.get<RiderOrder[]>("/staff/riders/me/orders"),
    refetchInterval: 8000,
  });

  const { data: summary } = useQuery({
    queryKey: ["rider-my-collection-summary"],
    queryFn: () => api.get<CollectionSummary>("/staff/riders/me/collection-summary"),
    enabled: tab === "collection",
    refetchInterval: 15000,
  });

  const { data: submissions } = useQuery({
    queryKey: ["rider-my-collection-submissions"],
    queryFn: () => api.get<Submission[]>("/staff/riders/me/collection-submissions"),
    enabled: tab === "collection",
  });

  const grouped = useMemo(() => {
    const all = orders ?? [];
    return {
      pending: all.filter((o) => !DELIVERED.has(o.status) && !CANCELLED.has(o.status)),
      delivered: all.filter((o) => DELIVERED.has(o.status)),
      cancelled: all.filter((o) => CANCELLED.has(o.status)),
    };
  }, [orders]);

  const todayAssigned = (orders ?? []).filter((o) => isToday(o.riderAssignedAt)).length;
  const todayDelivered = (orders ?? []).filter((o) => DELIVERED.has(o.status) && isToday(o.riderAssignedAt)).length;

  const collectionOrders = useMemo(() => {
    const all = (orders ?? []).filter((o) => o.collectionStatus !== "N/A");
    switch (collectionFilter) {
      case "cod": return all.filter((o) => o.paymentMethod === "COD");
      case "paid": return all.filter((o) => o.collectionStatus === "PAID");
      case "collected": return all.filter((o) => o.collectionStatus === "COLLECTED");
      case "pending": return all.filter((o) => o.collectionStatus === "PENDING");
      default: return all;
    }
  }, [orders, collectionFilter]);

  async function markStatus(order: RiderOrder, status: "OUT_FOR_DELIVERY" | "DELIVERED") {
    setBusyId(order.id);
    try {
      await api.patch(`/staff/orders/${order.id}/rider-status`, { status });
      await queryClient.invalidateQueries({ queryKey: ["rider-my-orders"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update delivery status");
    } finally {
      setBusyId(null);
    }
  }

  async function submitCollection() {
    setSubmitting(true);
    try {
      await api.post("/staff/riders/me/collection-submissions", {});
      setConfirmingSubmit(false);
      await queryClient.invalidateQueries({ queryKey: ["rider-my-collection-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["rider-my-collection-submissions"] });
      await queryClient.invalidateQueries({ queryKey: ["rider-my-orders"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not submit collection");
    } finally {
      setSubmitting(false);
    }
  }

  function OrderCard({ order }: { order: RiderOrder }) {
    const address = [order.deliveryAddressSnapshot, order.deliveryArea, order.deliveryCity, order.deliveryLandmark].filter(Boolean).join(", ");
    return (
      <div className="rounded-lg border border-neutral-200 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-neutral-900">{order.orderNumber}</p>
            <p className="text-xs text-neutral-500">{order.branch.name} · {order.type.replace(/_/g, " ")}</p>
          </div>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{order.status.replace(/_/g, " ")}</span>
        </div>
        <div className="mt-2 space-y-0.5 text-xs text-neutral-600">
          <p>{order.contactName ?? order.customer?.name ?? "Guest"} · {order.contactPhone ?? order.customer?.phone ?? "—"}</p>
          {address && <p className="text-neutral-500">{address}</p>}
          {order.specialInstructions && <p className="italic text-neutral-400">"{order.specialInstructions}"</p>}
          <p className="flex items-center gap-1.5 font-medium text-neutral-900">
            {formatPaisa(order.grandTotal)}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${order.paymentMethod === "COD" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
              {order.paymentMethod === "COD" ? "COD" : "Paid"}
            </span>
          </p>
        </div>
        {order.status !== "OUT_FOR_DELIVERY" && !DELIVERED.has(order.status) && !CANCELLED.has(order.status) && (
          <button onClick={() => markStatus(order, "OUT_FOR_DELIVERY")} disabled={busyId === order.id} className="mt-2 w-full rounded-lg bg-brand-red py-1.5 text-xs font-medium text-white disabled:opacity-50">
            Mark Out for Delivery
          </button>
        )}
        {order.status === "OUT_FOR_DELIVERY" && (
          <button onClick={() => markStatus(order, "DELIVERED")} disabled={busyId === order.id} className="mt-2 w-full rounded-lg bg-brand-red py-1.5 text-xs font-medium text-white disabled:opacity-50">
            Mark Delivered
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">My Deliveries</h1>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Today Assigned</p><p className="text-lg font-semibold">{todayAssigned}</p></div>
        <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Today Delivered</p><p className="text-lg font-semibold text-green-600">{todayDelivered}</p></div>
        <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Pending</p><p className="text-lg font-semibold text-amber-600">{grouped.pending.length}</p></div>
        <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Cancelled</p><p className="text-lg font-semibold text-red-600">{grouped.cancelled.length}</p></div>
      </div>

      <div className="mt-5 flex gap-2 border-b border-neutral-200">
        <button onClick={() => setTab("deliveries")} className={`px-3 py-2 text-sm font-medium ${tab === "deliveries" ? "border-b-2 border-brand-red text-brand-red" : "text-neutral-500"}`}>Deliveries</button>
        <button onClick={() => setTab("collection")} className={`px-3 py-2 text-sm font-medium ${tab === "collection" ? "border-b-2 border-brand-red text-brand-red" : "text-neutral-500"}`}>Collection</button>
      </div>

      {tab === "deliveries" && (
        <>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase text-neutral-500">Pending Deliveries</p>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.pending.map((o) => <OrderCard key={o.id} order={o} />)}
              {grouped.pending.length === 0 && <p className="text-sm text-neutral-400">Nothing pending right now.</p>}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase text-neutral-500">Delivered</p>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.delivered.slice(0, 12).map((o) => <OrderCard key={o.id} order={o} />)}
              {grouped.delivered.length === 0 && <p className="text-sm text-neutral-400">No deliveries completed yet.</p>}
            </div>
          </div>
        </>
      )}

      {tab === "collection" && (
        <div className="mt-4">
          {summary && (
            <div className="rounded-xl border border-neutral-200 p-4">
              <p className="text-sm font-semibold text-neutral-900">Today's Collection</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div><p className="text-xs text-neutral-500">COD Orders</p><p className="text-lg font-semibold">{summary.codOrderCount}</p></div>
                <div><p className="text-xs text-neutral-500">Cash in hand</p><p className="text-lg font-semibold text-red-600">{formatPaisa(summary.collectedAmount)}</p></div>
                <div><p className="text-xs text-neutral-500">Pending</p><p className="text-lg font-semibold text-amber-600">{formatPaisa(summary.pendingAmount)}</p></div>
                <div><p className="text-xs text-neutral-500">Paid Orders</p><p className="text-lg font-semibold text-blue-600">{summary.paidOrderCount}</p></div>
              </div>
              {summary.collectedAmount > 0 && (
                <button onClick={() => setConfirmingSubmit(true)} className="mt-3 w-full rounded-lg bg-brand-red py-2 text-sm font-semibold text-white sm:w-auto sm:px-6">
                  Submit Collection
                </button>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {(["all", "cod", "paid", "collected", "pending"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setCollectionFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs capitalize ${collectionFilter === f ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-300 text-neutral-600"}`}
              >
                {f === "all" ? "All" : f === "cod" ? "COD" : f === "paid" ? "Paid" : f === "collected" ? "Cash in hand" : "Pending Collection"}
              </button>
            ))}
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 font-medium">Collection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {collectionOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5 font-medium">{o.orderNumber}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{o.contactName ?? o.customer?.name ?? "Guest"}</td>
                    <td className="px-4 py-2.5">{formatPaisa(o.grandTotal)}</td>
                    <td className="px-4 py-2.5 text-xs">{o.paymentMethod}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.collectionStatus === "COLLECTED" ? "bg-green-50 text-green-700" : o.collectionStatus === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                        {o.collectionStatus === "COLLECTED" && o.isSettled ? "Received by admin" : o.collectionStatus === "COLLECTED" && o.isSubmitted ? "Handed in — awaiting admin" : o.collectionStatus === "COLLECTED" ? "Cash in hand" : o.collectionStatus === "PENDING" ? "Pending" : "Paid"}
                      </span>
                    </td>
                  </tr>
                ))}
                {collectionOrders.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">Nothing here yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-5 text-xs font-semibold uppercase text-neutral-500">Collection History</p>
          <div className="mt-1.5 overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">COD Orders</th>
                  <th className="px-4 py-2.5 font-medium">Submitted</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {submissions?.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{new Date(s.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-2.5">{s.codOrderCount}</td>
                    <td className="px-4 py-2.5 font-medium">{formatPaisa(s.submittedAmount)}</td>
                    <td className="px-4 py-2.5"><span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">{s.status}</span></td>
                  </tr>
                ))}
                {submissions?.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-400">No submissions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmingSubmit && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmingSubmit(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-neutral-900">Collection Closing</p>
            <p className="mt-0.5 text-xs text-neutral-400">Date: {new Date().toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })}</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">COD Orders</span><span>{summary.codOrderCount}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Expected Collection</span><span>{formatPaisa(summary.expectedAmount)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Cash in hand</span><span className="text-red-600">{formatPaisa(summary.collectedAmount)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Pending</span><span className="text-amber-600">{formatPaisa(summary.pendingAmount)}</span></div>
              <div className="flex justify-between border-t border-neutral-100 pt-1.5"><span className="text-neutral-500">Paid Orders</span><span>{summary.paidOrderCount} · {formatPaisa(summary.paidAmount)}</span></div>
              <div className="flex justify-between border-t border-neutral-200 pt-1.5 text-base font-semibold text-neutral-900"><span>Cash to Submit</span><span>{formatPaisa(summary.collectedAmount)}</span></div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmingSubmit(false)} className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm">Cancel</button>
              <button onClick={submitCollection} disabled={submitting} className="flex-1 rounded-lg bg-brand-red py-2 text-sm font-medium text-white disabled:opacity-50">
                {submitting ? "Submitting..." : "Submit Collection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
