"use client";

import { useEffect } from "react";
import { FaCheck, FaKitchenSet, FaPrint, FaReceipt } from "react-icons/fa6";
import { formatPaisa } from "@restaurant/utils";

export type PrintChoice = "customer" | "kitchen" | "both";

/**
 * Shown right after an order is placed: which slip to print. Dine-in orders are paid at the table later, so for them only
 * the kitchen slip is offered now. "Not now" closes it; the buttons on the order panel stay available to print later.
 */
export function PrintDialog({
  orderNumber,
  isDineIn,
  total,
  cashReceived,
  change,
  onChoose,
  onClose,
}: {
  orderNumber: string;
  isDineIn: boolean;
  total: number;
  cashReceived?: number;
  change?: number;
  onChoose: (choice: PrintChoice) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const option = "flex w-full items-center gap-3 rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-brand-red hover:bg-brand-red/5";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Print receipts" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-600"><FaCheck size={18} /></span>
          <p className="mt-2 text-base font-semibold text-neutral-900">Order placed</p>
          <p className="text-2xl font-semibold text-brand-red">{orderNumber}</p>
          <p className="text-sm text-neutral-600">Total {formatPaisa(total)}</p>
          {cashReceived != null && (
            <p className="mt-1 text-xs text-neutral-500">Cash received {formatPaisa(cashReceived)} · Change <b className="text-green-700">{formatPaisa(change ?? 0)}</b></p>
          )}
        </div>

        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">Print</p>
        <div className="space-y-2">
          {!isDineIn && (
            <button type="button" onClick={() => onChoose("customer")} className={option}>
              <FaReceipt size={18} className="shrink-0 text-brand-red" />
              <span><span className="block text-sm font-semibold text-neutral-900">Customer receipt</span><span className="block text-xs text-neutral-500">Items, prices, payment and change</span></span>
            </button>
          )}
          <button type="button" onClick={() => onChoose("kitchen")} className={option}>
            <FaKitchenSet size={18} className="shrink-0 text-brand-red" />
            <span><span className="block text-sm font-semibold text-neutral-900">Kitchen receipt</span><span className="block text-xs text-neutral-500">Order number, items, quantities and notes</span></span>
          </button>
          {!isDineIn && (
            <button type="button" onClick={() => onChoose("both")} className={`${option} border-brand-red bg-brand-red/5`}>
              <FaPrint size={18} className="shrink-0 text-brand-red" />
              <span><span className="block text-sm font-semibold text-neutral-900">Print both</span><span className="block text-xs text-neutral-500">Customer receipt, then the kitchen receipt</span></span>
            </button>
          )}
        </div>
        {isDineIn && <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">The bill is printed later, when the guest asks for it at the table.</p>}

        <button type="button" onClick={onClose} className="mt-4 w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 hover:border-brand-red hover:text-brand-red">Not now</button>
      </div>
    </div>
  );
}
