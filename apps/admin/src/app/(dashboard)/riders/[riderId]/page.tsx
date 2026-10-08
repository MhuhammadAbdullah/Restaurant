"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { FaArrowLeft, FaBan, FaTriangleExclamation, FaCheck, FaClipboardList, FaClock, FaMoneyBillWave, FaMotorcycle, FaPhone } from "react-icons/fa6";
import { api, ApiError } from "../../../../lib/api";
import { toast } from "../../../../store/useToastStore";
import { DateRangePopover } from "../../../../components/ui/date-range-popover";
import { Skeleton } from "../../../../components/ui/skeleton";
import { OrderDetailModal } from "../../../../components/orders/OrderDetailModal";

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
  /** COD only: true once an admin has received the rider's cash and the order is PAID. */
  isSettled: boolean;
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
  settledAmount: number;
  unsettledAmount: number;
};
type Unsettled = {
  orderCount: number;
  totalAmount: number;
  handedInAmount: number;
  notHandedInAmount: number;
  oldestDeliveredAt: string | null;
  orders: { id: string; orderNumber: string; customerName: string; amount: number; deliveredAt: string; handedIn: boolean }[];
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

const DATE_MODES: { key: DateMode; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "specific", label: "Specific Date" },
  { key: "range", label: "Date Range" },
];

