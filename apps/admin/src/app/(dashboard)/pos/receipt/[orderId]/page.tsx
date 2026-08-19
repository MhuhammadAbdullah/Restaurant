"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../../../lib/api";

type ReceiptData = {
  restaurant: {
    name: string;
    logoUrl: string | null;
    taxNumber: string | null;
    currency: string;
    contactPhone: string | null;
    contactEmail: string | null;
    socialLinks: Record<string, string> | null;
    footerText: string | null;
    thankYouMessage: string | null;
  };
  order: {
    id: string;
    orderNumber: string;
    type: string;
    source: string;
    status: string;
    createdAt: string;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    deliveryAddressSnapshot: string | null;
    specialInstructions: string | null;
    subtotal: number;
    taxAmount: number;
    deliveryFee: number;
    discountAmount: number;
    couponCode: string | null;
    couponDiscountAmount: number;
    loyaltyDiscountAmount: number;
    grandTotal: number;
    paymentMethod: string;
    paymentStatus: string;
    branch: { name: string; address: string; phone: string | null };
    table: { number: string; name: string | null } | null;
    customer: { name: string; phone: string; email: string | null } | null;
    payments: { id: string; method: string; status: string; amount: number; amountTendered: number | null }[];
    items: {
      id: string;
      nameSnapshot: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      specialInstructions: string | null;
      orderRevisionId: string | null;
      choices: { nameSnapshot: string; priceAdjustmentSnapshot: number }[];
      addons: { nameSnapshot: string; priceSnapshot: number; quantity: number }[];
      dealSlots: {
        nameSnapshot: string;
        choices: { nameSnapshot: string }[];
        addons: { nameSnapshot: string; quantity: number }[];
      }[];
    }[];
  };
};

function compactUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export default function CustomerReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();
  const [printError, setPrintError] = useState<string | null>(null);
  const printedRef = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["receipt-customer", orderId],
    queryFn: () => api.get<ReceiptData>(`/staff/orders/${orderId}/receipt/customer`),
  });

  // Direct print, no preview: fire the moment the receipt data is ready, no manual click needed.
  useEffect(() => {
    if (!data || printedRef.current) return;
    printedRef.current = true;
    window.print();
    void api.post(`/staff/orders/${orderId}/print-events`, { type: "CUSTOMER", status: "PRINTED" }).catch(() => {
      // logging failure doesn't block the print itself
    });
  }, [data, orderId]);

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

  if (isLoading) return <p className="p-6 text-sm text-neutral-400">Loading receipt...</p>;
  if (error || !data) return <p className="p-6 text-sm text-red-600">{error instanceof ApiError ? error.message : "Could not load receipt"}</p>;

  const { restaurant, order } = data;
  const cash = order.payments.find((p) => p.method === "CASH" && p.amountTendered != null);
  const paidTotal = order.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
  const balanceDue = order.grandTotal - paidTotal;

  return (
    <div className="mx-auto max-w-md p-6 print:max-w-full print:p-0">
      <div className="mb-4 print:hidden">
        <button onClick={reportFailure} className="text-sm text-neutral-500 underline">Report print failure</button>
      </div>
      {printError && <p className="mb-4 text-sm text-amber-700 print:hidden">{printError}</p>}

      <style>{"@media print { @page { size: 80mm auto; margin: 0; } }"}</style>

      <div className="rounded-xl border border-neutral-200 bg-white p-6 font-mono text-sm print:w-[72mm] print:rounded-none print:border-0 print:p-1 print:text-[11px]">
        <div className="text-center">
          {restaurant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logoUrl} alt="" className="mx-auto mb-2 h-12 w-12 object-contain" />
          )}
          <p className="text-base font-bold">{restaurant.name}</p>
          <p className="text-xs text-neutral-600">{order.branch.name}</p>
          <p className="text-xs text-neutral-600">{order.branch.address}</p>
          {(order.branch.phone ?? restaurant.contactPhone) && <p className="text-xs text-neutral-600">{order.branch.phone ?? restaurant.contactPhone}</p>}
          {restaurant.taxNumber && <p className="text-xs text-neutral-500">Tax #: {restaurant.taxNumber}</p>}
        </div>

        <div className="my-3 border-t border-dashed border-neutral-300" />

        <div className="space-y-0.5 text-xs">
          <p>Order #: {order.orderNumber}</p>
          <p>Date: {new Date(order.createdAt).toLocaleString()}</p>
          <p>Type: {order.type.replace(/_/g, " ")} ({order.source})</p>
          {order.table && <p>Table: {order.table.name ?? order.table.number}</p>}
          <p>Customer: {order.customer?.name ?? order.contactName ?? "N/A"}</p>
          <p>Phone: {order.customer?.phone ?? order.contactPhone ?? "N/A"}</p>
          <p>Email: {order.customer?.email ?? order.contactEmail ?? "N/A"}</p>
          {order.deliveryAddressSnapshot && <p>Address: {order.deliveryAddressSnapshot}</p>}
        </div>

        <div className="my-3 border-t border-dashed border-neutral-300" />

        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id}>
              <div className="flex justify-between text-xs">
                <span>{item.quantity}x {item.nameSnapshot}</span>
                <span>{formatPaisa(item.lineTotal)}</span>
              </div>
              {item.choices.map((c, i) => (
                <p key={i} className="pl-3 text-[11px] text-neutral-500">+ {c.nameSnapshot}</p>
              ))}
              {item.addons.map((a, i) => (
                <p key={i} className="pl-3 text-[11px] text-neutral-500">+ {a.nameSnapshot} x{a.quantity}</p>
              ))}
              {item.dealSlots.map((slot, i) => (
                <div key={i} className="pl-3 text-[11px] text-neutral-500">
                  <p>{slot.nameSnapshot}</p>
                  {slot.choices.map((c, j) => <p key={j} className="pl-3">+ {c.nameSnapshot}</p>)}
                  {slot.addons.map((a, j) => <p key={j} className="pl-3">+ {a.nameSnapshot} x{a.quantity}</p>)}
                </div>
              ))}
              {item.specialInstructions && <p className="pl-3 text-[11px] italic text-amber-700">Note: {item.specialInstructions}</p>}
            </div>
          ))}
        </div>

        <div className="my-3 border-t border-dashed border-neutral-300" />

        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatPaisa(order.subtotal)}</span></div>
          {order.discountAmount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{formatPaisa(order.discountAmount)}</span></div>}
          {order.couponDiscountAmount > 0 && <div className="flex justify-between"><span>Coupon ({order.couponCode})</span><span>-{formatPaisa(order.couponDiscountAmount)}</span></div>}
          {order.loyaltyDiscountAmount > 0 && <div className="flex justify-between"><span>Loyalty Discount</span><span>-{formatPaisa(order.loyaltyDiscountAmount)}</span></div>}
          {order.taxAmount > 0 && <div className="flex justify-between"><span>Tax</span><span>{formatPaisa(order.taxAmount)}</span></div>}
          {order.deliveryFee > 0 && <div className="flex justify-between"><span>Delivery Fee</span><span>{formatPaisa(order.deliveryFee)}</span></div>}
          <div className="flex justify-between border-t border-neutral-300 pt-1 text-sm font-bold"><span>Grand Total</span><span>{formatPaisa(order.grandTotal)}</span></div>
        </div>

        <div className="my-3 border-t border-dashed border-neutral-300" />

        <div className="space-y-0.5 text-xs">
          <p>Payment Method: {order.paymentMethod}</p>
          <p>Payment Status: {order.paymentStatus}</p>
          {cash?.amountTendered != null && (
            <>
              <p>Cash Tendered: {formatPaisa(cash.amountTendered)}</p>
              <p>Change: {formatPaisa(Math.max(0, cash.amountTendered - cash.amount))}</p>
            </>
          )}
          {balanceDue > 0 && <p className="font-semibold text-amber-700">Balance Due: {formatPaisa(balanceDue)}</p>}
        </div>

        {(restaurant.thankYouMessage || restaurant.footerText || (restaurant.socialLinks && Object.keys(restaurant.socialLinks).length > 0)) && (
          <>
            <div className="my-3 border-t border-dashed border-neutral-300" />
            <div className="text-center text-xs text-neutral-600">
              {restaurant.thankYouMessage && <p className="font-medium">{restaurant.thankYouMessage}</p>}
              {restaurant.footerText && <p className="mt-1">{restaurant.footerText}</p>}
              {restaurant.socialLinks && Object.keys(restaurant.socialLinks).length > 0 && (
                <p className="mt-1 text-[11px] text-neutral-400">
                  {Object.entries(restaurant.socialLinks)
                    .map(([, url]) => compactUrl(url))
                    .join(" · ")}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
