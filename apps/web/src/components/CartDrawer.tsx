"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPaisa } from "@restaurant/utils";
import { useCartStore } from "../store/useCartStore";
import { useLocationStore } from "../store/useLocationStore";
import { useBranchOpenStatus } from "../lib/useBranchOpenStatus";
import { useCartDrawerStore } from "../store/useCartDrawerStore";
import { cartItemLineTotal, type CartItem } from "../lib/types";
import { CloseIcon, PlusIcon, CalculatorIcon, DollarIcon, TruckIcon } from "./icons";
import { QtyStepper } from "./QtyStepper";
import { CartRecommendations } from "./CartRecommendations";
import { FreeDeliveryBanner } from "./FreeDeliveryBanner";
import { OPTION_OUT_CART_MESSAGE, SOLD_OUT_CART_MESSAGE, SOLD_OUT_INACTIVE_MESSAGE, useCartAvailability, type CartIssue } from "../lib/outOfStock";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useEffect, useState } from "react";

const CART_ICON_URL = "https://res.cloudinary.com/dgkd8jw6a/image/upload/v1786624174/Gemini_Generated_Image_lrzw3wlrzw3wlrzw-removebg-preview_sdff6k.png";

function ordinalDate(date: Date) {
  const day = Number(date.toLocaleDateString("en-US", { timeZone: "Asia/Karachi", day: "numeric" }));
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  const month = date.toLocaleDateString("en-US", { timeZone: "Asia/Karachi", month: "long" });
  const year = date.toLocaleDateString("en-US", { timeZone: "Asia/Karachi", year: "numeric" });
  return `${month} ${day}${suffix}, ${year}`;
}