function DateFilterBar({ f }: { f: ReturnType<typeof useDateFilter> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-neutral-300 bg-white p-0.5 text-xs">
        {DATE_MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => f.setMode(m.key)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${f.mode === m.key ? "bg-brand-red text-white" : "text-neutral-500 hover:text-neutral-900"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {f.mode === "specific" && <DateRangePopover from={f.specificDate} to={f.specificDate} onChange={(from) => f.setSpecificDate(from)} />}
      {f.mode === "range" && (
        <DateRangePopover
          from={f.fromDate}
          to={f.toDate}
          onChange={(from, to) => {
            f.setFromDate(from);
            f.setToDate(to);
          }}
        />
      )}
    </div>
  );
}

const STATUS_CHIP: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  PREPARING: "bg-orange-50 text-orange-700",
  READY: "bg-purple-50 text-purple-700",
  OUT_FOR_DELIVERY: "bg-cyan-50 text-cyan-700",
  DELIVERED: "bg-green-50 text-green-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-red-700",
  REFUNDED: "bg-neutral-100 text-neutral-600",
};

/** Where the money is. A delivered COD order is NOT paid until an admin receives the rider's cash. */
function paymentBadge(d: Delivery): { cls: string; label: string } | null {
  if (d.paymentMethod !== "COD") return d.collectionStatus === "N/A" ? null : { cls: "bg-blue-50 text-blue-700", label: "Paid online" };
  if (d.collectionStatus === "N/A") return null;
  if (d.isSettled) return { cls: "bg-green-50 text-green-700", label: "Cash received" };
  if (d.collectionStatus === "COLLECTED") {
    return d.isSubmitted ? { cls: "bg-amber-50 text-amber-700", label: "Handed in — awaiting admin" } : { cls: "bg-red-50 text-red-700", label: "Cash with rider" };
  }
  return { cls: "bg-neutral-100 text-neutral-600", label: "Cash on delivery" };
}

function hoursAgo(iso: string): string {
  const hrs = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (hrs < 1) return "less than an hour ago";
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <p className="mt-2 text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function RiderDetailPage() {
  const params = useParams<{ riderId: string }>();
  const router = useRouter();
  const riderId = params.riderId;
  const [tab, setTab] = useState<"deliveries" | "collections">("deliveries");
  const [deliveryFilter, setDeliveryFilter] = useState<"" | "pending" | "delivered">("");
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [counted, setCounted] = useState("");
  const [settling, setSettling] = useState(false);
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

  const { data: unsettled } = useQuery({
    queryKey: ["rider-unsettled", riderId],
    queryFn: () => api.get<Unsettled>(`/staff/riders/${riderId}/unsettled`),
    refetchInterval: 30000,
  });

  const pickedOrders = (unsettled?.orders ?? []).filter((o) => picked.has(o.id));
  const pickedTotal = pickedOrders.reduce((sum, o) => sum + o.amount, 0);
  const countedPaisa = counted.trim() ? Math.round(Number(counted) * 100) : null;
  const countedMatches = countedPaisa != null && pickedTotal > 0 && countedPaisa === pickedTotal;

  function togglePicked(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function togglePickAll() {
    const all = unsettled?.orders ?? [];
    setPicked((s) => (s.size === all.length ? new Set() : new Set(all.map((o) => o.id))));
  }

  async function settleCash() {
    if (!countedMatches || pickedOrders.length === 0) return;
    const ok = window.confirm(`Confirm you have received ${formatPaisa(pickedTotal)} in cash from ${rider?.name ?? "the rider"} for ${pickedOrders.length} order${pickedOrders.length === 1 ? "" : "s"}? These orders will be marked PAID.`);
    if (!ok) return;
    setSettling(true);
    try {
      await api.post("/staff/orders/settle-cod", { orderIds: pickedOrders.map((o) => o.id), receivedAmount: pickedTotal });
      toast.success(`${formatPaisa(pickedTotal)} received — ${pickedOrders.length} order${pickedOrders.length === 1 ? "" : "s"} marked paid`);
      setPicked(new Set());
      setCounted("");
      await Promise.all(
        ["rider-unsettled", "rider-deliveries", "rider-collection-summary", "rider-collection-submissions", "riders"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not record the cash");
    } finally {
      setSettling(false);
    }
  }

  const deliverySummary = useMemo(() => {
    const list = deliveries ?? [];
    return {
      count: list.length,
      total: list.reduce((s, d) => s + d.grandTotal, 0),
      cashToCollect: list.filter((d) => d.collectionStatus === "PENDING").reduce((s, d) => s + d.grandTotal, 0),
    };
  }, [deliveries]);

  const completion = todayStats && todayStats.assigned > 0 ? Math.round((todayStats.delivered / todayStats.assigned) * 100) : null;

  return (
    <div>
      <button onClick={() => router.push("/riders")} className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-brand-red">
        <FaArrowLeft size={10} /> Back to Riders
      </button>

      {/* Profile */}
      <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
        {rider ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-xl font-semibold text-brand-red">
                {rider.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-neutral-900">{rider.name}</h1>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${rider.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {rider.status === "ACTIVE" ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500">
                  {rider.phone ? (
                    <a href={`tel:${rider.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-brand-red">
                      <FaPhone size={11} /> {rider.phone}
                    </a>
                  ) : (
                    <span>No phone on file</span>
                  )}
                  {rider.branches.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {rider.branches.map((b) => (
                        <span key={b.id} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">{b.name}</span>
                      ))}
                    </span>
                  ) : (
                    <span>No branch assigned</span>
                  )}
                </div>
              </div>
            </div>
            {unsettled && unsettled.totalAmount > 0 && (
              <button
                onClick={() => setTab("collections")}
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-left transition hover:bg-red-100"
              >
                <FaTriangleExclamation size={14} className="text-red-600" />
                <span>
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-red-700">Cash with rider</span>
                  <span className="block text-base font-bold text-red-700">{formatPaisa(unsettled.totalAmount)}</span>
                </span>
              </button>
            )}
            {completion != null && (
              <div className="w-full sm:w-56">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Today&apos;s completion</span>
                  <span className="font-semibold text-neutral-900">{completion}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${completion}%` }} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        )}
      </div>

      {/* Today at a glance */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {todayStats ? (
          <>
            <StatCard icon={<FaClipboardList size={15} />} label="Assigned today" value={todayStats.assigned} tone="bg-blue-50 text-blue-600" />
            <StatCard icon={<FaCheck size={14} />} label="Delivered today" value={todayStats.delivered} tone="bg-green-50 text-green-600" />
            <StatCard icon={<FaClock size={14} />} label="Pending" value={todayStats.pending} tone="bg-amber-50 text-amber-600" />
            <StatCard icon={<FaBan size={14} />} label="Cancelled" value={todayStats.cancelled} tone="bg-red-50 text-red-600" />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 p-4">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="mt-3 h-3 w-20" />
              <Skeleton className="mt-2 h-6 w-12" />
            </div>
          ))
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-neutral-200">
        {([
          { key: "deliveries", label: "Deliveries", icon: <FaMotorcycle size={13} /> },
          { key: "collections", label: "Cash Collections", icon: <FaMoneyBillWave size={13} /> },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.key ? "border-brand-red text-brand-red" : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "deliveries" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex flex-wrap gap-1.5">
              {(["", "pending", "delivered"] as const).map((v) => (
                <button
                  key={v || "all"}
                  onClick={() => setDeliveryFilter(v)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                    deliveryFilter === v ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 text-neutral-600 hover:border-brand-red hover:text-brand-red"
                  }`}
                >
                  {v === "" ? "All" : v === "pending" ? "Pending deliveries" : "Delivered"}
                </button>
              ))}
            </div>
            <DateFilterBar f={deliveryDates} />
          </div>

          {deliveries && deliveries.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 px-1 text-sm text-neutral-600">
              <span><span className="font-semibold text-neutral-900">{deliverySummary.count}</span> order{deliverySummary.count === 1 ? "" : "s"}</span>
              <span>Order value <span className="font-semibold text-neutral-900">{formatPaisa(deliverySummary.total)}</span></span>
              {deliverySummary.cashToCollect > 0 && <span>Cash still to collect <span className="font-semibold text-amber-700">{formatPaisa(deliverySummary.cashToCollect)}</span></span>}
            </div>
          )}

          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 font-medium">Assigned</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {deliveries?.map((d) => {
                  const col = paymentBadge(d);
                  return (
                    <tr key={d.id} onClick={() => setDetailOrderId(d.id)} className="cursor-pointer transition hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-brand-red">{d.orderNumber}</p>
                        <p className="text-[11px] text-neutral-400">{d.type.replace(/_/g, " ")}</p>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{d.contactName ?? d.customer?.name ?? "Guest"}</td>
                      <td className="px-4 py-3 font-semibold text-neutral-900">{formatPaisa(d.grandTotal)}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-neutral-700">{d.paymentMethod}</p>
                        {col && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${col.cls}`}>{col.label}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">{fmtDateTime(d.riderAssignedAt ?? d.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[d.status] ?? "bg-neutral-100 text-neutral-600"}`}>{d.status.replace(/_/g, " ")}</span>
                      </td>
                    </tr>
                  );
                })}
                {!deliveries && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Loading deliveries...</td></tr>
                )}
                {deliveries?.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-neutral-400">No deliveries match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutral-400">Click an order to open its full details.</p>
        </div>
      )}

      {tab === "collections" && (
        <div className="mt-4">
          {/* Cash still in the rider's pocket — only an admin receiving it turns these orders PAID. */}
          <div className={`rounded-xl border p-4 ${unsettled && unsettled.totalAmount > 0 ? "border-red-200 bg-red-50/40" : "border-neutral-200 bg-white"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                  <FaMoneyBillWave size={14} className="text-brand-red" /> Cash with rider — not yet received
                </p>
                <p className="mt-1 max-w-xl text-xs text-neutral-500">
                  A delivered cash-on-delivery order stays <span className="font-medium text-neutral-700">unpaid</span> until you receive the cash from the rider and confirm it below.
                </p>
              </div>
              {unsettled && (
                <div className="text-right">
                  <p className={`text-2xl font-bold ${unsettled.totalAmount > 0 ? "text-red-600" : "text-green-600"}`}>{formatPaisa(unsettled.totalAmount)}</p>
                  <p className="text-xs text-neutral-500">
                    {unsettled.orderCount} order{unsettled.orderCount === 1 ? "" : "s"}
                    {unsettled.oldestDeliveredAt && ` · oldest delivered ${hoursAgo(unsettled.oldestDeliveredAt)}`}
                  </p>
                </div>
              )}
            </div>

            {!unsettled ? (
              <Skeleton className="mt-4 h-20 w-full" />
            ) : unsettled.orders.length === 0 ? (
              <p className="mt-4 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700">All delivered cash has been received — nothing outstanding for this rider.</p>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input type="checkbox" checked={picked.size === unsettled.orders.length} onChange={togglePickAll} aria-label="Select all" className="h-4 w-4 accent-brand-red" />
                        </th>
                        <th className="px-3 py-2 font-medium">Order</th>
                        <th className="px-3 py-2 font-medium">Customer</th>
                        <th className="px-3 py-2 font-medium">Cash owed</th>
                        <th className="px-3 py-2 font-medium">Delivered</th>
                        <th className="px-3 py-2 font-medium">Hand-in</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {unsettled.orders.map((o) => (
                        <tr key={o.id} className={picked.has(o.id) ? "bg-red-50/60" : "hover:bg-neutral-50"}>
                          <td className="px-3 py-2.5">
                            <input type="checkbox" checked={picked.has(o.id)} onChange={() => togglePicked(o.id)} aria-label={`Select ${o.orderNumber}`} className="h-4 w-4 accent-brand-red" />
                          </td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => setDetailOrderId(o.id)} className="font-semibold text-brand-red hover:underline">{o.orderNumber}</button>
                          </td>
                          <td className="px-3 py-2.5 text-neutral-700">{o.customerName}</td>
                          <td className="px-3 py-2.5 font-semibold text-neutral-900">{formatPaisa(o.amount)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-500">{fmtDateTime(o.deliveredAt)} · {hoursAgo(o.deliveredAt)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${o.handedIn ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                              {o.handedIn ? "Handed in — awaiting you" : "Not handed in yet"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-lg bg-white p-3 ring-1 ring-neutral-200">
                  <div className="text-sm">
                    <p className="text-neutral-500">
                      {pickedOrders.length === 0 ? "Select the orders whose cash you received." : `${pickedOrders.length} selected`}
                    </p>
                    <p className="text-lg font-bold text-neutral-900">{formatPaisa(pickedTotal)}</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-neutral-500">Cash counted (Rs.)</label>
                      <input
                        type="number"
                        min={0}
                        value={counted}
                        onChange={(e) => setCounted(e.target.value)}
                        disabled={pickedOrders.length === 0}
                        placeholder="Enter the amount received"
                        className="w-48 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-red focus:outline-none disabled:bg-neutral-50"
                      />
                    </div>
                    <button
                      onClick={settleCash}
                      disabled={!countedMatches || settling}
                      className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {settling ? "Saving..." : "Mark cash received"}
                    </button>
                  </div>
                  {countedPaisa != null && pickedTotal > 0 && countedPaisa !== pickedTotal && (
                    <p className="w-full text-xs font-medium text-red-600">
                      {countedPaisa < pickedTotal ? `Short by ${formatPaisa(pickedTotal - countedPaisa)}` : `Over by ${formatPaisa(countedPaisa - pickedTotal)}`} — the amount must match the selected orders. Deselect any order whose cash was not handed over.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-3">
            <DateFilterBar f={collectionDates} />
          </div>

          {collectionSummary ? (
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard icon={<FaClipboardList size={15} />} label="Cash on delivery orders" value={collectionSummary.codOrderCount} tone="bg-neutral-100 text-neutral-600" />
              <StatCard icon={<FaMoneyBillWave size={15} />} label="Delivered, cash not handed in" value={<span className="text-green-600">{formatPaisa(collectionSummary.collectedAmount)}</span>} tone="bg-green-50 text-green-600" />
              <StatCard icon={<FaClock size={14} />} label="Not delivered yet" value={<span className="text-amber-600">{formatPaisa(collectionSummary.pendingAmount)}</span>} tone="bg-amber-50 text-amber-600" />
              <StatCard
                icon={<FaCheck size={14} />}
                label="Paid online"
                value={
                  <span className="text-blue-600">
                    {collectionSummary.paidOrderCount} <span className="text-sm font-normal text-neutral-500">· {formatPaisa(collectionSummary.paidAmount)}</span>
                  </span>
                }
                tone="bg-blue-50 text-blue-600"
              />
              {collectionSummary.settledAmount > 0 && (
                <StatCard icon={<FaCheck size={14} />} label="Cash received by admin" value={<span className="text-green-600">{formatPaisa(collectionSummary.settledAmount)}</span>} tone="bg-green-50 text-green-600" />
              )}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-neutral-200 p-4">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="mt-3 h-3 w-24" />
                  <Skeleton className="mt-2 h-6 w-16" />
                </div>
              ))}
            </div>
          )}

          <p className="mt-6 text-sm font-semibold text-neutral-800">Collection submissions</p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Submitted on</th>
                  <th className="px-4 py-2.5 font-medium">Branch</th>
                  <th className="px-4 py-2.5 font-medium">COD orders</th>
                  <th className="px-4 py-2.5 font-medium">Expected</th>
                  <th className="px-4 py-2.5 font-medium">Collected</th>
                  <th className="px-4 py-2.5 font-medium">Pending</th>
                  <th className="px-4 py-2.5 font-medium">Submitted</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {submissions?.map((s) => (
                  <tr key={s.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">{fmtDateTime(s.createdAt)}</td>
                    <td className="px-4 py-3 text-neutral-700">{s.branch.name}</td>
                    <td className="px-4 py-3 text-neutral-700">{s.codOrderCount}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatPaisa(s.expectedAmount)}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatPaisa(s.collectedAmount)}</td>
                    <td className={`px-4 py-3 ${s.pendingAmount > 0 ? "font-medium text-amber-700" : "text-neutral-700"}`}>{formatPaisa(s.pendingAmount)}</td>
                    <td className="px-4 py-3 font-semibold text-neutral-900">{formatPaisa(s.submittedAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.status === "RECEIVED" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                        {s.status === "RECEIVED" ? "Received by admin" : "Awaiting admin"}
                      </span>
                    </td>
                  </tr>
                ))}
                {!submissions && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-neutral-400">Loading submissions...</td></tr>
                )}
                {submissions?.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-neutral-400">No collection submissions in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailOrderId && (
        <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} onNavigateReceipt={(id) => router.push(`/pos/receipt/${id}`)} />
      )}
    </div>
  );
}
