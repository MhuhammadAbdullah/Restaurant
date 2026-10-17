"use client";

import { LoadingDots } from "../../../../../components/LoadingDots";
import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../../../../lib/api";
import { KitchenTicketBody, type KitchenTicketData } from "../../../../../components/receipt/KitchenTicketBody";


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

  if (isLoading) return <p className="p-6 text-sm text-neutral-400"><LoadingDots>Loading ticket</LoadingDots></p>;
  if (error || !data) return <p className="p-6 text-sm text-red-600">{error instanceof ApiError ? error.message : "Could not load kitchen ticket"}</p>;

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

      <KitchenTicketBody data={data} />
    </div>
  );
}
