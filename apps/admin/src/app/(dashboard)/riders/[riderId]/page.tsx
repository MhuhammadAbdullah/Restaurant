"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api } from "../../../../lib/api";
import { DateRangePopover } from "../../../../components/ui/date-range-popover";

type RiderDetail = { id: string; name: string; phone: string | null; status: "ACTIVE" | "INACTIVE"; branches: { id: string; name: string }[] };
type Stats = { date: string; assigned: number; delivered: number; cancelled: number; pending: number };
type Delivery = {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  contactName: string | null;
  customer: { name: string } | null;
  riderAssignedAt: string | null;
  estimatedDeliveryAt: string | null;
  updatedAt: string;
  collectionStatus: "PAID" | "COLLECTED" | "PENDING" | "N/A";
  isSubmitted: boolean;
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
  branch: { name: string };
  codOrderCount: number;
  expectedAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  submittedAmount: number;
  status: string;
  createdAt: string;
};

type DateMode = "today" | "yesterday" | "specific" | "range";

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function useDateFilter() {
  const [mode, setMode] = useState<DateMode>("today");
  const [specificDate, setSpecificDate] = useState(() => toDateInput(new Date()));
  const [fromDate, setFromDate] = useState(() => toDateInput(new Date()));
  const [toDate, setToDate] = useState(() => toDateInput(new Date()));

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (mode === "today") p.date = toDateInput(new Date());
    else if (mode === "yesterday") p.date = toDateInput(new Date(Date.now() - 86400000));
    else if (mode === "specific") p.date = specificDate;
    else {
      p.from = fromDate;
      p.to = toDate;
    }
    return p;
  }, [mode, specificDate, fromDate, toDate]);

  return { mode, setMode, specificDate, setSpecificDate, fromDate, setFromDate, toDate, setToDate, params };
}

