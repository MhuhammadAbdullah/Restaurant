"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../../../../lib/api";

type KitchenTicketData = {
  restaurant: { name: string; kitchenReceiptHeaderText: string | null; kitchenReceiptFooterText: string | null };
  order: {
    id: string;
    orderNumber: string;
    orderCode?: string | null;
    dailyNo?: number | null;
    type: string;
    createdAt: string;
    contactName: string | null;
    specialInstructions: string | null;
    table: { number: string; name: string | null } | null;
    items: {
      id: string;
      nameSnapshot: string;
      quantity: number;
      specialInstructions: string | null;
      orderRevisionId: string | null;
      choices: { nameSnapshot: string }[];
      addons: { nameSnapshot: string; quantity: number }[];
      dealSlots: {
        nameSnapshot: string;
        choices: { nameSnapshot: string }[];
        addons: { nameSnapshot: string; quantity: number }[];
      }[];
    }[];
  };
  isAdditional: boolean;
  isFullReprint: boolean;
};

/**
 * Direct-print, no preview: scope (which items) is decided entirely by the URL the caller built
 * (no params = whatever the kitchen hasn't been sent yet, server-computed; ?full=true = a
 * deliberate full reprint) — there's no in-page toggle to fiddle with before printing.
 */
export default function KitchenTicketPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const revisionId = searchParams.get("revisionId") ?? undefined;
  const full = searchParams.get("full") === "true";
  const [printError, setPrintError] = useState<string | null>(null);
  const printedRef = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["receipt-kitchen", orderId, revisionId, full],
    queryFn: () =>
      api.get<KitchenTicketData>(
        `/staff/orders/${orderId}/receipt/kitchen${revisionId ? `?revisionId=${revisionId}` : full ? "?full=true" : ""}`,
      ),
  });

  useEffect(() => {
    if (!data || printedRef.current) return;
    // Never fire the printer (or log a PRINTED event) for a ticket with nothing on it.
    if (data.order.items.length === 0) return;
    printedRef.current = true;
    window.print();
    void api
      .post(`/staff/orders/${orderId}/print-events`, { type: revisionId ? "KITCHEN_ADDITIONAL" : "KITCHEN", status: "PRINTED", revisionId })
      .catch(() => {
        // logging failure doesn't block the print itself
      });
  }, [data, orderId, revisionId]);

  useEffect(() => {
    const onAfterPrint = () => router.back();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [router]);

  async function reportFailure() {
    setPrintError(null);
    try {
      await api.post(`/staff/orders/${orderId}/print-events`, {
        type: revisionId ? "KITCHEN_ADDITIONAL" : "KITCHEN",
        status: "FAILED",
        revisionId,
      });
      setPrintError("Marked as failed.");
    } catch (e) {
      setPrintError(e instanceof ApiError ? e.message : "Could not log the failure");
    }
  }

  if (isLoading) return <p className="p-6 text-sm text-neutral-400">Loading ticket...</p>;
  if (error || !data) return <p className="p-6 text-sm text-red-600">{error instanceof ApiError ? error.message : "Could not load kitchen ticket"}</p>;

  const { restaurant, order: ord } = data;
  const when = new Date(ord.createdAt);
  const typeLabel = ord.type.replace(/_/g, " ").replace(/^ONLINE /, "");
  const totalQty = ord.items.reduce((n, it) => n + it.quantity, 0);
  const headline = ord.table ? `TABLE ${ord.table.name ?? ord.table.number}` : typeLabel;
  const inline = (list: { nameSnapshot: string }[]) => (list.length > 0 ? ` (${list.map((c) => c.nameSnapshot).join(", ")})` : "");

  return (
    <div className="mx-auto max-w-md p-6 print:max-w-full print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <button onClick={reportFailure} className="text-sm text-neutral-500 underline">Report print failure</button>
          {printError && <p className="mt-2 text-sm text-amber-700">{printError}</p>}
        </div>
        <button onClick={() => window.print()} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-brand-red hover:text-brand-red">Print again</button>
      </div>

      <style>{"@media print { @page { size: 80mm auto; margin: 5mm 4mm 8mm 4mm; } }"}</style>

      {/* Kitchen copy: black & white, big type, nothing but what the cooks need */}
      <div className="mx-auto rounded-lg bg-white px-5 pb-8 pt-6 font-mono text-[12px] leading-snug text-black shadow-sm ring-1 ring-neutral-200 print:w-[72mm] print:rounded-none print:p-0 print:shadow-none print:ring-0 print:text-[11px]">
        <p className="text-center text-sm font-bold uppercase tracking-widest">{restaurant.kitchenReceiptHeaderText ?? "Kitchen Copy"}</p>
        {restaurant.kitchenReceiptHeaderText && <p className="text-center text-[10px] uppercase tracking-wider">{restaurant.name}</p>}

        {(data.isAdditional || data.isFullReprint) && (
          <p className="mt-2 bg-black py-1 text-center font-sans text-[13px] font-extrabold uppercase tracking-widest text-white">
            {data.isAdditional ? "Additional items" : "Full reprint"}
          </p>
        )}

        {/* Table / order type */}
        <div className="mt-2 border-2 border-black py-1.5 text-center">
          <p className="font-sans text-2xl font-extrabold uppercase leading-tight tracking-wide">{headline}</p>
          {ord.table && <p className="text-[11px] font-bold uppercase tracking-widest">{typeLabel}</p>}
        </div>
        {ord.dailyNo != null && (
          <div className="mt-1.5 border-2 border-black py-1 text-center">
            <p className="font-sans text-4xl font-extrabold leading-none">{String(ord.dailyNo).padStart(2, "0")}</p>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="font-bold">{ord.orderCode ? `Order ID: ${ord.orderCode}` : `#${ord.orderNumber.split("-").slice(-2).join("-")}`}</span>
          <span>{when.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {when.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        {ord.contactName && <p className="text-[11px]"><b>Customer:</b> {ord.contactName}</p>}

        <div className="my-2 border-t-2 border-black" />

        {/* Items */}
        <div>
          <div className="flex items-center gap-2 border-b border-black pb-1 font-sans text-[11px] font-extrabold uppercase tracking-widest">
            <span className="min-w-[1.9rem]">Qty</span>
            <span>Item</span>
          </div>
          {ord.items.map((item, idx) => (
            <div key={item.id} className={`py-2 ${idx > 0 ? "border-t border-dashed border-black" : ""}`}>
              <div className="flex items-start gap-2">
                <span className="min-w-[1.9rem] font-sans text-[16px] font-semibold leading-none">{item.quantity}×</span>
                <span className="break-words font-sans text-[13px] font-semibold uppercase leading-tight">
                  {item.nameSnapshot}
                  {inline(item.choices)}
                </span>
              </div>
              {(item.addons.length > 0 || item.dealSlots.length > 0) && (
                <div className="mt-1 space-y-0.5 pl-[2.4rem] text-[12px] font-semibold">
                  {item.addons.map((a, k) => (
                    <p key={k}>+ {a.nameSnapshot}{a.quantity > 1 ? ` x${a.quantity}` : ""}</p>
                  ))}
                  {item.dealSlots.map((slot, k) => (
                    <div key={k}>
                      <p>• {slot.nameSnapshot}{inline(slot.choices)}</p>
                      {slot.addons.map((a, j) => <p key={j} className="pl-3">+ {a.nameSnapshot}{a.quantity > 1 ? ` x${a.quantity}` : ""}</p>)}
                    </div>
                  ))}
                </div>
              )}
              {item.specialInstructions && (
                <p className="ml-[2.4rem] mt-1.5 border border-black px-1.5 py-0.5 text-[12px] font-bold uppercase">Note: {item.specialInstructions}</p>
              )}
            </div>
          ))}
          {ord.items.length === 0 && <p className="text-xs text-neutral-400 print:hidden">This order has no items to print.</p>}
        </div>

        {ord.items.length > 0 && (
          <div className="mt-1 flex items-center justify-between border-y-2 border-black py-1.5 font-sans text-[20px] font-extrabold uppercase leading-none">
            <span>Total items</span>
            <span className="text-[26px]">{totalQty}</span>
          </div>
        )}

        {ord.specialInstructions && (
          <div className="mt-3 border-2 border-black px-2 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest">Order note</p>
            <p className="break-words text-[13px] font-bold uppercase leading-tight">{ord.specialInstructions}</p>
          </div>
        )}

        {restaurant.kitchenReceiptFooterText && (
          <p className="mt-3 text-center text-[11px] font-bold uppercase">{restaurant.kitchenReceiptFooterText}</p>
        )}
      </div>
    </div>
  );
}
