"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { useQuery } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FaLocationDot,
  FaPhone,
  FaPrint,
  FaDownload,
  FaUtensils,
  FaClipboardList,
  FaBowlFood,
  FaFileInvoiceDollar,
  FaBell,
  FaBoxOpen,
  FaCircleXmark,
  FaCircleCheck,
} from "react-icons/fa6";
import { GiCookingPot } from "react-icons/gi";
import { MdDeliveryDining } from "react-icons/md";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { useRealtimeOrder } from "../../../lib/useRealtime";
import { subscribeToOrderPush, isPushSupported, type PushSubscribeResult } from "../../../lib/push";
import { useAuthStore } from "../../../store/useAuthStore";
import { useAuthModalStore } from "../../../store/useAuthModalStore";
import { OrderStatusBadge, OrderHeroIcon, getStatusMessage, PaymentStatusBadge, PAYMENT_METHOD_LABEL } from "../../../components/OrderStatusBadge";
import { Skeleton, SkeletonText } from "../../../components/skeletons";
import { ArrowLeftIcon, HourglassIcon, SearchIcon } from "../../../components/icons";

type OrderDetail = {
  id: string;
  orderNumber: string;
  createdAt: string;
  type: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryAddressSnapshot: string | null;
  deliveryArea: string | null;
  specialInstructions: string | null;
  changeRequestAmount: number | null;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  discountAmount: number;
  loyaltyDiscountAmount: number;
  grandTotal: number;
  estimatedDeliveryAt: string | null;
  branch: { name: string; phone: string | null; address: string | null; mapUrl: string | null; latitude: string | null; longitude: string | null };
  items: Array<{ id: string; nameSnapshot: string; quantity: number; lineTotal: number; specialInstructions: string | null }>;
};

type RestaurantInfo = { name: string; logoUrl: string | null };

const PICKUP_TYPES = new Set(["ONLINE_PICKUP", "TAKEAWAY"]);
const DELIVERY_TYPES = new Set(["ONLINE_DELIVERY", "DELIVERY"]);

