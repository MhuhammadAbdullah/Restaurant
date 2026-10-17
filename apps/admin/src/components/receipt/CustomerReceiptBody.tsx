"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export type ReceiptData = {
  operator: string | null;
  coupon: { discountType: "PERCENTAGE" | "FIXED_AMOUNT"; discountValue: number; maxDiscountAmount: number | null } | null;
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
    messages: { dineIn: string; takeaway: string; walkIn: string; delivery: string; preBill: string };
  };
  order: {
    id: string;
    orderNumber: string;
    orderCode?: string | null;
    dailyNo?: number | null;
    type: string;
    source: string;
    status: string;
    createdAt: string;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    deliveryAddressSnapshot: string | null;
    deliveryArea: string | null;
    deliveryCity: string | null;
    deliveryLandmark: string | null;
    contactAlternatePhone: string | null;
    specialInstructions: string | null;
    subtotal: number;
    taxAmount: number;
    deliveryFee: number;
    discountAmount: number;
    couponCode: string | null;
    couponDiscountAmount: number;
    loyaltyDiscountAmount: number;
    loyaltyPointsRedeemed: number;
    grandTotal: number;
    tipAmount: number;
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

type Variant = "DINE_IN" | "TAKEAWAY" | "WALK_IN" | "DELIVERY";
function variantOf(type: string): Variant {
  if (type === "DINE_IN") return "DINE_IN";
  if (type === "WALK_IN") return "WALK_IN";
  if (type === "DELIVERY" || type === "ONLINE_DELIVERY") return "DELIVERY";
  return "TAKEAWAY"; // TAKEAWAY and ONLINE_PICKUP
}

/** 1234.5 -> "1,234.50" (paisa in, rupees out) */
const money = (paisa: number) => (paisa / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (paisa: number) => Math.round(paisa / 100).toLocaleString("en-US");

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", displayValue: true, height: 44, width: 1.5, margin: 0, fontSize: 12, font: "monospace" });
    } catch {
      // an unencodable value just leaves the barcode blank
    }
  }, [value]);
  return <svg ref={ref} className="mx-auto max-w-full" />;
}


