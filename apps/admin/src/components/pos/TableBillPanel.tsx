"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { FaCheck, FaReceipt } from "react-icons/fa6";
import { api, ApiError } from "../../lib/api";
import { toast } from "../../store/useToastStore";
import { CashIcon, CardIcon, QrIcon } from "./payment-icons";

type BillPayment = { id: string; method: string; status: string; amount: number; amountTendered: number | null; createdAt: string };
type BillOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  subtotal: number;
  taxAmount: number;
  couponDiscountAmount: number;
  loyaltyDiscountAmount: number;
  discountAmount: number;
  grandTotal: number;
  table: { id: string; number: string; name: string | null } | null;
  items: { id: string; nameSnapshot: string; quantity: number; lineTotal: number }[];
  payments: BillPayment[];
};

const TERMINAL = new Set(["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"]);
const QUICK_CASH = [500, 1000, 2000, 5000];
const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-brand-red focus:outline-none disabled:bg-neutral-50";

function minutesSince(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/**
 * The running bill of an occupied dine-in table: what has been ordered, what is owed, and a
 * payment form that supports cash (with change to return), card/QR, and partial/split payments.
 * The order closes itself — and the table is freed — server-side the moment it is fully paid.
 */
export function TableBillPanel({
  orderId,
  hasNewItems,
  onChanged,
  onDone,
}: {
  orderId: string;
  /** New items are sitting in the cart, not yet added to the bill — payment waits until they are. */
  hasNewItems: boolean;
  onChanged: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<"CASH" | "CARD" | "QR">("CASH");
  const [amountInput, setAmountInput] = useState("");
  const [tendered, setTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState<{ method: string; amount: number; change: number } | null>(null);

  const { data: order, refetch } = useQuery({
    queryKey: ["pos-bill", orderId],
    queryFn: () => api.get<BillOrder>(`/staff/orders/${orderId}`),
    refetchInterval: 10000,
  });

  if (!order) {
    return <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />;
  }

  const paid = order.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
  const pending = order.payments.filter((p) => p.status === "PENDING");
  const pendingTotal = pending.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, order.grandTotal - paid);
  const closed = TERMINAL.has(order.status);
  const discounts = order.discountAmount + order.couponDiscountAmount + order.loyaltyDiscountAmount;

  const amountPaisa = amountInput.trim() ? Math.round(Number(amountInput) * 100) : balance;
  const amountValid = Number.isFinite(amountPaisa) && amountPaisa >= 1 && amountPaisa <= balance;
  const tenderedPaisa = tendered.trim() ? Math.round(Number(tendered) * 100) : null;
  const short = method === "CASH" && tenderedPaisa != null && tenderedPaisa < amountPaisa;
  const change = method === "CASH" && tenderedPaisa != null && tenderedPaisa >= amountPaisa ? tenderedPaisa - amountPaisa : 0;

  async function afterChange() {
    await refetch();
    void queryClient.invalidateQueries({ queryKey: ["pos-tables"] });
    onChanged();
  }

  async function collect() {
    if (!amountValid) return;
    setBusy(true);
    try {
      const updated = await api.post<BillOrder>(`/staff/orders/${orderId}/payments`, {
        method,
        amount: amountPaisa,
        amountTendered: method === "CASH" && tenderedPaisa != null ? tenderedPaisa : undefined,
      });
      // Card/QR rows start PENDING; the cashier's click below is the explicit "money is in" confirmation.
      if (method !== "CASH") {
        const newest = updated.payments.filter((p) => p.status === "PENDING").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        await api.post(`/staff/orders/${orderId}/confirm-payment`, { paymentId: newest?.id });
      }
      setSettled({ method, amount: amountPaisa, change });
      setAmountInput("");
      setTendered("");
      await afterChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not record payment");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPending(paymentId: string) {
    setBusy(true);
    try {
      await api.post(`/staff/orders/${orderId}/confirm-payment`, { paymentId });
      await afterChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not confirm payment");
    } finally {
      setBusy(false);
    }
  }

  const tableLabel = order.table ? (order.table.name ?? `Table ${order.table.number}`) : "Dine-in";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-neutral-200 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-semibold text-neutral-900">{tableLabel}</p>
            <p className="text-xs text-neutral-500">
              {order.orderNumber} · open {minutesSince(order.createdAt)}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              closed ? "bg-green-50 text-green-700" : balance === 0 ? "bg-green-50 text-green-700" : paid > 0 ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-600"
            }`}
          >
            {closed ? "Settled" : paid > 0 ? "Part paid" : "Unpaid"}
          </span>
        </div>

        <div className="mt-2 max-h-36 space-y-1 overflow-y-auto border-t border-neutral-100 pt-2 text-sm">
          {order.items.map((i) => (
            <div key={i.id} className="flex justify-between gap-2">
              <span className="min-w-0 truncate text-neutral-700">
                <span className="text-neutral-400">{i.quantity} ×</span> {i.nameSnapshot}
              </span>
              <span className="shrink-0 text-neutral-600">{formatPaisa(i.lineTotal)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1 rounded-xl bg-neutral-50 p-3 text-sm">
        <div className="flex justify-between text-neutral-600"><span>Subtotal</span><span>{formatPaisa(order.subtotal)}</span></div>
        <div className="flex justify-between text-neutral-600"><span>Tax</span><span>{formatPaisa(order.taxAmount)}</span></div>
        {discounts > 0 && <div className="flex justify-between text-green-700"><span>Discounts</span><span>-{formatPaisa(discounts)}</span></div>}
        <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-semibold text-neutral-900"><span>Bill total</span><span>{formatPaisa(order.grandTotal)}</span></div>
        {paid > 0 && <div className="flex justify-between text-green-700"><span>Paid so far</span><span>-{formatPaisa(paid)}</span></div>}
        <div className="flex justify-between text-base font-semibold">
          <span className="text-neutral-900">Balance due</span>
          <span className={balance > 0 ? "text-brand-red" : "text-green-700"}>{formatPaisa(balance)}</span>
        </div>
      </div>

      {order.payments.length > 0 && (
        <div className="space-y-1 text-xs">
          {order.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-neutral-200">
              <span className="text-neutral-600">
                {p.method}
                {p.method === "CASH" && p.amountTendered != null && p.amountTendered > p.amount && (
                  <span className="text-neutral-400"> · received {formatPaisa(p.amountTendered)}, change {formatPaisa(p.amountTendered - p.amount)}</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-neutral-800">{formatPaisa(p.amount)}</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${p.status === "PAID" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{p.status}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {settled && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
          <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-600"><FaCheck size={14} /></span>
          <p className="mt-1.5 text-sm font-semibold text-green-800">{formatPaisa(settled.amount)} received ({settled.method})</p>
          {settled.change > 0 && <p className="mt-1 text-xl font-bold text-green-700">Return {formatPaisa(settled.change)}</p>}
          {closed && <p className="mt-1 text-xs text-green-700">Bill fully paid — table is free again.</p>}
        </div>
      )}

      {pending.length > 0 && !closed && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            {pending.map((p) => `${p.method} ${formatPaisa(p.amount)}`).join(" + ")} recorded but not yet confirmed.
          </p>
          {pending.map((p) => (
            <button
              key={p.id}
              onClick={() => confirmPending(p.id)}
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              Confirm {p.method} {formatPaisa(p.amount)} received
            </button>
          ))}
        </div>
      )}

      {!closed && balance > 0 && pending.length === 0 && (
        <div className="rounded-xl border border-neutral-200 p-3">
          <p className="text-sm font-semibold text-neutral-900">Collect payment</p>
          {hasNewItems ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              New items are waiting in the cart. Add them to the bill (or clear them) before taking payment so the total is final.
            </p>
          ) : (
            <>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["CASH", "CARD", "QR"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2 text-xs font-medium transition ${
                      method === m ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                    }`}
                  >
                    {m === "CASH" && <CashIcon size={20} />}
                    {m === "CARD" && <CardIcon size={20} />}
                    {m === "QR" && <QrIcon size={20} />}
                    {m === "CASH" ? "Cash" : m === "CARD" ? "Card" : "QR"}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-neutral-500">Amount to collect (Rs.)</p>
                  {amountInput.trim() && (
                    <button onClick={() => setAmountInput("")} className="text-xs font-medium text-brand-red hover:underline">Pay full balance</button>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder={String(balance / 100)}
                  className={`mt-1 ${fieldClass}`}
                />
                <p className="mt-1 text-[11px] text-neutral-400">Leave empty to pay the full balance, or enter less to split the bill.</p>
                {!amountValid && amountInput.trim() && <p className="mt-1 text-xs text-red-600">Enter an amount between Rs. 1 and {formatPaisa(balance)}.</p>}
              </div>

              {method === "CASH" ? (
                <div className="mt-3">
                  <input
                    type="number"
                    min={0}
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    placeholder="Cash received (Rs.)"
                    className={fieldClass}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {amountValid && (
                      <button
                        onClick={() => setTendered(String(Math.ceil(amountPaisa / 100)))}
                        className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-600 hover:border-brand-red hover:text-brand-red"
                      >
                        Exact
                      </button>
                    )}
                    {QUICK_CASH.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setTendered(String(amt))}
                        className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-600 hover:border-brand-red hover:text-brand-red"
                      >
                        {amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  {tenderedPaisa != null && amountValid && (
                    <div className={`mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${short ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                      <span>{short ? "Short by" : "Change to return"}</span>
                      <span>{formatPaisa(short ? amountPaisa - (tenderedPaisa ?? 0) : change)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-neutral-500">Charge the customer&apos;s {method === "CARD" ? "card" : "QR payment"}, then confirm below.</p>
              )}

              <button
                onClick={collect}
                disabled={busy || !amountValid || short}
                className="mt-3 w-full rounded-xl bg-brand-red py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving..." : method === "CASH" ? `Collect ${amountValid ? formatPaisa(amountPaisa) : ""}` : `${method === "CARD" ? "Card" : "QR"} payment received ${amountValid ? `· ${formatPaisa(amountPaisa)}` : ""}`}
              </button>
              {pendingTotal > 0 && <p className="mt-1 text-xs text-neutral-400">Unconfirmed: {formatPaisa(pendingTotal)}</p>}
            </>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => router.push(`/pos/receipt/${order.id}`)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
        >
          <FaReceipt size={12} /> {closed ? "Print Receipt" : "Print Bill"}
        </button>
        {closed && (
          <button onClick={onDone} className="flex-1 rounded-lg bg-brand-red py-2 text-sm font-semibold text-white hover:opacity-90">
            Done
          </button>
        )}
      </div>
    </div>
  );
}