function branchMapUrl(branch: OrderDetail["branch"]): string | null {
  if (branch.mapUrl) return branch.mapUrl;
  if (branch.latitude && branch.longitude) return `https://www.google.com/maps/search/?api=1&query=${branch.latitude},${branch.longitude}`;
  if (branch.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`;
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Renders a react-icons element to an inline <svg> string — used to keep the downloadable
// receipt (a standalone HTML string, not JSX) on the exact same icon library as the live page,
// instead of hand-copied SVG paths or emoji.
function iconHtml(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

const HERO_ICON: Record<string, { icon: React.ReactElement; bg: string }> = {
  PREPARING: { icon: <GiCookingPot size={28} />, bg: "#fed7aa" },
  READY: { icon: <FaBoxOpen size={26} />, bg: "#bfdbfe" },
  OUT_FOR_DELIVERY: { icon: <MdDeliveryDining size={30} />, bg: "#e9d5ff" },
  CANCELLED: { icon: <FaCircleXmark size={26} />, bg: "#ef4444" },
  REFUNDED: { icon: <FaCircleXmark size={26} />, bg: "#ef4444" },
};

/** Mirrors the on-page layout (hero status, status card, order info, items, payment) as a self-contained downloadable snapshot — frozen at whatever status the order was in at download time. */
function downloadReceipt(order: OrderDetail, restaurantName: string, isPickup: boolean, isDelivery: boolean, mapUrl: string | null) {
  const { headline, subtext } = getStatusMessage(order.status);
  const hero = HERO_ICON[order.status] ?? { icon: <FaCircleCheck size={26} />, bg: "#22c55e" };
  const heroColor = ["CANCELLED", "REFUNDED"].includes(order.status) || !HERO_ICON[order.status] ? "#fff" : "#111";

  const itemRows = order.items
    .map(
      (i) =>
        `<tr><td>${i.quantity} x ${escapeHtml(i.nameSnapshot)}${i.specialInstructions ? `<br/><span class="muted" style="font-style:italic">"${escapeHtml(i.specialInstructions)}"</span>` : ""}</td><td style="text-align:right">${formatPaisa(i.lineTotal)}</td></tr>`,
    )
    .join("");

  const instructionsBlock =
    order.specialInstructions || order.changeRequestAmount != null
      ? `<div class="section">
          <p class="card-heading">${iconHtml(<FaClipboardList size={13} />)} Instructions</p>
          ${order.specialInstructions ? row("Delivery Instructions", escapeHtml(order.specialInstructions)) : ""}
          ${order.changeRequestAmount != null ? row("Cash Change Requested", formatPaisa(order.changeRequestAmount)) : ""}
        </div>`
      : "";

  const orderInfoRows = [
    order.contactName ? row("Customer", escapeHtml(order.contactName)) : "",
    isDelivery && order.deliveryAddressSnapshot
      ? row("Delivery Address", escapeHtml(`${order.deliveryAddressSnapshot}${order.deliveryArea ? `, ${order.deliveryArea}` : ""}`))
      : "",
    row("Order Type", escapeHtml(order.type.replace(/_/g, " "))),
    row("Date", new Date(order.createdAt).toLocaleString()),
  ]
    .filter(Boolean)
    .join("");

  const pickupBlock = isPickup
    ? `<div class="section">
        <p class="muted">You have to collect your order from:</p>
        <p class="bold" style="margin:2px 0">${escapeHtml(order.branch.name)}</p>
        ${order.branch.address ? `<p class="muted">Location: ${escapeHtml(order.branch.address)}</p>` : ""}
        ${mapUrl ? `<p><a href="${mapUrl}" style="color:#ED2320">${iconHtml(<FaLocationDot size={12} />)} View Location</a></p>` : ""}
        ${order.branch.phone ? `<p class="muted">${iconHtml(<FaPhone size={11} />)} Phone: ${escapeHtml(order.branch.phone)}</p>` : ""}
      </div>`
    : "";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${order.orderNumber}</title>
<style>
  body { font-family: sans-serif; max-width: 440px; margin: 24px auto; font-size: 14px; color: #111; padding: 0 16px; }
  .brand { text-align: center; font-size: 20px; font-weight: 700; color: #ED2320; }
  .hero { text-align: center; margin: 20px 0; }
  .hero .circle { width: 64px; height: 64px; border-radius: 999px; display: flex; align-items: center; justify-content: center; margin: 0 auto; background: ${hero.bg}; color: ${heroColor}; }
  .card-heading svg, .hero .circle svg { vertical-align: -2px; }
  .hero h1 { font-size: 20px; margin: 10px 0 2px; }
  .hero p { color: #666; font-size: 13px; margin: 0; }
  .card { border: 1px solid #eee; border-radius: 12px; padding: 16px; margin-top: 14px; }
  .card-heading { font-weight: 700; margin: 0 0 8px; }
  .section { margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; }
  .row { display: flex; justify-content: space-between; margin: 3px 0; }
  .bold { font-weight: 700; }
  .muted { color: #777; font-size: 12px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #f2efe9; }
  footer { text-align: center; color: #777; font-size: 12px; margin-top: 20px; }
</style>
</head>
<body>
  <p class="brand">${escapeHtml(restaurantName)}</p>

  <div class="hero">
    <div class="circle">${iconHtml(hero.icon)}</div>
    <h1>${escapeHtml(headline)}</h1>
    <p>${escapeHtml(subtext)}</p>
  </div>

  <div class="card">
    <div class="row"><span class="bold">Your Order is</span><span class="badge">${escapeHtml(order.status.replace(/_/g, " "))}</span></div>
    <p class="muted">Order No: <span class="bold" style="color:#111">${escapeHtml(order.orderNumber)}</span></p>
    ${pickupBlock}
  </div>

  <div class="card">
    <p class="card-heading">${iconHtml(<FaClipboardList size={13} />)} Order Information</p>
    ${orderInfoRows}

    <div class="section">
      <p class="card-heading">${iconHtml(<FaBowlFood size={13} />)} Items</p>
      <table>${itemRows}</table>
    </div>

    ${instructionsBlock}

    <div class="section">
      <p class="card-heading">${iconHtml(<FaFileInvoiceDollar size={13} />)} Payment Details</p>
      <div class="row"><span class="muted">Payment Method</span><span class="bold">${escapeHtml(PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod)}</span></div>
      <div class="row"><span class="muted">Payment Status</span><span class="badge">${escapeHtml(order.paymentStatus)}</span></div>
      ${row("Subtotal", formatPaisa(order.subtotal))}
      ${row("Tax", formatPaisa(order.taxAmount))}
      ${row("Delivery Fee", formatPaisa(order.deliveryFee))}
      ${order.loyaltyDiscountAmount > 0 ? row("Loyalty Discount", `-${formatPaisa(order.loyaltyDiscountAmount)}`) : ""}
      <div class="row bold" style="border-top:1px solid #eee;padding-top:6px;margin-top:6px"><span>Grand Total</span><span>${formatPaisa(order.grandTotal)}</span></div>
    </div>
  </div>

  <footer>Thank you for ordering from ${escapeHtml(restaurantName)}!</footer>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `receipt-${order.orderNumber}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function row(label: string, value: string): string {
  return `<div class="row"><span class="muted">${label}</span><span style="color:#111">${value}</span></div>`;
}

export default function OrderConfirmationPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = use(params);
  const customer = useAuthStore((s) => s.customer);
  const openAuthModal = useAuthModalStore((s) => s.open);
  const confettiFired = useRef(false);
  const [pushState, setPushState] = useState<PushSubscribeResult | "idle" | "loading">("idle");

  async function enableNotifications() {
    setPushState("loading");
    const result = await subscribeToOrderPush(orderNumber);
    setPushState(result);
  }

  const { data: restaurant } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
  });

  const {
    data: order,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ["order", orderNumber, !!customer],
    queryFn: () =>
      customer ? api.get<OrderDetail>(`/orders/${orderNumber}`) : api.public.get<OrderDetail>(`/orders/guest/${orderNumber}`),
    retry: false,
    refetchInterval: 15000,
  });
  useRealtimeOrder(orderNumber);

  const restaurantName = restaurant?.name ?? "our restaurant";

  useEffect(() => {
    // Only the two "happy ending" states get a celebration — not every poll while the order is
    // still being cooked or is on its way, which would make the confetti feel random/spammy.
    if (!order || confettiFired.current) return;
    if (!["PENDING", "CONFIRMED", "DELIVERED", "COMPLETED"].includes(order.status)) return;
    confettiFired.current = true;
    const colors = ["#ED2320", "#f7c948", "#22c55e", "#3b82f6"];
    confetti({ particleCount: 90, spread: 75, startVelocity: 40, origin: { y: 0.35 }, colors, zIndex: 60 });
  }, [order]);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <div className="text-center">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <Skeleton className="mx-auto mt-3 h-6 w-40 rounded-md" />
          <Skeleton className="mx-auto mt-2 h-4 w-56 rounded-md" />
        </div>
        <div className="mt-6 rounded-xl border border-line p-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </div>
            <div className="space-y-1.5 text-right">
              <Skeleton className="ml-auto h-4 w-24 rounded-md" />
              <Skeleton className="ml-auto h-3 w-28 rounded-md" />
            </div>
          </div>
          <div className="mt-3 space-y-2 border-b border-line pb-3">
            <SkeletonText lines={3} />
          </div>
          <div className="mt-3 space-y-2">
            <SkeletonText lines={4} />
          </div>
        </div>
      </main>
    );
  }

  if (!order) {
    // Not logged in, and the guest lookup 404'd — this could be a real "no such order" or it
    // could belong to a registered account the viewer just isn't signed into (e.g. they clicked
    // the status link from their confirmation email on a different browser/device).
    const code = queryError instanceof ApiError ? queryError.code : undefined;
    const status = queryError instanceof ApiError ? queryError.status : undefined;
    const isExpired = code === "ORDER_ACCESS_EXPIRED";
    const isNotFound = code === "ORDER_NOT_FOUND" || status === 404;
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center text-4xl text-muted">
          {isExpired ? <HourglassIcon size={44} /> : <SearchIcon size={44} />}
        </div>
        <h1 className="mt-3 text-xl font-semibold text-ink">{isExpired ? "This tracking link has expired" : "We couldn't find this order"}</h1>
        {isExpired ? (
          <p className="mt-2 text-sm text-muted">
            This order is already complete, so its tracking page is no longer available. If you need a copy of your receipt, please contact
            the restaurant.
          </p>
        ) : !customer && isNotFound ? (
          <>
            <p className="mt-2 text-sm text-muted">If you placed this order while signed in, please log in to view its status.</p>
            <button
              onClick={() => openAuthModal("login", `/order-confirmation/${orderNumber}`)}
              className="mt-5 rounded-full bg-brand-red px-6 py-3 text-sm font-semibold text-white"
            >
              Log In
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">This order may no longer exist, or the link is incorrect.</p>
        )}
        <Link href="/" className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-brand-red">
          <ArrowLeftIcon size={12} /> Back to Home
        </Link>
      </main>
    );
  }

  const isPickup = PICKUP_TYPES.has(order.type);
  const isDelivery = DELIVERY_TYPES.has(order.type);
  const mapUrl = isPickup ? branchMapUrl(order.branch) : null;
  const { headline, subtext } = getStatusMessage(order.status);

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      {restaurant?.logoUrl ? (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={restaurant.logoUrl} alt={restaurantName} className="h-14 w-auto object-contain" />
        </div>
      ) : (
        <p className="text-center font-display text-2xl text-brand-red">{restaurantName}</p>
      )}

      <div className="mt-6 text-center">
        <OrderHeroIcon status={order.status} />
        <h1 className="mt-4 text-2xl font-semibold text-ink">{headline}</h1>
        <p className="mt-1 text-sm text-muted">{subtext}</p>
      </div>

      <div id="receipt" className="mt-6 space-y-4 text-left text-sm">
        <div className="rounded-xl border border-line p-5">
          <div className="flex items-center justify-between">
            <p className="font-medium text-ink">Your Order is</p>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-3 text-muted">
            Order No: <span className="font-semibold text-ink">{order.orderNumber}</span>
          </p>

          {isPickup && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-muted">You have to collect your order from:</p>
              <p className="mt-1 font-semibold text-ink">{order.branch.name}</p>
              {order.branch.address && (
                <p className="mt-1 text-muted">
                  <span className="font-medium text-ink">Location:</span> {order.branch.address}
                </p>
              )}
              {mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1.5 font-medium text-brand-red"
                >
                  <FaLocationDot size={14} /> View Location
                </a>
              )}
              {order.branch.phone && (
                <p className="mt-1 flex items-center gap-1.5 text-muted">
                  <FaPhone size={12} />
                  <span className="font-medium text-ink">Phone:</span>{" "}
                  <a href={`tel:${order.branch.phone}`} className="text-brand-red">
                    {order.branch.phone}
                  </a>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line p-5">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <FaClipboardList className="text-brand-red" size={15} /> Order Information
          </p>
          <div className="mt-2 space-y-1.5">
            {order.contactName && <Row label="Customer" value={order.contactName} />}
            {isDelivery && order.deliveryAddressSnapshot && (
              <Row label="Delivery Address" value={`${order.deliveryAddressSnapshot}${order.deliveryArea ? `, ${order.deliveryArea}` : ""}`} />
            )}
            <Row label="Order Type" value={order.type.replace(/_/g, " ")} />
            <Row label="Date" value={new Date(order.createdAt).toLocaleString()} />
            {order.estimatedDeliveryAt && (
              <Row label="Estimated Delivery" value={new Date(order.estimatedDeliveryAt).toLocaleTimeString()} />
            )}
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <FaBowlFood className="text-brand-red" size={15} /> Items
            </p>
            <div className="mt-2 space-y-1">
              {order.items.map((item) => (
                <div key={item.id} className="text-muted">
                  <div className="flex justify-between">
                    <span>
                      {item.quantity} x {item.nameSnapshot}
                    </span>
                    <span className="text-ink">{formatPaisa(item.lineTotal)}</span>
                  </div>
                  {item.specialInstructions && <p className="mt-0.5 text-xs italic text-muted">"{item.specialInstructions}"</p>}
                </div>
              ))}
            </div>
          </div>

          {(order.specialInstructions || order.changeRequestAmount) && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <FaClipboardList className="text-brand-red" size={15} /> Instructions
              </p>
              <div className="mt-2 space-y-1.5">
                {order.specialInstructions && <Row label="Delivery Instructions" value={order.specialInstructions} />}
                {order.changeRequestAmount != null && <Row label="Cash Change Requested" value={formatPaisa(order.changeRequestAmount)} />}
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-line pt-3">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <FaFileInvoiceDollar className="text-brand-red" size={15} /> Payment Details
            </p>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted">Payment Method</span>
                <span className="font-medium text-ink">{PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Payment Status</span>
                <PaymentStatusBadge status={order.paymentStatus} />
              </div>
              <Row label="Subtotal" value={formatPaisa(order.subtotal)} />
              <Row label="Tax" value={formatPaisa(order.taxAmount)} />
              <Row label="Delivery Fee" value={formatPaisa(order.deliveryFee)} />
              {order.loyaltyDiscountAmount > 0 && <Row label="Loyalty Discount" value={`-${formatPaisa(order.loyaltyDiscountAmount)}`} />}
              <Row label="Grand Total" value={formatPaisa(order.grandTotal)} bold />
            </div>
          </div>
        </div>
      </div>

      <div data-no-print className="mt-6 space-y-3">
        {isPushSupported() && !["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status) && (
          <>
            {pushState === "subscribed" ? (
              <p className="flex items-center justify-center gap-2 rounded-full bg-green-50 py-2.5 text-center text-sm font-medium text-green-700">
                <FaBell size={14} /> Notifications enabled for this order
              </p>
            ) : pushState === "denied" ? (
              <p className="text-center text-xs text-muted">Notifications are blocked for this site. Enable them in your browser settings to get order updates.</p>
            ) : pushState !== "not-configured" && pushState !== "error" ? (
              <button
                onClick={enableNotifications}
                disabled={pushState === "loading"}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold text-ink disabled:opacity-50"
              >
                <FaBell size={14} /> {pushState === "loading" ? "Enabling..." : "Get Order Updates"}
              </button>
            ) : null}
          </>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold text-ink"
          >
            <FaPrint size={14} /> Print
          </button>
          <button
            onClick={() => downloadReceipt(order, restaurantName, isPickup, isDelivery, mapUrl)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold text-ink"
          >
            <FaDownload size={14} /> Download
          </button>
        </div>
        {customer && (
          <Link href="/account/orders" className="block text-center text-sm font-medium text-brand-red">
            Track Your Orders
          </Link>
        )}
        <Link
          href="/"
          className="flex items-center justify-center gap-2 rounded-full bg-brand-red py-3.5 text-center text-sm font-semibold text-white"
        >
          <FaUtensils size={15} /> Browse Menu
        </Link>
      </div>
    </main>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-ink" : "text-muted"}`}>
      <span>{label}</span>
      <span className={bold ? "" : "text-ink"}>{value}</span>
    </div>
  );
}
