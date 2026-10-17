"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaBoxOpen, FaClipboardCheck, FaLocationDot, FaMotorcycle, FaPhone, FaRotate, FaNoteSticky, FaUtensils } from "react-icons/fa6";
import { DELIVERY_ORDER_TYPES, formatPaisa, minutesForOrderType, orderTimer, type BranchTimes, type OrderTimer } from "@restaurant/utils";
import { api, ApiError } from "../../lib/api";
import { hasPermission, useMe } from "../../lib/useMe";
import { toast } from "../../store/useToastStore";
import { CloseIcon } from "../icons";
import { OrderDetailModal, prefetchOrderDetail } from "../orders/OrderDetailModal";

export type ActiveOrder = {
  id: string;
  orderNumber: string;
  orderCode?: string | null;
  type: string;
  status: string;
  paymentStatus: string;
  grandTotal: number;
  createdAt: string;
  estimatedDeliveryAt: string | null;
  contactName: string | null;
  contactPhone: string | null;
  customer: { name: string; phone: string } | null;
  assignedRiderId: string | null;
  assignedRider: { name: string } | null;
  table: { number: string; name: string | null } | null;
  branch: BranchTimes;
  paymentMethod: string;
  specialInstructions: string | null;
  contactAlternatePhone: string | null;
  deliveryAddressSnapshot: string | null;
  deliveryArea: string | null;
  deliveryCity: string | null;
  items?: { id: string; nameSnapshot: string; quantity: number }[];
};
type Rider = { id: string; name: string; status: string; assignedOrders: number };

/** The orders still being worked on at a branch. The "admin-orders" key prefix means live order events refresh it too. */
export function useActiveOrders(branchId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin-orders", "pos-active", branchId],
    queryFn: () => api.get<ActiveOrder[]>(`/staff/orders?branchId=${branchId}&active=true&take=150`),
    enabled: !!branchId && enabled,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

const STATUS_CHIP: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  PREPARING: "bg-orange-50 text-orange-700",
  READY: "bg-purple-50 text-purple-700",
  OUT_FOR_DELIVERY: "bg-cyan-50 text-cyan-700",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "New", CONFIRMED: "Confirmed", PREPARING: "Preparing", READY: "Ready", OUT_FOR_DELIVERY: "Out for delivery" };
const TONE: Record<OrderTimer["tone"], string> = {
  ok: "bg-green-100 text-green-700",
  warn: "bg-amber-100 text-amber-700",
  late: "bg-red-100 text-red-700",
  neutral: "bg-neutral-100 text-neutral-600",
};
const PROGRESS: Record<OrderTimer["tone"], string> = { ok: "bg-green-500", warn: "bg-amber-500", late: "bg-red-500", neutral: "bg-neutral-300" };
const METHOD: Record<string, string> = { CASH: "Cash", CARD: "Card", QR: "QR", ONLINE: "Online", COD: "Cash on delivery" };
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const minutesAgo = (iso: string, now: number) => {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
};
const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "DINE_IN", label: "Dine-in" },
  { key: "TAKEAWAY", label: "Takeaway" },
  { key: "PICKUP", label: "Pickup" },
  { key: "DELIVERY", label: "Delivery" },
] as const;

/** Takeaway = taken at the counter (POS takeaway and walk-in); Pickup = ordered online to collect. */
const groupOf = (type: string): "DINE_IN" | "TAKEAWAY" | "PICKUP" | "DELIVERY" =>
  type === "DINE_IN" ? "DINE_IN" : DELIVERY_ORDER_TYPES.has(type) ? "DELIVERY" : type === "TAKEAWAY" || type === "WALK_IN" ? "TAKEAWAY" : "PICKUP";

/** The next step of an order, following the same flow as the kitchen screen and the order details. */
function nextStep(o: ActiveOrder): { to: string; label: string } | null {
  switch (o.status) {
    case "PENDING": return { to: "CONFIRMED", label: "Accept" };
    case "CONFIRMED": return { to: "PREPARING", label: "Start preparing" };
    case "PREPARING": return { to: "READY", label: "Mark ready" };
    case "READY":
      return DELIVERY_ORDER_TYPES.has(o.type) ? { to: "OUT_FOR_DELIVERY", label: "Out for delivery" } : { to: "COMPLETED", label: o.type === "DINE_IN" ? "Served" : "Handed over" };
    case "OUT_FOR_DELIVERY": return { to: "DELIVERED", label: "Delivered" };
    default: return null;
  }
}

/** Ticks once a second while `on`, so every timer on screen moves without a refresh. */
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/**
 * A panel that slides in from the right of the POS with every order that is still active at the branch: who it is for, the
 * total, a live timer, its status and the rider. People with the right permissions can move an order along, assign a rider or
 * open the full order details, all without leaving the POS.
 */