export function CartDrawer() {
  const isOpen = useCartDrawerStore((s) => s.isOpen);
  const close = useCartDrawerStore((s) => s.close);
  const { items, updateQuantity, removeItem } = useCartStore();
  const { branch, orderType } = useLocationStore();
  const isBranchOpen = useBranchOpenStatus();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.public.get<{ checkout?: { freeDeliveryMinimum?: number; showCartRecommendations?: boolean } }>("/cms/restaurant") });
  useEffect(() => setCurrentTime(Date.now()), []);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [isOpen]);

  const { reasonFor, hasUnavailable } = useCartAvailability();

  // Sold-out lines stay visible (so the customer can remove them) but are not charged for.
  const subtotal = items.reduce((s, i) => (reasonFor(i) ? s : s + cartItemLineTotal(i)), 0);
  const freeMinimum = (restaurant?.checkout?.freeDeliveryMinimum ?? 0) * 100;
  const freeDelivery = orderType === "DELIVERY" && freeMinimum > 0 && subtotal >= freeMinimum;
  const deliveryFee = orderType === "DELIVERY" && !freeDelivery ? (branch?.deliveryFee ?? 0) : 0;
  const estimatedTax = Math.round(subtotal * 0.15);
  const estimatedTotal = subtotal + deliveryFee + estimatedTax;
  const etaMinutes = orderType === "DELIVERY" ? branch?.estimatedDeliveryMins ?? 0 : branch?.estimatedPickupMins ?? 0;
  const eta = currentTime !== null && etaMinutes > 0 ? new Date(currentTime + etaMinutes * 60_000) : null;

  function goToCheckout() {
    close();
    router.push("/checkout");
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={close}
        aria-hidden="true"
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-hidden bg-surface text-ink shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        <div className="flex items-center justify-between bg-brand-red px-5 py-4">
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CART_ICON_URL} alt="" className="h-5 w-5 object-contain" />
            Your Cart
          </h2>
          <button onClick={close} aria-label="Close cart" className="rounded-full p-2 text-white transition hover:bg-white/15">
            <CloseIcon size={20} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-6 text-center">
            <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-brand-red shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={CART_ICON_URL} alt="" className="h-10 w-10 object-contain" />
            </div>
            <p className="text-lg font-semibold text-ink">Your cart is empty</p>
            <p className="max-w-[220px] text-sm text-muted">Looks like you haven&apos;t added anything to your cart yet</p>
            <Link
              href="/"
              onClick={close}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-brand-red px-6 py-3 text-sm font-semibold text-white"
            >
              Browse Menu
            </Link>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {items.map((item) => (
                  <CartLine
                    key={item.cartItemId}
                    item={item}
                    unavailable={reasonFor(item)}
                    onRemove={() => removeItem(item.cartItemId)}
                    onIncrement={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                    onDecrement={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                  />
                ))}
              </div>
              <Link
                href="/"
                onClick={close}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-brand-red/40 py-3 text-sm font-semibold text-brand-red transition hover:border-brand-red/70 hover:bg-brand-red/5"
              >
                <PlusIcon size={13} />
                Add more items
              </Link>

              {orderType === "DELIVERY" && <FreeDeliveryBanner subtotal={subtotal} minimum={freeMinimum} onAddMore={close} className="mt-4" />}
              {restaurant?.checkout?.showCartRecommendations !== false && <CartRecommendations items={items} />}

            <div className="mt-4 border-t border-line pt-4">
              <div className="space-y-2.5 rounded-xl border border-line p-4 text-sm">
                <Row icon={CalculatorIcon} label="Total" value={formatPaisa(subtotal)} />
                <Row icon={DollarIcon} label="Tax (15%)" value={formatPaisa(estimatedTax)} />
                {orderType === "DELIVERY" && <Row icon={TruckIcon} label="Delivery Fee" value={freeDelivery ? "FREE" : formatPaisa(deliveryFee)} />}
                <div className="border-t pt-2.5">
                  <Row label="Grand Total" value={formatPaisa(estimatedTotal)} bold />
                </div>
              </div>

              {hasUnavailable && (
                <p className="mt-3 rounded-lg bg-brand-red/10 px-3 py-2 text-center text-xs font-medium text-brand-red">
                  Some items just sold out. Remove them to continue to checkout.
                </p>
              )}

              {!isBranchOpen && (
                <p className="mt-3 text-center text-xs font-medium text-amber-700 dark:text-amber-300">
                  {branch?.name} is currently closed, so checkout is unavailable until it reopens.
                </p>
              )}

              <button
                onClick={goToCheckout}
                disabled={!isBranchOpen || hasUnavailable}
                className="mt-4 w-full rounded-xl bg-brand-red py-3.5 font-semibold text-white disabled:opacity-50"
              >
                {!isBranchOpen ? "Branch Closed" : hasUnavailable ? "Remove sold-out items" : "Proceed to Checkout"}
              </button>
              {eta && <div className="mt-4 text-center text-sm text-muted"><p>Your order will be {orderType === "DELIVERY" ? "delivered" : "ready for pickup"} approximately in {etaMinutes} minutes on</p><div className="mt-2 flex flex-wrap items-center justify-center gap-2 font-semibold text-ink"><span className="rounded-xl bg-surface-alt px-3 py-2">{ordinalDate(eta)}</span><span className="text-muted">at</span><span className="rounded-xl bg-surface-alt px-3 py-2 text-ink">{eta.toLocaleTimeString("en-US", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" })}</span></div></div>}
            </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function Row({
  label,
  value,
  bold,
  icon: Icon,
}: {
  label: string;
  value: string;
  bold?: boolean;
  icon?: (props: { size?: number; className?: string }) => React.ReactElement;
}) {
  return (
    <div className={`flex items-center justify-between ${bold ? "text-base font-bold text-ink" : "font-medium text-ink"}`}>
      <span className="flex items-center gap-2">
        {Icon && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-alt text-muted">
            <Icon size={12} />
          </span>
        )}
        {label}
      </span>
      <span className={bold ? "text-ink" : "font-medium text-ink"}>{value}</span>
    </div>
  );
}

function CartLine({
  item,
  unavailable,
  onRemove,
  onIncrement,
  onDecrement,
}: {
  item: CartItem;
  unavailable: CartIssue | null;
  onRemove: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const soldOut = unavailable !== null;
  return (
    <div className={`flex min-h-[96px] items-center gap-3 rounded-2xl border px-3 py-2.5 ${soldOut ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" : "border-line bg-surface"}`}>
      {item.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.name} className={`h-[72px] w-[72px] shrink-0 rounded-2xl border border-neutral-200 object-cover ${soldOut ? "opacity-40 grayscale" : ""}`} />
      )}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`truncate text-[15px] font-semibold ${soldOut ? "text-muted" : "text-ink"}`}>{item.name}</p>
            {soldOut && <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">{unavailable === "OPTION_OUT" ? "Not available" : "Sold out"}</span>}
          </div>
          <p className={`mt-1 text-sm font-bold ${soldOut ? "text-muted line-through" : "text-ink"}`}>
            {formatPaisa(item.kind === "product" ? item.unitPrice * item.quantity : item.dealPrice * item.quantity)}
          </p>
          {soldOut && <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">{unavailable === "INACTIVE" ? SOLD_OUT_INACTIVE_MESSAGE : unavailable === "OPTION_OUT" ? OPTION_OUT_CART_MESSAGE : SOLD_OUT_CART_MESSAGE}</p>}
          {item.kind === "product" ? (
            <>
              {item.choices.length > 0 && <p className="text-xs text-muted">{item.choices.map((c) => c.name).join(", ")}</p>}
              {item.addons.length > 0 && <p className="text-xs text-muted">{item.addons.map((a) => `${a.name} x${a.quantity}`).join(", ")}</p>}
            </>
          ) : (
            <div className="text-xs text-muted">
              {item.slots.map((s) => (
                <p key={s.dealSlotId}><strong>{s.slotLabel}:</strong> {s.productName}{s.choices.length > 0 && ` (${s.choices.map((c) => c.name).join(", ")})`}</p>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0">
          {soldOut ? (
            <button onClick={onRemove} className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-alt">Remove</button>
          ) : (
            <QtyStepper quantity={item.quantity} itemName={item.name} onIncrement={onIncrement} onDecrement={onDecrement} onRemove={onRemove} tone="neutral" />
          )}
        </div>
      </div>
    </div>
  );
}
