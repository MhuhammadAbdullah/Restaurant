import { GiCookingPot } from "react-icons/gi";
import { FaCircleCheck, FaBoxOpen, FaCircleXmark, FaStar } from "react-icons/fa6";
import { MdDeliveryDining } from "react-icons/md";

export const STATUS_META: Record<string, { label: string; badge: string }> = {
  PENDING: { label: "Order Received", badge: "bg-amber-400 text-amber-950" },
  CONFIRMED: { label: "Order Accepted", badge: "bg-amber-500 text-white" },
  PREPARING: { label: "Order Preparation", badge: "bg-orange-400 text-orange-950" },
  READY: { label: "Ready", badge: "bg-blue-400 text-blue-950" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", badge: "bg-purple-400 text-purple-950" },
  DELIVERED: { label: "Delivered", badge: "bg-green-500 text-white" },
  COMPLETED: { label: "Completed", badge: "bg-green-500 text-white" },
  CANCELLED: { label: "Cancelled", badge: "bg-red-500 text-white" },
  REFUNDED: { label: "Refunded", badge: "bg-red-500 text-white" },
};

const LIVE_STATUSES = new Set(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"]);

export function OrderStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status.replace(/_/g, " "), badge: "bg-surface-alt text-ink" };
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${meta.badge}`}>{meta.label}</span>
      {LIVE_STATUSES.has(status) && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />}
    </span>
  );
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  COD: "Cash on Delivery",
  ONLINE: "Online Payment",
  CASH: "Cash",
  CARD: "Card",
  QR: "QR Payment",
};

const PAYMENT_STATUS_META: Record<string, { label: string; badge: string }> = {
  PENDING: { label: "Pending", badge: "bg-amber-100 text-amber-800" },
  PARTIALLY_PAID: { label: "Partially Paid", badge: "bg-amber-100 text-amber-800" },
  PAID: { label: "Paid", badge: "bg-green-100 text-green-700" },
  FAILED: { label: "Failed", badge: "bg-red-100 text-red-700" },
  REFUNDED: { label: "Refunded", badge: "bg-red-100 text-red-700" },
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const meta = PAYMENT_STATUS_META[status] ?? { label: status.replace(/_/g, " "), badge: "bg-surface-alt text-ink" };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}>{meta.label}</span>;
}

/** Headline + supporting line shown under the hero icon, tailored to exactly what's happening right now. */
export function getStatusMessage(status: string): { headline: string; subtext: string } {
  switch (status) {
    case "PENDING":
      return { headline: "Thank You!", subtext: "Your order has been received and is waiting for the restaurant to accept it." };
    case "CONFIRMED":
      return { headline: "Order Accepted!", subtext: "The restaurant has accepted your order and will start preparing it shortly." };
    case "PREPARING":
      return { headline: "Preparing Your Order", subtext: "Our kitchen is cooking up your order right now." };
    case "READY":
      return { headline: "Order Ready!", subtext: "Your order is packed and ready to go." };
    case "OUT_FOR_DELIVERY":
      return { headline: "On The Way!", subtext: "Your rider is heading to you now." };
    case "DELIVERED":
      return { headline: "Delivered!", subtext: "Enjoy your meal, and thank you for ordering!" };
    case "COMPLETED":
      return { headline: "Order Completed", subtext: "Thank you for ordering with us!" };
    case "CANCELLED":
      return { headline: "Order Cancelled", subtext: "This order has been cancelled." };
    case "REFUNDED":
      return { headline: "Order Refunded", subtext: "This order has been refunded." };
    default:
      return { headline: "Order Update", subtext: "" };
  }
}

/**
 * The big hero icon at the top of the confirmation page — swaps to match exactly what's
 * happening to the order right now instead of always showing a static checkmark: cooking while
 * PREPARING, a ready-to-collect packet once READY, a rider while OUT_FOR_DELIVERY, and back to a
 * checkmark only once it's actually DELIVERED (or freshly placed/received).
 */
export function OrderHeroIcon({ status }: { status: string }) {
  if (status === "PREPARING") {
    return (
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
        <div className="relative">
          <span className="absolute -top-2.5 left-1 h-2 w-1 animate-steam rounded-full bg-orange-400" />
          <span className="absolute -top-2.5 left-3.5 h-2 w-1 animate-steam rounded-full bg-orange-400" style={{ animationDelay: "0.3s" }} />
          <span className="absolute -top-2.5 left-6 h-2 w-1 animate-steam rounded-full bg-orange-400" style={{ animationDelay: "0.6s" }} />
          <GiCookingPot className="animate-pot-jiggle text-4xl text-orange-500" />
        </div>
      </div>
    );
  }

  if (status === "READY") {
    return (
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
        <div className="relative">
          <FaStar className="animate-sparkle absolute -top-2 -left-2 text-xs text-blue-400" />
          <FaStar className="animate-sparkle absolute -top-1 -right-2 text-xs text-blue-400" style={{ animationDelay: "0.5s" }} />
          <FaBoxOpen className="animate-packet-bounce text-4xl text-blue-600" />
        </div>
      </div>
    );
  }

  if (status === "OUT_FOR_DELIVERY") {
    return (
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-purple-100">
        <MdDeliveryDining className="animate-ride text-5xl text-purple-600" />
      </div>
    );
  }

  if (status === "CANCELLED" || status === "REFUNDED") {
    return (
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500">
        <FaCircleXmark className="text-5xl text-white" />
      </div>
    );
  }

  // PENDING / CONFIRMED / DELIVERED / COMPLETED (and any unrecognised future status) — the
  // checkmark represents both "order received" and "order complete", the two happy endpoints.
  return (
    <div className="animate-pop-in mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-500">
      <FaCircleCheck className="text-5xl text-white" />
    </div>
  );
}
