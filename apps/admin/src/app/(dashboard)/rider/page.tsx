"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FaBan,
  FaBoxOpen,
  FaCircleCheck,
  FaClockRotateLeft,
  FaHandHoldingDollar,
  FaLocationDot,
  FaMapLocationDot,
  FaMotorcycle,
  FaPhone,
  FaWallet,
} from "react-icons/fa6";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { confirmDialog } from "../../../store/useConfirmStore";
import { useMe } from "../../../lib/useMe";

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

const FILTERS: { key: CollectionFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cod", label: "COD" },
  { key: "paid", label: "Paid online" },
  { key: "collected", label: "Cash in hand" },
  { key: "pending", label: "To collect" },
];

function isToday(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function ago(iso: string | null, now: number) {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ${mins % 60}m ago` : new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function StatTile({ label, value, tone, icon }: { label: string; value: string | number; tone: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3.5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs text-neutral-500">{label}</p>
        <p className="text-xl font-bold leading-tight text-neutral-900">{value}</p>
      </div>
    </div>
  );
}

function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">{icon}</span>
      <p className="mt-3 text-sm font-medium text-neutral-600">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

const STATUS_CHIP: Record<string, string> = {
  OUT_FOR_DELIVERY: "bg-purple-50 text-purple-700",
  DELIVERED: "bg-green-50 text-green-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-neutral-100 text-neutral-500",
  REFUNDED: "bg-neutral-100 text-neutral-500",
};

export default function RiderDashboardPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"deliveries" | "collection">("deliveries");
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>("all");
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [showAllDelivered, setShowAllDelivered] = useState(false);
  const now = Date.now();

  const { data: orders, isError } = useQuery({
    queryKey: ["rider-my-orders"],
    queryFn: () => api.get<RiderOrder[]>("/staff/riders/me/orders"),
    refetchInterval: 8000,
  });

  const { data: summary } = useQuery({
    queryKey: ["rider-my-collection-summary"],
    queryFn: () => api.get<CollectionSummary>("/staff/riders/me/collection-summary"),
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
      // Out-for-delivery first (already on the road), then oldest assignment first.
      pending: all
        .filter((o) => !DELIVERED.has(o.status) && !CANCELLED.has(o.status))
        .sort((a, b) => Number(b.status === "OUT_FOR_DELIVERY") - Number(a.status === "OUT_FOR_DELIVERY") || new Date(a.riderAssignedAt ?? a.createdAt).getTime() - new Date(b.riderAssignedAt ?? b.createdAt).getTime()),
      delivered: all.filter((o) => DELIVERED.has(o.status)),
      cancelled: all.filter((o) => CANCELLED.has(o.status)),
    };
  }, [orders]);

  const todayAssigned = (orders ?? []).filter((o) => isToday(o.riderAssignedAt)).length;
  const todayDelivered = (orders ?? []).filter((o) => DELIVERED.has(o.status) && isToday(o.riderAssignedAt)).length;
  const toCollectNow = grouped.pending.filter((o) => o.paymentMethod === "COD").reduce((n, o) => n + o.grandTotal, 0);

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
    if (status === "DELIVERED") {
      const cod = order.paymentMethod === "COD";
      const ok = await confirmDialog({
        title: `Mark ${order.orderNumber} as delivered?`,
        message: cod ? `Confirm you have received ${formatPaisa(order.grandTotal)} cash from the customer.` : "This order is already paid online. Confirm it has been handed over.",
        confirmLabel: cod ? "Yes, cash received" : "Yes, delivered",
      });
      if (!ok) return;
    }
    setBusyId(order.id);
    try {
      await api.patch(`/staff/orders/${order.id}/rider-status`, { status });
      await queryClient.invalidateQueries({ queryKey: ["rider-my-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["rider-my-collection-summary"] });
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
      toast.success("Collection submitted");
      await queryClient.invalidateQueries({ queryKey: ["rider-my-collection-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["rider-my-collection-submissions"] });
      await queryClient.invalidateQueries({ queryKey: ["rider-my-orders"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not submit collection");
    } finally {
      setSubmitting(false);
    }
  }

  function OrderCard({ order, compact = false }: { order: RiderOrder; compact?: boolean }) {
    const name = order.contactName ?? order.customer?.name ?? "Guest";
    const phone = order.contactPhone ?? order.customer?.phone ?? "";
    const address = [order.deliveryAddressSnapshot, order.deliveryArea, order.deliveryCity].filter(Boolean).join(", ");
    const mapsQuery = encodeURIComponent([address, order.deliveryLandmark].filter(Boolean).join(", "));
    const cod = order.paymentMethod === "COD";
    const active = !DELIVERED.has(order.status) && !CANCELLED.has(order.status);
    const onTheRoad = order.status === "OUT_FOR_DELIVERY";
    return (
      <div className={`flex flex-col rounded-xl border bg-white p-4 ${onTheRoad ? "border-purple-200 ring-1 ring-purple-100" : "border-neutral-200"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-neutral-900">{order.orderNumber}</p>
            <p className="text-xs text-neutral-500">
              {order.branch.name} · {ago(order.riderAssignedAt ?? order.createdAt, now) || timeOf(order.createdAt)}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[order.status] ?? "bg-blue-50 text-blue-700"}`}>
            {order.status === "OUT_FOR_DELIVERY" ? "On the way" : DELIVERED.has(order.status) ? "Delivered" : CANCELLED.has(order.status) ? "Cancelled" : "Assigned"}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-neutral-400">{cod ? "Collect from customer" : "Paid online"}</p>
            <p className={`text-lg font-bold ${cod ? "text-amber-700" : "text-blue-700"}`}>{cod ? formatPaisa(order.grandTotal) : "Nothing to collect"}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cod ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>{cod ? "COD" : "PAID"}</span>
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          <p className="font-medium text-neutral-800">{name}</p>
          {address ? (
            <p className="flex items-start gap-2 text-neutral-600">
              <FaLocationDot size={12} className="mt-1 shrink-0 text-brand-red" />
              <span>
                {address}
                {order.deliveryLandmark && <span className="text-neutral-400"> (near {order.deliveryLandmark})</span>}
              </span>
            </p>
          ) : null}
          {order.specialInstructions && <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">Note: {order.specialInstructions}</p>}
        </div>

        {active && !compact && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {phone ? (
              <a href={`tel:${phone}`} className="flex items-center justify-center gap-2 rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:border-brand-red hover:text-brand-red">
                <FaPhone size={12} /> Call
              </a>
            ) : (
              <span className="flex items-center justify-center rounded-lg border border-dashed border-neutral-200 py-2 text-xs text-neutral-300">No phone</span>
            )}
            {mapsQuery ? (
              <a href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:border-brand-red hover:text-brand-red">
                <FaMapLocationDot size={13} /> Navigate
              </a>
            ) : (
              <span className="flex items-center justify-center rounded-lg border border-dashed border-neutral-200 py-2 text-xs text-neutral-300">No address</span>
            )}
          </div>
        )}

        {active && !onTheRoad && (
          <button onClick={() => markStatus(order, "OUT_FOR_DELIVERY")} disabled={busyId === order.id} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-red py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
            <FaMotorcycle size={15} /> {busyId === order.id ? "Updating..." : "Start delivery"}
          </button>
        )}
        {onTheRoad && (
          <button onClick={() => markStatus(order, "DELIVERED")} disabled={busyId === order.id} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50">
            <FaCircleCheck size={14} /> {busyId === order.id ? "Updating..." : cod ? "Delivered & cash received" : "Mark delivered"}
          </button>
        )}
      </div>
    );
  }

  const firstName = me?.name?.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const shownDelivered = showAllDelivered ? grouped.delivered : grouped.delivered.slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{greeting}{firstName ? `, ${firstName}` : ""}</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            {grouped.pending.length > 0 ? `You have ${grouped.pending.length} ${grouped.pending.length === 1 ? "delivery" : "deliveries"} to do` : "No deliveries waiting. New ones appear here automatically."}
          </p>
        </div>
        {isError && <span className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-700">Connection problem, retrying...</span>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Assigned today" value={todayAssigned} tone="bg-neutral-100 text-neutral-600" icon={<FaBoxOpen size={16} />} />
        <StatTile label="Delivered today" value={todayDelivered} tone="bg-green-50 text-green-600" icon={<FaCircleCheck size={16} />} />
        <StatTile label="Still to deliver" value={grouped.pending.length} tone="bg-amber-50 text-amber-600" icon={<FaMotorcycle size={16} />} />
        <StatTile label="Cash to collect" value={formatPaisa(toCollectNow)} tone="bg-red-50 text-brand-red" icon={<FaHandHoldingDollar size={16} />} />
      </div>

      <div className="mt-5 flex gap-1 border-b border-neutral-200">
        {(
          [
            ["deliveries", "Deliveries", grouped.pending.length],
            ["collection", "Cash & collection", summary && summary.collectedAmount > 0 ? 1 : 0],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === key ? "border-brand-red text-brand-red" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}
          >
            {label}
            {count > 0 && (key === "deliveries" ? <span className="rounded-full bg-brand-red px-1.5 py-0.5 text-[10px] font-bold text-white">{count}</span> : <span className="h-2 w-2 rounded-full bg-brand-red" />)}
          </button>
        ))}
      </div>

      {tab === "deliveries" && (
        <>
          <section className="mt-5">
            <h2 className="text-sm font-semibold text-neutral-900">To deliver <span className="font-normal text-neutral-400">({grouped.pending.length})</span></h2>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.pending.map((o) => <OrderCard key={o.id} order={o} />)}
            </div>
            {grouped.pending.length === 0 && <Empty icon={<FaMotorcycle size={18} />} title="All caught up" hint="You will see a new order here as soon as one is assigned to you." />}
          </section>

          <section className="mt-7">
            <h2 className="text-sm font-semibold text-neutral-900">Delivered <span className="font-normal text-neutral-400">({grouped.delivered.length})</span></h2>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shownDelivered.map((o) => <OrderCard key={o.id} order={o} compact />)}
            </div>
            {grouped.delivered.length === 0 && <Empty icon={<FaCircleCheck size={18} />} title="No deliveries completed yet" />}
            {grouped.delivered.length > 6 && (
              <button onClick={() => setShowAllDelivered((v) => !v)} className="mt-3 text-sm font-medium text-brand-red hover:underline">
                {showAllDelivered ? "Show fewer" : `Show all ${grouped.delivered.length}`}
              </button>
            )}
          </section>

          {grouped.cancelled.length > 0 && (
            <section className="mt-7">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900"><FaBan size={12} className="text-neutral-400" /> Cancelled <span className="font-normal text-neutral-400">({grouped.cancelled.length})</span></h2>
              <div className="mt-2.5 grid gap-3 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.cancelled.slice(0, 6).map((o) => <OrderCard key={o.id} order={o} compact />)}
              </div>
            </section>
          )}
        </>
      )}

      {tab === "collection" && (
        <div className="mt-5">
          {summary && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-brand-red"><FaWallet size={18} /></span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Cash in your hand</p>
                    <p className="text-3xl font-bold text-neutral-900">{formatPaisa(summary.collectedAmount)}</p>
                  </div>
                </div>
                {summary.collectedAmount > 0 ? (
                  <button onClick={() => setConfirmingSubmit(true)} className="w-full rounded-xl bg-brand-red px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 sm:w-auto">
                    Hand in cash
                  </button>
                ) : (
                  <p className="text-sm text-neutral-400">Nothing to hand in right now.</p>
                )}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-neutral-100 pt-4 text-sm">
                <div><p className="text-xs text-neutral-500">COD orders today</p><p className="text-lg font-semibold">{summary.codOrderCount}</p></div>
                <div><p className="text-xs text-neutral-500">Still to collect</p><p className="text-lg font-semibold text-amber-600">{formatPaisa(summary.pendingAmount)}</p></div>
                <div><p className="text-xs text-neutral-500">Paid online</p><p className="text-lg font-semibold text-blue-600">{summary.paidOrderCount}</p></div>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setCollectionFilter(f.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${collectionFilter === f.key ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 bg-white text-neutral-600 hover:border-brand-red hover:text-brand-red"}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {collectionOrders.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-400">No orders for this filter.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {collectionOrders.map((o) => {
                  const label =
                    o.collectionStatus === "COLLECTED" && o.isSettled ? "Received by admin" : o.collectionStatus === "COLLECTED" && o.isSubmitted ? "Handed in, awaiting admin" : o.collectionStatus === "COLLECTED" ? "Cash in hand" : o.collectionStatus === "PENDING" ? "To collect" : "Paid online";
                  const chip = o.collectionStatus === "COLLECTED" ? "bg-green-50 text-green-700" : o.collectionStatus === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
                  return (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900">{o.orderNumber}</p>
                        <p className="truncate text-xs text-neutral-500">{o.contactName ?? o.customer?.name ?? "Guest"} · {o.paymentMethod === "COD" ? "COD" : "Online"}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-neutral-900">{formatPaisa(o.grandTotal)}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${chip}`}>{label}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <h2 className="mt-7 flex items-center gap-2 text-sm font-semibold text-neutral-900"><FaClockRotateLeft size={12} className="text-neutral-400" /> Hand-in history</h2>
          <div className="mt-2.5 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {!submissions || submissions.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-400">{submissions ? "You have not handed in any cash yet." : "Loading..."}</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {submissions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="font-semibold text-neutral-900">{formatPaisa(s.submittedAmount)}</p>
                      <p className="text-xs text-neutral-500">
                        {new Date(s.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {s.codOrderCount} COD order{s.codOrderCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-green-700">{s.status.toLowerCase().replace(/_/g, " ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {confirmingSubmit && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmingSubmit(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-neutral-900">Hand in today&apos;s cash</p>
            <p className="mt-0.5 text-xs text-neutral-400">{new Date().toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })}</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">COD orders</span><span>{summary.codOrderCount}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Expected collection</span><span>{formatPaisa(summary.expectedAmount)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Cash in hand</span><span className="text-red-600">{formatPaisa(summary.collectedAmount)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Still to collect</span><span className="text-amber-600">{formatPaisa(summary.pendingAmount)}</span></div>
              <div className="flex justify-between border-t border-neutral-100 pt-1.5"><span className="text-neutral-500">Paid online</span><span>{summary.paidOrderCount} · {formatPaisa(summary.paidAmount)}</span></div>
              <div className="flex justify-between border-t border-neutral-200 pt-1.5 text-base font-semibold text-neutral-900"><span>Cash to hand in</span><span>{formatPaisa(summary.collectedAmount)}</span></div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmingSubmit(false)} className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm">Cancel</button>
              <button onClick={submitCollection} disabled={submitting} className="flex-1 rounded-lg bg-brand-red py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {submitting ? "Submitting..." : "Confirm hand-in"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
