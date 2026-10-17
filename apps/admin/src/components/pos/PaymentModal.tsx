"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPaisa } from "@restaurant/utils";
import { CloseIcon } from "../icons";
import { CardIcon, CashIcon } from "./payment-icons";

export type PaymentChoice = { method: "CASH" | "CARD"; tendered?: number };

/** Cash notes a customer commonly hands over, offered as one-tap amounts above the exact total. */
const NOTES = [100, 500, 1000, 5000];

/**
 * Opens when Place Order is pressed. The cashier picks how the customer pays; for cash, types what was handed over and sees the
 * change to give back (or what is still owed). The order can only be placed with a valid payment, and once it is being placed
 * the button locks so the same order cannot be sent twice.
 */
export function PaymentModal({
  orderTotal,
  tip,
  busy,
  calculating = false,
  onClose,
  onConfirm,
}: {
  /** The order total in paisa, before any tip. */
  orderTotal: number;
  /** Optional tip in paisa, collected on top. */
  tip: number;
  busy: boolean;
  /** The server is still working out the exact total (tax, delivery, discounts): the order cannot be placed until it has. */
  calculating?: boolean;
  onClose: () => void;
  onConfirm: (choice: PaymentChoice) => void;
}) {
  const [method, setMethod] = useState<"CASH" | "CARD">("CASH");
  const [received, setReceived] = useState("");
  const sent = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const toCollect = orderTotal + tip;
  const receivedPaisa = received.trim() ? Math.round(Number(received) * 100) : null;
  const validNumber = receivedPaisa != null && Number.isFinite(receivedPaisa) && receivedPaisa >= 0;
  const remaining = validNumber ? Math.max(0, toCollect - receivedPaisa!) : toCollect;
  const change = validNumber ? Math.max(0, receivedPaisa! - toCollect) : 0;
  const cashOk = validNumber && receivedPaisa! >= toCollect;
  const canConfirm = !busy && !calculating && toCollect >= 0 && (method === "CARD" || cashOk);

  // Round-up amounts that make sense for this bill (nothing smaller than the bill itself).
  const quick = useMemo(() => {
    const exact = Math.ceil(toCollect / 100);
    const out = new Set<number>();
    for (const n of NOTES) {
      const up = Math.ceil(exact / n) * n;
      if (up >= exact) out.add(up);
    }
    out.delete(exact);
    return [...out].sort((a, b) => a - b).slice(0, 3);
  }, [toCollect]);

  useEffect(() => {
    if (method === "CASH") input.current?.focus();
  }, [method]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // The order has gone (or failed): allow a new attempt.
  useEffect(() => {
    if (!busy) sent.current = false;
  }, [busy]);

  function confirm() {
    if (!canConfirm || sent.current) return;
    sent.current = true;
    onConfirm(method === "CASH" ? { method, tendered: receivedPaisa! } : { method });
  }

  const row = "flex items-center justify-between text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Payment" className="flex max-h-[95vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">Payment</p>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90 disabled:opacity-50">
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl bg-neutral-50 p-3.5">
            <div className={`${row} text-neutral-600`}><span>Order total</span><span>{formatPaisa(orderTotal)}</span></div>
            {tip > 0 && <div className={`${row} mt-1 text-neutral-600`}><span>Tip</span><span>{formatPaisa(tip)}</span></div>}
            <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-2">
              <span className="text-sm font-semibold text-neutral-900">Total to collect</span>
              <span className={`text-2xl font-bold text-brand-red ${calculating ? "opacity-50" : ""}`}>{formatPaisa(toCollect)}</span>
            </div>
            {calculating && <p className="mt-1 text-right text-[11px] text-neutral-500">Updating the exact total...</p>}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Payment method</p>
            <div className="grid grid-cols-2 gap-2">
              {(["CASH", "CARD"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  aria-pressed={method === m}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-sm font-medium transition ${method === m ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"}`}
                >
                  {m === "CASH" ? <CashIcon size={24} /> : <CardIcon size={24} />}
                  {m === "CASH" ? "Cash" : "Card"}
                </button>
              ))}
            </div>
          </div>

          {method === "CASH" ? (
            <div>
              <label htmlFor="cash-received" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Cash received (Rs.)</label>
              <input
                id="cash-received"
                ref={input}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirm()}
                placeholder="Amount handed over"
                className="input w-full text-lg"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setReceived(String(Math.ceil(toCollect / 100)))} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-brand-red hover:text-brand-red">Exact</button>
                {quick.map((amt) => (
                  <button key={amt} type="button" onClick={() => setReceived(String(amt))} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-brand-red hover:text-brand-red">{amt.toLocaleString()}</button>
                ))}
              </div>

              <div className="mt-3 space-y-1.5 rounded-xl border border-neutral-200 p-3.5">
                <div className={`${row} text-neutral-600`}><span>Order total</span><span>{formatPaisa(toCollect)}</span></div>
                <div className={`${row} text-neutral-600`}><span>Cash received</span><span>{validNumber ? formatPaisa(receivedPaisa!) : "-"}</span></div>
                {validNumber && receivedPaisa! < toCollect ? (
                  <div className={`${row} rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700`}><span>Remaining amount</span><span className="text-lg">{formatPaisa(remaining)}</span></div>
                ) : (
                  <div className={`${row} rounded-lg px-3 py-2 font-semibold ${cashOk ? "bg-green-50 text-green-700" : "bg-neutral-50 text-neutral-400"}`}><span>Change to return</span><span className="text-lg">{formatPaisa(change)}</span></div>
                )}
              </div>
              {!validNumber && <p className="mt-2 text-xs text-neutral-500">Enter the cash received to place the order.</p>}
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">The order is placed with the payment pending. Press &quot;Confirm Card Payment Received&quot; after the card is charged.</p>
          )}
        </div>

        <div className="border-t border-neutral-200 p-4">
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="w-full rounded-xl bg-brand-red py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Placing order..." : calculating ? "Calculating the total..." : `Place Order · ${formatPaisa(toCollect)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
