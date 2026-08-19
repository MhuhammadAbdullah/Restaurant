"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../lib/api";
import { useMe, hasPermission } from "../../lib/useMe";
import { toast } from "../../store/useToastStore";
import { OrderDetailModal } from "../orders/OrderDetailModal";
import { CloseIcon } from "../icons";

export type CustomerStatus = "ACTIVE" | "INACTIVE";

export type CustomerDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  isGuest: boolean;
  status: CustomerStatus;
  createdAt: string;
  orderCount: number;
  loyalty?: { pointsBalance: number; transactions: Array<{ id: string; type: string; points: number; note: string | null; createdAt: string }> };
};

type OrderHistoryItem = {
  id: string;
  orderNumber: string;
  status: string;
  type: string;
  source: string;
  paymentStatus: string;
  grandTotal: number;
  createdAt: string;
};

const LOYALTY_TYPE_FALLBACK_LABEL: Record<string, string> = {
  EARNED: "Points Earned",
  REDEEMED: "Points Redeemed",
  EXPIRED: "Points Expired",
  ADJUSTMENT: "Manual Adjustment",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatLoyaltyDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function BlockToggle({ status, canEdit, busy, onToggle }: { status: CustomerStatus; canEdit: boolean; busy: boolean; onToggle: () => void }) {
  const blocked = status === "INACTIVE";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={!canEdit || busy}
      aria-label={blocked ? "Unblock customer" : "Block customer"}
      title={canEdit ? (blocked ? "Blocked: click to unblock" : "Active: click to block") : "Blocked/Active"}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${blocked ? "bg-red-500" : "bg-green-500"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${blocked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

// `id` is either a real Customer id, or a synthetic `guest:<phone>` id for a phone that has
// placed orders but never registered — see CustomersService.getForStaff on the API side.
export function CustomerDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: me } = useMe();
  const canAdjustLoyalty = hasPermission(me, "loyalty.adjust");
  const canBlockCustomers = hasPermission(me, "customers.block");

  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [loyaltyNote, setLoyaltyNote] = useState("");
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ["staff-customer", id],
    queryFn: () => api.get<CustomerDetail>(`/staff/customers/${encodeURIComponent(id)}`),
  });

  const { data: orders } = useQuery({
    queryKey: ["staff-customer-orders", id, detail?.phone, detail?.isGuest],
    queryFn: () => {
      const params = new URLSearchParams();
      if (id.startsWith("guest:")) {
        params.set("contactPhone", id.slice("guest:".length));
      } else {
        params.set("customerId", id);
        // An isGuest profile's older orders (e.g. from before a blocked guest phone was
        // materialized into this row) are still only tagged by contactPhone, not this id.
        if (detail?.isGuest) params.set("contactPhone", detail.phone);
      }
      return api.get<OrderHistoryItem[]>(`/staff/orders?${params.toString()}`);
    },
    enabled: !!detail,
  });

  async function toggleStatus() {
    if (!detail) return;
    const blocking = detail.status === "ACTIVE";
    if (blocking && !confirm(`Block ${detail.name} (${detail.phone})? This phone number won't be able to place new orders until unblocked.`)) return;
    setTogglingStatus(true);
    try {
      await api.patch(`/staff/customers/${id}/status`, { status: blocking ? "INACTIVE" : "ACTIVE" });
      await queryClient.invalidateQueries({ queryKey: ["staff-customer"] });
      await queryClient.invalidateQueries({ queryKey: ["staff-customers"] });
      toast.success(blocking ? "Customer blocked." : "Customer unblocked.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update customer status");
    } finally {
      setTogglingStatus(false);
    }
  }

  async function submitLoyalty() {
    if (!loyaltyPoints || !loyaltyNote.trim()) return;
    try {
      await api.post(`/staff/customers/${id}/loyalty/adjust`, { points: loyaltyPoints, note: loyaltyNote });
      setLoyaltyPoints(0);
      setLoyaltyNote("");
      await queryClient.invalidateQueries({ queryKey: ["staff-customer", id] });
      await queryClient.invalidateQueries({ queryKey: ["staff-customers"] });
      toast.success("Loyalty points adjusted.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not adjust loyalty points");
    }
  }

  let runningLoyaltyBalance = detail?.loyalty?.pointsBalance ?? 0;
  const loyaltyRows = (detail?.loyalty?.transactions ?? []).map((t) => {
    const balanceAfter = runningLoyaltyBalance;
    runningLoyaltyBalance -= t.points;
    return { ...t, balanceAfter };
  });

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
            <p className="text-base font-semibold text-neutral-900">{detail?.name ?? "Loading..."}</p>
            <button onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
              <CloseIcon size={14} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 text-sm">
            {detail && (
              <>
                <div className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-neutral-900">{detail.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${detail.isGuest ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                          {detail.isGuest ? "Not Registered" : "Registered"}
                        </span>
                        {detail.status === "INACTIVE" && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Blocked</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">{detail.phone} {detail.email ? `· ${detail.email}` : ""}</p>
                      <p className="mt-1 text-xs text-neutral-400">{detail.orderCount} total orders · Since {formatDate(detail.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <BlockToggle status={detail.status} canEdit={canBlockCustomers} busy={togglingStatus} onToggle={toggleStatus} />
                      <span className="text-[11px] text-neutral-400">{detail.status === "INACTIVE" ? "Blocked" : "Active"}</span>
                    </div>
                  </div>
                </div>

                {!detail.isGuest && (
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-neutral-900">Loyalty</h3>
                      <span className="text-sm font-semibold text-brand-red">{detail.loyalty?.pointsBalance ?? 0} pts</span>
                    </div>
                    {canAdjustLoyalty && (
                      <div className="mt-3 space-y-2">
                        <input
                          type="number"
                          placeholder="+/- points"
                          value={loyaltyPoints || ""}
                          onChange={(e) => setLoyaltyPoints(Number(e.target.value))}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                        />
                        <input
                          placeholder="Reason (required)"
                          value={loyaltyNote}
                          onChange={(e) => setLoyaltyNote(e.target.value)}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                        />
                        <button onClick={submitLoyalty} className="w-full rounded-lg bg-brand-red py-1.5 text-sm font-medium text-white">Apply Adjustment</button>
                      </div>
                    )}
                    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto border-t pt-2">
                      {loyaltyRows.map((t) => {
                        const isPositive = t.points >= 0;
                        return (
                          <div key={t.id} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
                            <div>
                              <p className="text-xs font-semibold text-neutral-900">{t.note ?? LOYALTY_TYPE_FALLBACK_LABEL[t.type] ?? t.type}</p>
                              <p className="mt-0.5 text-[11px] text-neutral-400">{formatLoyaltyDate(t.createdAt)}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-xs font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                                {isPositive ? "+" : "-"}
                                {Math.abs(t.points).toFixed(2)} Points
                              </p>
                              <p className="mt-0.5 text-[11px] text-neutral-400">Balance: {t.balanceAfter.toFixed(2)} Points</p>
                            </div>
                          </div>
                        );
                      })}
                      {loyaltyRows.length === 0 && <p className="text-xs text-neutral-400">No loyalty activity yet.</p>}
                    </div>
                  </div>
                )}
                {detail.isGuest && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    This customer has not registered an account, so loyalty points can only be earned or granted to registered customers.
                  </p>
                )}

                <div>
                  <p className="text-xs font-semibold uppercase text-neutral-500">Order History</p>
                  <div className="mt-1.5 overflow-hidden rounded-lg border border-neutral-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-50 text-neutral-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Order #</th>
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Total</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {orders?.map((o) => (
                          <tr key={o.id} className="hover:bg-neutral-50">
                            <td className="px-3 py-2">
                              <button onClick={() => setDetailOrderId(o.id)} className="font-medium hover:text-brand-red hover:underline">{o.orderNumber}</button>
                            </td>
                            <td className="px-3 py-2 text-neutral-500">{formatDate(o.createdAt)}</td>
                            <td className="px-3 py-2 text-neutral-500">{o.type.replace(/_/g, " ")}</td>
                            <td className="px-3 py-2">{formatPaisa(o.grandTotal)}</td>
                            <td className="px-3 py-2">
                              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{o.status}</span>
                            </td>
                          </tr>
                        ))}
                        {orders?.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-neutral-400">No orders yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {detailOrderId && (
        <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} onNavigateReceipt={(orderId) => router.push(`/pos/receipt/${orderId}`)} />
      )}
    </>
  );
}
