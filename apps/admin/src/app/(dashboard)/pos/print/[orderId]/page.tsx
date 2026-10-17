"use client";

import { LoadingDots } from "../../../../../components/LoadingDots";
import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CustomerReceiptBody, type ReceiptData } from "../../../../../components/receipt/CustomerReceiptBody";
import { KitchenTicketBody, type KitchenTicketData } from "../../../../../components/receipt/KitchenTicketBody";
import { api, ApiError } from "../../../../../lib/api";

/**
 * Prints the customer receipt and the kitchen ticket of an order in one go (?parts=both, the default), or just one of them
 * (?parts=customer / ?parts=kitchen). Each goes on its own 80 mm slip: the printer cuts between them. Direct print, no preview,
 * like the single receipt pages; both prints are logged like the single ones, and the page returns to the POS afterwards.
 */
export default function PrintOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();
  const parts = useSearchParams().get("parts") ?? "both";
  const wantCustomer = parts === "both" || parts === "customer";
  const wantKitchen = parts === "both" || parts === "kitchen";
  const [printError, setPrintError] = useState<string | null>(null);
  const printedRef = useRef(false);

  const retry = (count: number, e: unknown) => !(e instanceof ApiError) && count < 4;
  const customer = useQuery({
    queryKey: ["receipt-customer", orderId],
    queryFn: () => api.get<ReceiptData>(`/staff/orders/${orderId}/receipt/customer`),
    enabled: wantCustomer,
    retry,
    retryDelay: (n) => 700 * (n + 1),
  });
  const kitchen = useQuery({
    queryKey: ["receipt-kitchen", orderId, undefined, false],
    queryFn: () => api.get<KitchenTicketData>(`/staff/orders/${orderId}/receipt/kitchen`),
    enabled: wantKitchen,
    retry,
    retryDelay: (n) => 700 * (n + 1),
  });

  const ready = (!wantCustomer || !!customer.data) && (!wantKitchen || !!kitchen.data);
  const failed = (wantCustomer && customer.error) || (wantKitchen && kitchen.error);
  const kitchenHasItems = !!kitchen.data && kitchen.data.order.items.length > 0;
  const showKitchen = wantKitchen && kitchenHasItems;

  useEffect(() => {
    if (!ready || printedRef.current) return;
    printedRef.current = true;
    const logo = customer.data?.restaurant.logoUrl;
    const printNow = () => {
      window.print();
      // Print logging never blocks the print itself.
      if (wantCustomer) void api.post(`/staff/orders/${orderId}/print-events`, { type: "CUSTOMER", status: "PRINTED" }).catch(() => undefined);
      if (showKitchen) void api.post(`/staff/orders/${orderId}/print-events`, { type: "KITCHEN", status: "PRINTED" }).catch(() => undefined);
    };
    if (!wantCustomer || !logo) return printNow();
    // The logo has to be loaded before the print dialog captures the page (a fresh browser would print without it).
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      printNow();
    };
    const img = new window.Image();
    img.onload = go;
    img.onerror = go;
    img.src = logo;
    const timer = setTimeout(go, 5000);
    return () => clearTimeout(timer);
  }, [ready, customer.data, orderId, wantCustomer, showKitchen]);

  useEffect(() => {
    const onAfterPrint = () => router.back();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [router]);

  async function reportFailure() {
    setPrintError(null);
    try {
      if (wantCustomer) await api.post(`/staff/orders/${orderId}/print-events`, { type: "CUSTOMER", status: "FAILED" });
      if (showKitchen) await api.post(`/staff/orders/${orderId}/print-events`, { type: "KITCHEN", status: "FAILED" });
      setPrintError("Marked as failed. You can retry printing above.");
    } catch (e) {
      setPrintError(e instanceof ApiError ? e.message : "Could not log the failure");
    }
  }

  if (failed) {
    const err = (customer.error ?? kitchen.error) as unknown;
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{err instanceof ApiError ? err.message : "Could not load the receipts. Check the connection and try again."}</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => { void customer.refetch(); void kitchen.refetch(); }} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">Try again</button>
          <button onClick={() => router.back()} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium">Go back</button>
        </div>
      </div>
    );
  }
  if (!ready) return <p className="p-6 text-sm text-neutral-400"><LoadingDots>Preparing the receipts</LoadingDots></p>;

  return (
    <div className="mx-auto max-w-md p-6 print:max-w-full print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button onClick={reportFailure} className="text-sm text-neutral-500 underline">Report print failure</button>
        <button onClick={() => window.print()} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-brand-red hover:text-brand-red">Print again</button>
      </div>
      {printError && <p className="mb-4 text-sm text-amber-700 print:hidden">{printError}</p>}
      {wantKitchen && !kitchenHasItems && <p className="mb-4 text-sm text-amber-700 print:hidden">There is nothing for the kitchen to cook on this order, so no kitchen slip is printed.</p>}

      <style>{"@media print { @page { size: 80mm auto; margin: 5mm 4mm 8mm 4mm; } .slip-break { break-after: page; page-break-after: always; } }"}</style>

      {wantCustomer && customer.data && (
        <div className={showKitchen ? "slip-break" : undefined}>
          <CustomerReceiptBody data={customer.data} isPre={false} />
        </div>
      )}
      {showKitchen && kitchen.data && (
        <div className={wantCustomer ? "mt-6 print:mt-0" : undefined}>
          <KitchenTicketBody data={kitchen.data} />
        </div>
      )}
    </div>
  );
}
