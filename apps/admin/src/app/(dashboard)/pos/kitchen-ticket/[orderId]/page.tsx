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

  return (
    <div className="mx-auto max-w-md p-6 print:max-w-full print:p-0">
      <div className="mb-4 print:hidden">
        <button onClick={reportFailure} className="text-sm text-neutral-500 underline">Report print failure</button>
        {printError && <p className="mt-2 text-sm text-amber-700">{printError}</p>}
      </div>

      <style>{"@media print { @page { size: 80mm auto; margin: 0; } }"}</style>

      <div className="rounded-xl border border-neutral-200 bg-white p-6 font-mono text-sm print:w-[72mm] print:rounded-none print:border-0 print:p-1 print:text-[11px]">
        <div className="text-center">
          <p className="text-base font-bold">{restaurant.kitchenReceiptHeaderText ?? restaurant.name}</p>
          {data.isAdditional && <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">ADDITIONAL ITEMS</p>}
          {data.isFullReprint && <p className="mt-1 rounded bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">FULL REPRINT</p>}
        </div>

        <div className="my-3 border-t border-dashed border-neutral-300" />

        <div className="space-y-0.5 text-xs">
          <p className="text-sm font-bold">Order #: {ord.orderNumber}</p>
          <p>Type: {ord.type.replace(/_/g, " ")}</p>
          {ord.table && <p>Table: {ord.table.name ?? ord.table.number}</p>}
          <p>Time: {new Date(ord.createdAt).toLocaleTimeString()}</p>
          {ord.contactName && <p>Customer: {ord.contactName}</p>}
        </div>

        <div className="my-3 border-t border-dashed border-neutral-300" />

        <div className="space-y-2">
          {ord.items.map((item) => (
            <div key={item.id}>
              <p className="text-sm font-semibold">{item.quantity}x {item.nameSnapshot}</p>
              {item.choices.map((c, i) => <p key={i} className="pl-3 text-xs text-neutral-600">- {c.nameSnapshot}</p>)}
              {item.addons.map((a, i) => <p key={i} className="pl-3 text-xs text-neutral-600">- {a.nameSnapshot} x{a.quantity}</p>)}
              {item.dealSlots.map((slot, i) => (
                <div key={i} className="pl-3 text-xs text-neutral-600">
                  <p className="font-medium">{slot.nameSnapshot}</p>
                  {slot.choices.map((c, j) => <p key={j} className="pl-3">- {c.nameSnapshot}</p>)}
                  {slot.addons.map((a, j) => <p key={j} className="pl-3">- {a.nameSnapshot} x{a.quantity}</p>)}
                </div>
              ))}
              {item.specialInstructions && <p className="pl-3 text-xs italic text-amber-700">** {item.specialInstructions} **</p>}
            </div>
          ))}
          {ord.items.length === 0 && <p className="text-xs text-neutral-400">No items in this scope.</p>}
        </div>

        {ord.specialInstructions && (
          <>
            <div className="my-3 border-t border-dashed border-neutral-300" />
            <p className="text-xs italic text-amber-700">Order note: {ord.specialInstructions}</p>
          </>
        )}

        {restaurant.kitchenReceiptFooterText && (
          <>
            <div className="my-3 border-t border-dashed border-neutral-300" />
            <p className="text-center text-xs text-neutral-500">{restaurant.kitchenReceiptFooterText}</p>
          </>
        )}
      </div>
    </div>
  );
}
