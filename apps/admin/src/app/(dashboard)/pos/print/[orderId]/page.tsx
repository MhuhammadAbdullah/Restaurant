"use client";

import { LoadingDots } from "../../../../../components/LoadingDots";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueries, useQuery } from "@tanstack/react-query";
import { parsePrintParts, type PrintSlip } from "@restaurant/utils";
import { CustomerReceiptBody, type ReceiptData } from "../../../../../components/receipt/CustomerReceiptBody";
import { KitchenTicketBody, type KitchenTicketData } from "../../../../../components/receipt/KitchenTicketBody";
import { api, ApiError } from "../../../../../lib/api";

/** What is logged in the order's print history for each kind of slip (a pre-payment bill is not a receipt, so it is not logged). */
function eventFor(slip: PrintSlip): { type: string; revisionId?: string } | null {
  if (slip.kind === "customer") return { type: "CUSTOMER" };
  if (slip.kind === "kitchen" || slip.kind === "kitchen-full") return { type: "KITCHEN" };
  if (slip.kind === "kitchen-extra") return { type: "KITCHEN_ADDITIONAL", revisionId: slip.revisionId };
  return null;
}

/**
 * Prints any mix of an order's slips in one go: ?parts=customer,pre,kitchen,full,rev:<id> (see parsePrintParts; no parts, or
 * "both", means customer + kitchen). Each slip goes on its own 80 mm slip and the printer cuts between them. Direct print, no
 * preview, like the single receipt pages; every receipt and kitchen slip is logged in the order's print history, and the page
 * returns to where it came from afterwards.
 */
export default function PrintOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();
  const partsParam = useSearchParams().get("parts");
  const slips = useMemo(() => parsePrintParts(partsParam), [partsParam]);
  const [printError, setPrintError] = useState<string | null>(null);
  const printedRef = useRef(false);

  const retry = (count: number, e: unknown) => !(e instanceof ApiError) && count < 4;
  const needCustomer = slips.some((s) => s.kind === "customer" || s.kind === "pre");
  const customer = useQuery({
    queryKey: ["receipt-customer", orderId],
    queryFn: () => api.get<ReceiptData>(`/staff/orders/${orderId}/receipt/customer`),
    enabled: needCustomer,
    retry,
    retryDelay: (n) => 700 * (n + 1),
  });
  const kitchenSlips = slips.filter((s) => s.kind === "kitchen" || s.kind === "kitchen-full" || s.kind === "kitchen-extra");
  const kitchen = useQueries({
    queries: kitchenSlips.map((s) => ({
      queryKey: ["receipt-kitchen", orderId, s.revisionId, s.kind === "kitchen-full"],
      queryFn: () => api.get<KitchenTicketData>(`/staff/orders/${orderId}/receipt/kitchen${s.revisionId ? `?revisionId=${s.revisionId}` : s.kind === "kitchen-full" ? "?full=true" : ""}`),
      retry,
      retryDelay: (n: number) => 700 * (n + 1),
    })),
  });
  const kitchenData = new Map(kitchenSlips.map((s, i) => [s.key, kitchen[i]?.data]));

  const ready = (!needCustomer || !!customer.data) && kitchen.every((q) => !!q.data);
  const failure = (needCustomer ? customer.error : null) ?? kitchen.find((q) => q.error)?.error ?? null;

  // The slips that will really print: a kitchen slip with nothing on it is left out.
  const visible = slips.filter((s) => {
    if (s.kind === "customer" || s.kind === "pre") return !!customer.data;
    const d = kitchenData.get(s.key);
    return !!d && d.order.items.length > 0;
  });
  const skippedKitchen = ready && slips.some((s) => s.kind.startsWith("kitchen") && !visible.includes(s));

  // (the list is rebuilt on every render, so the effect below depends on what is in it, not on the list itself)
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const visibleKey = visible.map((s) => s.key).join("|");
  const logoUrl = visible.some((s) => s.kind === "customer" || s.kind === "pre") ? (customer.data?.restaurant.logoUrl ?? null) : null;

  useEffect(() => {
    if (!ready || printedRef.current || visibleKey === "") return;
    printedRef.current = true;
    const printNow = () => {
      window.print();
      // Logging never blocks the print itself.
      for (const s of visibleRef.current) {
        const ev = eventFor(s);
        if (ev) void api.post(`/staff/orders/${orderId}/print-events`, { ...ev, status: "PRINTED" }).catch(() => undefined);
      }
    };
    // The logo has to be loaded before the print dialog captures the page (a fresh browser would print without it).
    const logo = logoUrl;
    if (!logo) return printNow();
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
  }, [ready, visibleKey, logoUrl, orderId]);

  useEffect(() => {
    const onAfterPrint = () => router.back();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [router]);

  async function reportFailure() {
    setPrintError(null);
    try {
      for (const s of visible) {
        const ev = eventFor(s);
        if (ev) await api.post(`/staff/orders/${orderId}/print-events`, { ...ev, status: "FAILED" });
      }
      setPrintError("Marked as failed. You can retry printing above.");
    } catch (e) {
      setPrintError(e instanceof ApiError ? e.message : "Could not log the failure");
    }
  }

  if (failure) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{failure instanceof ApiError ? failure.message : "Could not load the receipts. Check the connection and try again."}</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => { void customer.refetch(); kitchen.forEach((q) => void q.refetch()); }} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">Try again</button>
          <button onClick={() => router.back()} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium">Go back</button>
        </div>
      </div>
    );
  }
  if (!ready) return <p className="p-6 text-sm text-neutral-400"><LoadingDots>Preparing the receipts</LoadingDots></p>;
  if (visible.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-amber-700">There is nothing to print: the kitchen slip has no items on it.</p>
        <button onClick={() => router.back()} className="mt-3 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium">Go back</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6 print:max-w-full print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button onClick={reportFailure} className="text-sm text-neutral-500 underline">Report print failure</button>
        <button onClick={() => window.print()} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-brand-red hover:text-brand-red">Print again</button>
      </div>
      {printError && <p className="mb-4 text-sm text-amber-700 print:hidden">{printError}</p>}
      {skippedKitchen && <p className="mb-4 text-sm text-amber-700 print:hidden">A kitchen slip with nothing on it was left out.</p>}

      <style>{"@media print { @page { size: 80mm auto; margin: 5mm 4mm 8mm 4mm; } .slip-break { break-after: page; page-break-after: always; } }"}</style>

      {visible.map((s, i) => {
        const last = i === visible.length - 1;
        return (
          <div key={s.key} className={last ? "" : "slip-break mb-6 print:mb-0"}>
            {(s.kind === "customer" || s.kind === "pre") && customer.data && <CustomerReceiptBody data={customer.data} isPre={s.kind === "pre"} />}
            {s.kind !== "customer" && s.kind !== "pre" && kitchenData.get(s.key) && <KitchenTicketBody data={kitchenData.get(s.key)!} />}
          </div>
        );
      })}
    </div>
  );
}