export function ActiveOrdersDrawer({ branchId, open, onClose }: { branchId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canEdit = hasPermission(me, "orders.edit");
  const canAssignRider = hasPermission(me, "riders.assign") && hasPermission(me, "riders.view");
  const { data: orders, isLoading, isFetching, refetch } = useActiveOrders(branchId, open);
  const { data: riders } = useQuery({
    queryKey: ["pos-riders", branchId],
    queryFn: () => api.get<Rider[]>(`/staff/riders?branchId=${branchId}`),
    enabled: open && !!branchId && canAssignRider,
    staleTime: 30_000,
  });
  const now = useNow(open);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !detailId && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, detailId, onClose]);

  const shown = useMemo(
    () => [...(orders ?? [])].filter((o) => filter === "ALL" || groupOf(o.type) === filter).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [orders, filter],
  );
  const counts = useMemo(() => {
    const c = { ALL: orders?.length ?? 0, DINE_IN: 0, TAKEAWAY: 0, PICKUP: 0, DELIVERY: 0 };
    for (const o of orders ?? []) c[groupOf(o.type)]++;
    return c;
  }, [orders]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["pos-tables"] });
    void queryClient.invalidateQueries({ queryKey: ["pos-bill"] });
  }

  async function advance(o: ActiveOrder) {
    const step = nextStep(o);
    if (!step || busyId) return;
    setBusyId(o.id);
    try {
      await api.patch(`/staff/orders/${o.id}/status`, { status: step.to });
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update the order");
      refresh(); // someone else may have changed it first
    } finally {
      setBusyId(null);
    }
  }

  async function assignRider(o: ActiveOrder, riderId: string) {
    if (!riderId || riderId === o.assignedRiderId || busyId) return;
    setBusyId(o.id);
    try {
      await api.patch(`/staff/orders/${o.id}/rider`, { riderId });
      toast.success("Rider assigned.");
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not assign the rider");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className={`fixed inset-0 z-[45] bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Active orders"
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-[45] flex h-full w-full max-w-[1200px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Active orders</h2>
            <p className="text-xs text-neutral-500">{counts.ALL} in progress</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => void refetch()} aria-label="Refresh" title="Refresh" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-brand-red">
              <FaRotate size={13} className={isFetching ? "animate-spin" : ""} />
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
              <CloseIcon size={14} />
            </button>
          </div>
        </div>

        <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-neutral-100 px-4 py-2.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${filter === f.key ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-200 text-neutral-600 hover:border-neutral-300"}`}
            >
              {f.label} <span className="ml-0.5 text-neutral-400">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isLoading ? (
            <p className="col-span-full p-8 text-center text-sm text-neutral-400">Loading orders...</p>
          ) : shown.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-red/10 text-brand-red"><FaClipboardCheck size={26} /></span>
              <p className="mt-4 text-base font-semibold text-neutral-800">No active orders{filter !== "ALL" ? " of this kind" : ""} right now</p>
              <p className="mt-1 max-w-xs text-sm text-neutral-500">New orders show up here the moment they are placed, with their timer, status and rider.</p>
            </div>
          ) : (
            shown.map((o) => {
              const timer = orderTimer({ type: o.type, status: o.status, createdAt: o.createdAt, estimatedDeliveryAt: o.estimatedDeliveryAt, branch: o.branch }, now);
              const step = canEdit ? nextStep(o) : null;
              const isDelivery = DELIVERY_ORDER_TYPES.has(o.type);
              const group = groupOf(o.type);
              const who = o.customer?.name ?? o.contactName;
              const phone = o.customer?.phone ?? o.contactPhone;
              const busy = busyId === o.id;
              const promised = minutesForOrderType(o.type, o.branch);
              const left = timer && timer.kind === "countdown" && timer.totalSeconds ? Math.max(0, Math.min(1, timer.seconds / timer.totalSeconds)) : null;
              const items = o.items ?? [];
              const shownItems = items.slice(0, 3);
              const address = [o.deliveryAddressSnapshot, o.deliveryArea].filter(Boolean).join(", ");
              return (
                <div key={o.id} className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition ${timer?.tone === "late" ? "border-red-300 ring-1 ring-red-200" : "border-neutral-200"}`}>
                  {/* time left: the bar empties as the promised time runs out */}
                  <div className="h-1.5 w-full bg-neutral-100" aria-hidden="true">
                    {timer && <div className={`h-full transition-[width] duration-1000 ease-linear ${PROGRESS[timer.tone]}`} style={{ width: `${timer.kind === "countdown" ? (left ?? 0) * 100 : 100}%` }} />}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button type="button" onClick={() => setDetailId(o.id)} onMouseEnter={() => void prefetchOrderDetail(queryClient, o.id)} onFocus={() => void prefetchOrderDetail(queryClient, o.id)} className="block truncate text-base font-bold tracking-wide text-neutral-900 hover:text-brand-red hover:underline">{o.orderCode ?? o.orderNumber}</button>
                        <p className="text-[11px] text-neutral-500">{clockTime(o.createdAt)} · {minutesAgo(o.createdAt, now)}</p>
                      </div>
                      {timer && (
                        <span className={`shrink-0 rounded-lg px-2.5 py-1 text-center font-mono text-lg font-bold leading-tight tabular-nums ${TONE[timer.tone]}`} title={timer.kind === "countdown" ? `Time left of the ${promised || "promised"} minutes for this order` : "Time since the order was placed (no time is set for this kind of order)"}>
                          {timer.suffix === "late" ? "+" : ""}{timer.text}
                          <span className="block font-sans text-[9px] font-semibold uppercase leading-none tracking-wide opacity-70">{timer.suffix}</span>
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                        {group === "DELIVERY" ? <FaMotorcycle size={10} /> : group === "DINE_IN" ? <FaUtensils size={9} /> : <FaBoxOpen size={10} />}
                        {group === "DINE_IN" ? (o.table ? `Table ${o.table.name ?? o.table.number}` : "Dine-in") : group === "DELIVERY" ? "Delivery" : group === "TAKEAWAY" ? "Takeaway" : "Pickup"}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[o.status] ?? "bg-neutral-100 text-neutral-600"}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${o.paymentStatus === "PAID" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                        {o.paymentStatus === "PAID" ? "Paid" : o.paymentStatus === "PARTIALLY_PAID" ? "Part paid" : "Unpaid"} · {METHOD[o.paymentMethod] ?? o.paymentMethod}
                      </span>
                    </div>

                    {(who || phone) && (
                      <div className="mt-2.5 text-xs">
                        {who && <p className="truncate font-semibold text-neutral-800">{who}</p>}
                        {phone && (
                          <p className="flex items-center gap-1.5 text-neutral-500">
                            <FaPhone size={9} />
                            <a href={`tel:${phone}`} className="hover:text-brand-red">{phone}</a>
                            {o.contactAlternatePhone && <span className="text-neutral-400">· {o.contactAlternatePhone}</span>}
                          </p>
                        )}
                      </div>
                    )}
                    {isDelivery && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-neutral-600">
                        <FaLocationDot size={10} className="mt-0.5 shrink-0 text-brand-red" />
                        <span className="line-clamp-2">{address || "No address on the order"}</span>
                      </p>
                    )}

                    {shownItems.length > 0 && (
                      <ul className="mt-2.5 space-y-0.5 rounded-lg bg-neutral-50 px-2.5 py-2 text-xs text-neutral-700">
                        {shownItems.map((it) => (
                          <li key={it.id} className="flex gap-1.5"><span className="shrink-0 font-semibold text-neutral-900">{it.quantity}×</span><span className="truncate">{it.nameSnapshot}</span></li>
                        ))}
                        {items.length > shownItems.length && <li className="text-[11px] font-medium text-brand-red">+ {items.length - shownItems.length} more item{items.length - shownItems.length === 1 ? "" : "s"}</li>}
                      </ul>
                    )}
                    {o.specialInstructions && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] italic text-amber-800">
                        <FaNoteSticky size={10} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{o.specialInstructions}</span>
                      </p>
                    )}

                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <span className="text-base font-bold text-neutral-900">{formatPaisa(o.grandTotal)}</span>
                      {isDelivery && <span className="flex items-center gap-1 text-neutral-500"><FaMotorcycle size={11} />{o.assignedRider?.name ?? <span className="font-medium text-red-600">No rider yet</span>}</span>}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-neutral-100 pt-2.5">
                      <button type="button" onClick={() => setDetailId(o.id)} onMouseEnter={() => void prefetchOrderDetail(queryClient, o.id)} onFocus={() => void prefetchOrderDetail(queryClient, o.id)} onTouchStart={() => void prefetchOrderDetail(queryClient, o.id)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-brand-red hover:text-brand-red">Details</button>
                      {step && (
                        <button type="button" onClick={() => void advance(o)} disabled={busy} className="flex-1 rounded-lg bg-brand-red px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
                          {busy ? "..." : step.label}
                        </button>
                      )}
                      {isDelivery && canAssignRider && (
                        <select
                          aria-label="Assign rider"
                          value={o.assignedRiderId ?? ""}
                          disabled={busy}
                          onChange={(e) => void assignRider(o, e.target.value)}
                          className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-700 outline-none focus:border-brand-red disabled:opacity-60"
                        >
                          <option value="" disabled>{o.assignedRiderId ? "Change rider" : "Assign rider"}</option>
                          {(riders ?? []).map((r) => (
                            <option key={r.id} value={r.id}>{r.name}{r.assignedOrders > 0 ? ` (${r.assignedOrders})` : ""}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
      </aside>

      {detailId && (
        <OrderDetailModal
          orderId={detailId}
          onClose={() => {
            setDetailId(null);
            refresh();
          }}
          onNavigateReceipt={(id) => router.push(`/pos/receipt/${id}`)}
        />
      )}
    </>
  );
}
