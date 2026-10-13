"use client";

import { LoadingDots } from "../../../../../components/LoadingDots";
import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CustomerReceiptBody, type ReceiptData } from "../../../../../components/receipt/CustomerReceiptBody";
import { api, ApiError } from "../../../../../lib/api";

export default function CustomerReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();
  // ?kind=pre -> pre-payment bill (shown to the guest before they pay); otherwise the final receipt.
  const isPre = useSearchParams().get("kind") === "pre";
  const [printError, setPrintError] = useState<string | null>(null);
  const printedRef = useRef(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["receipt-customer", orderId],
    queryFn: () => api.get<ReceiptData>(`/staff/orders/${orderId}/receipt/customer`),
    // The server restarting for a second (or a flaky connection) should not leave a dead page: try a few times first.
    retry: (count, e) => !(e instanceof ApiError) && count < 4,
    retryDelay: (n) => 700 * (n + 1),
  });

  // Direct print, no preview: fire the moment the receipt data is ready, no manual click needed.
  useEffect(() => {
    if (!data || printedRef.current) return;
    printedRef.current = true;
    // The logo must be fully loaded before the print dialog captures the page. It is cached for the admin
    // who uploaded it, but a fresh browser (manager, cashier) would otherwise print before it arrives.
    const logo = data.restaurant.logoUrl;
    const printNow = () => {
      window.print();
      // A pre-bill is not a customer receipt, so it is not logged as one.
      if (!isPre) {
        void api.post(`/staff/orders/${orderId}/print-events`, { type: "CUSTOMER", status: "PRINTED" }).catch(() => {
          // logging failure doesn't block the print itself
        });
      }
    };
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
    const timer = setTimeout(go, 5000); // never block printing on a slow logo
    return () => clearTimeout(timer);
  }, [data, orderId, isPre]);

  useEffect(() => {
    const onAfterPrint = () => router.back();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [router]);

  async function reportFailure() {
    setPrintError(null);
    try {
      await api.post(`/staff/orders/${orderId}/print-events`, { type: "CUSTOMER", status: "FAILED" });
      setPrintError("Marked as failed. You can retry printing above.");
    } catch (e) {
      setPrintError(e instanceof ApiError ? e.message : "Could not log the failure");
    }
  }

  if (isLoading) return <p className="p-6 text-sm text-neutral-400"><LoadingDots>Loading receipt</LoadingDots></p>;
  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{error instanceof ApiError ? error.message : "Could not load the receipt. Check the connection and try again."}</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => void refetch()} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">Try again</button>
          <button onClick={() => router.back()} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium">Go back</button>
        </div>
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

      <style>{"@media print { @page { size: 80mm auto; margin: 5mm 4mm 8mm 4mm; } }"}</style>

      <CustomerReceiptBody data={data} isPre={isPre} />
    </div>
  );
}