/** The printed customer receipt / pre-payment bill. Used by the POS print page and the Receipts settings preview, so they always match. */
export function CustomerReceiptBody({ data, isPre }: { data: ReceiptData; isPre: boolean }) {
  const { restaurant, order, operator, coupon } = data;
  const variant = variantOf(order.type);
  const dineIn = variant === "DINE_IN";
  // Dine-in prints Title Case; the other types print in CAPITALS (as in the approved bill designs).
  const T = (text: string) => (dineIn ? text : text.toUpperCase());
  const paidPayments = order.payments.filter((p) => p.status === "PAID");
  const paidTotal = paidPayments.reduce((n, p) => n + p.amount, 0);
  // Nothing paid yet (COD, pending online, pre-bill): the customer still owes the bill AND the tip they chose.
  // Once a payment exists, any tip was taken with it, so only the unpaid part of the bill remains.
  const billLeft = Math.max(0, order.grandTotal - paidTotal);
  const balanceDue = billLeft + (billLeft > 0 && paidTotal === 0 ? (order.tipAmount ?? 0) : 0);
  const isPaid = balanceDue === 0 && order.grandTotal > 0;
  const title = isPre ? "PRE-PAYMENT BILL" : "SALE RECEIPT";
  // Today's serial for this branch (01, 02, 03...). Falls back to the Order ID for very old orders without one.
  const serial = order.dailyNo != null ? String(order.dailyNo).padStart(2, "0") : (order.orderCode ?? order.orderNumber);
  // The daily serial is the customer's token number, so it says so ("TOKEN 07"); an old order without one shows its Order ID alone.
  const headline = order.dailyNo != null ? `TOKEN ${serial}` : serial;
  const when = new Date(order.createdAt);
  const dateText = when.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
  const timeText = when.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const discountTotal = order.discountAmount + order.couponDiscountAmount + order.loyaltyDiscountAmount;
  const discountLines: { label: string; amount: number }[] = [];
  if (order.discountAmount > 0) {
    const pct = order.subtotal > 0 ? (order.discountAmount / order.subtotal) * 100 : 0;
    discountLines.push({ label: Math.abs(pct - Math.round(pct)) < 0.05 && pct >= 1 ? `Discount (${Math.round(pct)}%)` : "Discount (Fixed)", amount: order.discountAmount });
  }
  if (order.couponDiscountAmount > 0) {
    const detail = !coupon ? "" : coupon.discountType === "PERCENTAGE" ? ` (${coupon.discountValue}% off)` : ` (Rs. ${(coupon.discountValue / 100).toLocaleString("en-US")} off)`;
    discountLines.push({ label: `Coupon ${order.couponCode ?? ""}${detail}`.replace(/\s+/g, " ").trim(), amount: order.couponDiscountAmount });
  }
  if (order.loyaltyDiscountAmount > 0) {
    discountLines.push({ label: `Loyalty points${order.loyaltyPointsRedeemed > 0 ? ` (${order.loyaltyPointsRedeemed} pts)` : ""}`, amount: order.loyaltyDiscountAmount });
  }
  const taxBase = order.subtotal - discountTotal;
  const taxPctRaw = taxBase > 0 ? (order.taxAmount / taxBase) * 100 : 0;
  const taxPct = Math.round(taxPctRaw);
  const taxLabel = order.taxAmount > 0 && taxPct > 0 && Math.abs(taxPctRaw - taxPct) < 0.5 ? `Tax (${taxPct}%)` : "Tax";
  const customerName = order.customer?.name ?? order.contactName;
  const customerPhone = order.customer?.phone ?? order.contactPhone;
  const addressText = [order.deliveryAddressSnapshot, order.deliveryArea, order.deliveryCity].filter(Boolean).join(", ");
  const phones = Array.from(new Set([order.branch.phone, restaurant.contactPhone].filter((x): x is string => !!x)));
  // Custom thank-you per receipt type (Receipts settings); falls back to the general message, then a sensible default.
  const perType = isPre ? restaurant.messages.preBill : { DINE_IN: restaurant.messages.dineIn, TAKEAWAY: restaurant.messages.takeaway, WALK_IN: restaurant.messages.walkIn, DELIVERY: restaurant.messages.delivery }[variant];
  const thanks =
    perType?.trim() ||
    restaurant.thankYouMessage?.trim() ||
    (variant === "DELIVERY" ? `Thank you for ordering from ${restaurant.name}!` : `Thanks for visiting ${restaurant.name} ${order.branch.name.replace(/\s*branch\s*$/i, "")}`.trim());

  const cols = "grid grid-cols-[1.6rem_minmax(0,1fr)_3.4rem_3.9rem] gap-x-1";
  const info = (label: string, value: string) => (
    <p key={label} className="break-words">
      <b>{T(label)}:</b> {T(value)}
    </p>
  );

  return (
  <div className="mx-auto rounded-lg bg-white px-5 pb-8 pt-6 font-mono text-[12px] leading-snug text-black shadow-sm ring-1 ring-neutral-200 print:w-[72mm] print:rounded-none print:p-0 print:shadow-none print:ring-0 print:text-[11px]">
    {restaurant.logoUrl && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={restaurant.logoUrl} alt="" className="mx-auto mb-3 h-20 w-auto max-w-[65%] object-contain print:h-16" />
    )}

    <div className="border border-black">
      {/* Branch */}
      <div className="px-3 py-3">
        <p className="text-center text-lg font-bold leading-tight">{order.branch.name}</p>
        <div className="mt-2 space-y-0.5 text-[11px]">
          <p><b>Address:</b> {order.branch.address}</p>
          {(order.branch.phone ?? restaurant.contactPhone) && <p><b>Phone:</b> {order.branch.phone ?? restaurant.contactPhone}</p>}
        </div>
      </div>

      {/* Title + headline (table / invoice number) */}
      <div className="border-y-[3px] border-double border-black py-1.5 text-center font-sans text-[15px] font-extrabold tracking-wide">{title}</div>
      <div className="border-b-[3px] border-double border-black py-1.5 text-center font-sans text-[17px] font-extrabold tracking-wide">{headline}</div>

      <div className="px-3 pb-3 pt-3">
        {/* Order info — differs by order type */}
        <div className="space-y-0.5 text-[11px]">
          {order.orderCode && info("Order ID", order.orderCode)}
          {info("Invoice No", order.orderNumber.replace(/\D/g, ""))}
          {info("Type", order.type.replace(/_/g, " ").replace(/^ONLINE /, ""))}
          {info("Date", dateText)}
          {info("Time", timeText)}
          {operator && info("Operator", operator)}
          {variant === "DELIVERY" && (
            <>
              {customerName && info("Customer", customerName)}
              {customerPhone && info("Contact", customerPhone)}
              {order.contactAlternatePhone && info("Alternate", order.contactAlternatePhone)}
              {addressText && info("Address", addressText)}
              {order.deliveryLandmark && info("Nearest landmark", order.deliveryLandmark)}
            </>
          )}
          {(variant === "TAKEAWAY" || variant === "WALK_IN") && customerName && (
            <>
              {info("Customer", customerName)}
              {customerPhone && info("Contact", customerPhone)}
            </>
          )}
        </div>

        <div className="my-2 border-t border-dashed border-black" />

        {/* Items */}
        <div className={`${cols} border-b-2 border-black pb-1 text-[11px]`}>
          <span>Qty</span><span>Item</span><span className="text-right">Rate</span><span className="text-right">Amount</span>
        </div>
        <div className="mt-1.5 space-y-1.5">
          {order.items.map((item) => (
            <div key={item.id}>
              <div className={cols}>
                <span>{item.quantity}</span>
                <span className="break-words">{item.nameSnapshot}{item.choices.length > 0 ? ` (${item.choices.map((c) => c.nameSnapshot).join(", ")})` : ""}</span>
                <span className="text-right">{whole(item.unitPrice)}</span>
                <span className="text-right">{whole(item.lineTotal)}</span>
              </div>
              {item.addons.map((a, k) => (
                <p key={k} className="pl-7 text-[10px]">+ {a.nameSnapshot} x{a.quantity}</p>
              ))}
              {item.dealSlots.map((slot, k) => (
                <div key={k} className="pl-7 text-[10px]">
                  <p>{slot.nameSnapshot}{slot.choices.length > 0 ? ` (${slot.choices.map((c) => c.nameSnapshot).join(", ")})` : ""}</p>
                  {slot.addons.map((a, j) => <p key={j} className="pl-3">+ {a.nameSnapshot} x{a.quantity}</p>)}
                </div>
              ))}
              {item.specialInstructions && <p className="pl-7 text-[10px] italic">Note: {item.specialInstructions}</p>}
            </div>
          ))}
        </div>

        <div className="mt-2 border-t-2 border-black pt-1.5 text-[11px]">
          <div className="space-y-0.5">
            <div className="flex justify-between"><b>SubTotal:</b><span>{money(order.subtotal)}</span></div>
            {discountLines.length === 0 ? (
              <div className="flex justify-between"><b>Discount:</b><span>{money(0)}</span></div>
            ) : (
              discountLines.map((d) => (
                <div key={d.label} className="flex justify-between gap-2"><b className="break-words">{d.label}:</b><span className="shrink-0">-{money(d.amount)}</span></div>
              ))
            )}
            <div className="flex justify-between"><b>{taxLabel}:</b><span>{money(order.taxAmount)}</span></div>
            {order.deliveryFee > 0 && <div className="flex justify-between"><b>Delivery Fee:</b><span>{money(order.deliveryFee)}</span></div>}
          </div>
          <div className="mt-1.5 space-y-0.5 border-t-2 border-black pt-1.5">
            <div className="flex justify-between text-[12px]"><b>{isPre ? "Net Bill (Payable)" : "Net Bill"}:</b><b>{money(order.grandTotal)}</b></div>
            <div className="flex justify-between"><b>T.I.P:</b><span>{money(order.tipAmount ?? 0)}</span></div>
            {(order.tipAmount ?? 0) > 0 && <div className="flex justify-between text-[12px]"><b>Total incl. tip:</b><b>{money(order.grandTotal + order.tipAmount)}</b></div>}
          </div>
        </div>

        {/* How it was paid (final receipt only) */}
        {!isPre && (paidPayments.length > 0 || balanceDue > 0) && (
          <div className="mt-1.5 space-y-0.5 border-t border-dashed border-black pt-1.5 text-[10px]">
            {paidPayments.map((pay) => {
              const isCash = pay.method === "CASH";
              const received = isCash && pay.amountTendered != null ? pay.amountTendered : pay.amount;
              return (
                <div key={pay.id} className="space-y-0.5">
                  <div className="flex justify-between"><b>Received:</b><span>{money(received)}</span></div>
                  <div className="flex justify-between"><span>Payment method:</span><span className="font-bold">{pay.method}</span></div>
                  {isCash && pay.amountTendered != null && pay.amountTendered - (order.tipAmount ?? 0) > pay.amount && (
                    <div className="flex justify-between"><span>Change:</span><span>{money(pay.amountTendered - pay.amount - (order.tipAmount ?? 0))}</span></div>
                  )}
                </div>
              );
            })}
            {balanceDue > 0 && <div className="flex justify-between font-bold"><span>BALANCE DUE</span><span>{money(balanceDue)}</span></div>}
            {isPaid && <p className="text-center font-bold tracking-widest">PAID</p>}
          </div>
        )}
        {isPre && paidTotal > 0 && (
          <div className="mt-1.5 space-y-0.5 border-t border-dashed border-black pt-1.5 text-[10px]">
            <div className="flex justify-between"><span>Already paid</span><span>{money(paidTotal)}</span></div>
            <div className="flex justify-between font-bold"><span>BALANCE TO PAY</span><span>{money(balanceDue)}</span></div>
          </div>
        )}

        <div className="mt-2 border-t-2 border-black" />

        {/* Footer */}
        <div className="mt-5 text-center">
          {restaurant.taxNumber && <p className="text-[13px] font-bold">{restaurant.taxNumber}</p>}
          <p className="mt-3 text-[12px] font-bold uppercase leading-snug">“{thanks}”</p>
          {isPre && (
            <p className="mt-1 text-[9.5px] font-bold uppercase leading-snug">(This is not the final bill, please do not forget to take the final bill from our staff)</p>
          )}
        </div>

        {/* Quick-reference block: what staff call out and what the guest quotes later */}
        <div className="mt-4 space-y-0.5 border-y border-dashed border-black py-2 text-center text-[12px] font-bold">
          {order.table && <p>Table No: {order.table.name ?? order.table.number}</p>}
          <p>Invoice No: {order.orderNumber.replace(/\D/g, "")}</p>
        </div>

        <div className="mt-4">
          <Barcode value={order.orderNumber.replace(/\D/g, "")} />
        </div>

        <div className="mt-4 space-y-0.5 text-center text-[11px] font-bold">
          {restaurant.footerText && <p className="whitespace-pre-line">{restaurant.footerText}</p>}
          {phones.length > 0 && <p>{phones.join("/")}</p>}
        </div>
      </div>
    </div>
  </div>
  );
}