function DateFilterBar({ f }: { f: ReturnType<typeof useDateFilter> }) {
  const btn = (active: boolean) => `rounded-full border px-3 py-1 text-xs ${active ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-300 text-neutral-600"}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => f.setMode("today")} className={btn(f.mode === "today")}>Today</button>
      <button onClick={() => f.setMode("yesterday")} className={btn(f.mode === "yesterday")}>Yesterday</button>
      <button onClick={() => f.setMode("specific")} className={btn(f.mode === "specific")}>Specific Date</button>
      {f.mode === "specific" && (
        <DateRangePopover from={f.specificDate} to={f.specificDate} onChange={(from) => f.setSpecificDate(from)} />
      )}
      <button onClick={() => f.setMode("range")} className={btn(f.mode === "range")}>Date Range</button>
      {f.mode === "range" && (
        <DateRangePopover from={f.fromDate} to={f.toDate} onChange={(from, to) => { f.setFromDate(from); f.setToDate(to); }} />
      )}
    </div>
  );
}

const COLLECTION_BADGE: Record<Delivery["collectionStatus"], string> = {
  PAID: "bg-blue-50 text-blue-700",
  COLLECTED: "bg-green-50 text-green-700",
  PENDING: "bg-amber-50 text-amber-700",
  "N/A": "bg-neutral-100 text-neutral-500",
};

export default function RiderDetailPage() {
  const params = useParams<{ riderId: string }>();
  const router = useRouter();
  const riderId = params.riderId;
  const [tab, setTab] = useState<"deliveries" | "collections">("deliveries");
  const [deliveryFilter, setDeliveryFilter] = useState<"" | "pending" | "delivered">("");
  const deliveryDates = useDateFilter();
  const collectionDates = useDateFilter();

  const { data: rider } = useQuery({ queryKey: ["rider-detail", riderId], queryFn: () => api.get<RiderDetail>(`/staff/riders/${riderId}`) });
  const { data: todayStats } = useQuery({ queryKey: ["rider-stats", riderId], queryFn: () => api.get<Stats>(`/staff/riders/${riderId}/stats`) });

  const { data: deliveries } = useQuery({
    queryKey: ["rider-deliveries", riderId, deliveryFilter, deliveryDates.params],
    queryFn: () => {
      const p = new URLSearchParams(deliveryDates.params);
      if (deliveryFilter) p.set("status", deliveryFilter);
      return api.get<Delivery[]>(`/staff/riders/${riderId}/deliveries?${p.toString()}`);
    },
    enabled: tab === "deliveries",
  });

  const { data: collectionSummary } = useQuery({
    queryKey: ["rider-collection-summary", riderId, collectionDates.params.date],
    queryFn: () => api.get<CollectionSummary>(`/staff/riders/${riderId}/collection-summary${collectionDates.params.date ? `?date=${collectionDates.params.date}` : ""}`),
    enabled: tab === "collections",
  });

  const { data: submissions } = useQuery({
    queryKey: ["rider-collection-submissions", riderId, collectionDates.params],
    queryFn: () => {
      const p = new URLSearchParams(collectionDates.params);
      return api.get<Submission[]>(`/staff/riders/${riderId}/collection-submissions?${p.toString()}`);
    },
    enabled: tab === "collections",
  });

  return (
    <div>
      <button onClick={() => router.push("/riders")} className="text-xs font-medium text-neutral-400 hover:text-brand-red">← Back to Riders</button>

      {rider && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">{rider.name}</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              {rider.phone ?? "No phone"} · {rider.branches.map((b) => b.name).join(", ") || "No branch"}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${rider.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {rider.status === "ACTIVE" ? "Active" : "Inactive"}
          </span>
        </div>
      )}

      {todayStats && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Today Assigned</p><p className="text-lg font-semibold">{todayStats.assigned}</p></div>
          <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Today Delivered</p><p className="text-lg font-semibold text-green-600">{todayStats.delivered}</p></div>
          <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Pending</p><p className="text-lg font-semibold text-amber-600">{todayStats.pending}</p></div>
          <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Cancelled</p><p className="text-lg font-semibold text-red-600">{todayStats.cancelled}</p></div>
        </div>
      )}

      <div className="mt-5 flex gap-2 border-b border-neutral-200">
        <button onClick={() => setTab("deliveries")} className={`px-3 py-2 text-sm font-medium ${tab === "deliveries" ? "border-b-2 border-brand-red text-brand-red" : "text-neutral-500"}`}>Deliveries</button>
        <button onClick={() => setTab("collections")} className={`px-3 py-2 text-sm font-medium ${tab === "collections" ? "border-b-2 border-brand-red text-brand-red" : "text-neutral-500"}`}>Collections</button>
      </div>

      {tab === "deliveries" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {(["", "pending", "delivered"] as const).map((v) => (
                <button
                  key={v || "all"}
                  onClick={() => setDeliveryFilter(v)}
                  className={`rounded-full border px-3 py-1 text-xs ${deliveryFilter === v ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-300 text-neutral-600"}`}
                >
                  {v === "" ? "All" : v === "pending" ? "Pending Deliveries" : "Delivered Orders"}
                </button>
              ))}
            </div>
            <DateFilterBar f={deliveryDates} />
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order ID</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {deliveries?.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2.5 font-medium">{d.orderNumber}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{d.contactName ?? d.customer?.name ?? "Guest"}</td>
                    <td className="px-4 py-2.5">{formatPaisa(d.grandTotal)}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{d.type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5 text-xs">{d.paymentMethod}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">
                      {new Date(d.riderAssignedAt ?? d.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-1">
                        <span className="w-fit rounded-full bg-neutral-100 px-2 py-0.5 text-[11px]">{d.status.replace(/_/g, " ")}</span>
                        <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${COLLECTION_BADGE[d.collectionStatus]}`}>
                          {d.collectionStatus === "COLLECTED" && d.isSubmitted ? "Submitted" : d.collectionStatus === "N/A" ? "—" : d.collectionStatus === "COLLECTED" ? "Collected" : d.collectionStatus === "PENDING" ? "Pending" : "Paid"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {deliveries?.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">No deliveries match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "collections" && (
        <div className="mt-4">
          <DateFilterBar f={collectionDates} />

          {collectionSummary && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">COD Orders</p><p className="text-lg font-semibold">{collectionSummary.codOrderCount}</p></div>
              <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Collected (unsubmitted)</p><p className="text-lg font-semibold text-green-600">{formatPaisa(collectionSummary.collectedAmount)}</p></div>
              <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Pending Collection</p><p className="text-lg font-semibold text-amber-600">{formatPaisa(collectionSummary.pendingAmount)}</p></div>
              <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Paid Orders</p><p className="text-lg font-semibold text-blue-600">{collectionSummary.paidOrderCount} · {formatPaisa(collectionSummary.paidAmount)}</p></div>
              {collectionSummary.alreadySubmittedAmount > 0 && (
                <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Already Submitted</p><p className="text-lg font-semibold text-neutral-700">{formatPaisa(collectionSummary.alreadySubmittedAmount)}</p></div>
              )}
            </div>
          )}

          <p className="mt-5 text-xs font-semibold uppercase text-neutral-500">Collection Submissions</p>
          <div className="mt-1.5 overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Branch</th>
                  <th className="px-4 py-2.5 font-medium">COD Orders</th>
                  <th className="px-4 py-2.5 font-medium">Expected</th>
                  <th className="px-4 py-2.5 font-medium">Collected</th>
                  <th className="px-4 py-2.5 font-medium">Pending</th>
                  <th className="px-4 py-2.5 font-medium">Submitted</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {submissions?.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{new Date(s.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-2.5 text-xs">{s.branch.name}</td>
                    <td className="px-4 py-2.5">{s.codOrderCount}</td>
                    <td className="px-4 py-2.5">{formatPaisa(s.expectedAmount)}</td>
                    <td className="px-4 py-2.5">{formatPaisa(s.collectedAmount)}</td>
                    <td className="px-4 py-2.5">{formatPaisa(s.pendingAmount)}</td>
                    <td className="px-4 py-2.5 font-medium">{formatPaisa(s.submittedAmount)}</td>
                    <td className="px-4 py-2.5"><span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">{s.status}</span></td>
                  </tr>
                ))}
                {submissions?.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-neutral-400">No collection submissions in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
