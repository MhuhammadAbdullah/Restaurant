"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPaisa } from "@restaurant/utils";
import { useCartStore } from "../store/useCartStore";
import { useLocationStore } from "../store/useLocationStore";
import { useCartDrawerStore } from "../store/useCartDrawerStore";
import { cartItemLineTotal, type CartItem } from "../lib/types";
import { CloseIcon, PlusIcon, CalculatorIcon, DollarIcon, TruckIcon } from "./icons";
import { QtyStepper } from "./QtyStepper";
import { CartRecommendations } from "./CartRecommendations";

// Same cart glyph used in the header/scroll FAB — it's a white silhouette, so it needs a solid
// (brand red) circle behind it rather than the light circle a generic icon would sit on.
const CART_ICON_URL =
  "https://res.cloudinary.com/dgkd8jw6a/image/upload/v1786624174/Gemini_Generated_Image_lrzw3wlrzw3wlrzw-removebg-preview_sdff6k.png";

export function CartDrawer() {
  const isOpen = useCartDrawerStore((s) => s.isOpen);
  const close = useCartDrawerStore((s) => s.close);
  const { items, updateQuantity, removeItem } = useCartStore();
  const { branch, orderType, isBranchOpen } = useLocationStore();
  const router = useRouter();

  const subtotal = items.reduce((s, i) => s + cartItemLineTotal(i), 0);
  const deliveryFee = orderType === "DELIVERY" ? (branch?.deliveryFee ?? 0) : 0;
  const estimatedTax = Math.round(subtotal * 0.15);
  const estimatedTotal = subtotal + deliveryFee + estimatedTax;

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
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-surface text-ink shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        <div className="flex items-center justify-between bg-brand-red p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CART_ICON_URL} alt="" className="h-5 w-5 object-contain" />
            Your Cart
          </h2>
          <button onClick={close} aria-label="Close cart" className="text-white">
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

              <CartRecommendations items={items} />
            </div>

            <div className="border-t border-line p-4">
              <div className="space-y-2.5 rounded-xl border border-line p-4 text-sm">
                <Row icon={CalculatorIcon} label="Total" value={formatPaisa(subtotal)} />
                <Row icon={DollarIcon} label="Tax (15%)" value={formatPaisa(estimatedTax)} />
                {orderType === "DELIVERY" && <Row icon={TruckIcon} label="Delivery Fee" value={formatPaisa(deliveryFee)} />}
                <div className="border-t pt-2.5">
                  <Row label="Grand Total" value={formatPaisa(estimatedTotal)} bold />
                </div>
              </div>

              {branch && (
                <p className="mt-3 text-center text-xs text-muted">
                  Your order will be delivered in approximately {branch.estimatedDeliveryMins} minutes from {branch.name}.
                </p>
              )}

              {!isBranchOpen && (
                <p className="mt-3 text-center text-xs font-medium text-amber-700">
                  {branch?.name} is currently closed, so checkout is unavailable until it reopens.
                </p>
              )}

              <button
                onClick={goToCheckout}
                disabled={!isBranchOpen}
                className="mt-4 w-full rounded-full bg-brand-red py-3.5 font-semibold text-white disabled:opacity-50"
              >
                {isBranchOpen ? "Proceed to Checkout" : "Branch Closed"}
              </button>
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
    <div className={`flex items-center justify-between ${bold ? "font-semibold text-ink" : "text-muted"}`}>
      <span className="flex items-center gap-2">
        {Icon && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-red/10 text-brand-red">
            <Icon size={12} />
          </span>
        )}
        {label}
      </span>
      <span className={bold ? "text-brand-red" : ""}>{value}</span>
    </div>
  );
}

function CartLine({
  item,
  onRemove,
  onIncrement,
  onDecrement,
}: {
  item: CartItem;
  onRemove: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-line p-3">
      {item.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.name} className="h-16 w-16 rounded-lg object-cover" />
      )}
      <div className="flex-1">
        <p className="text-sm font-medium text-ink">{item.name}</p>
        {item.kind === "product" ? (
          <>
            {item.choices.length > 0 && <p className="text-xs text-muted">{item.choices.map((c) => c.name).join(", ")}</p>}
            {item.addons.length > 0 && (
              <p className="text-xs text-muted">{item.addons.map((a) => `${a.name} x${a.quantity}`).join(", ")}</p>
            )}
          </>
        ) : (
          <div className="text-xs text-muted">
            {item.slots.map((s) => (
              <p key={s.dealSlotId}>
                <strong>{s.slotLabel}:</strong> {s.productName}
                {s.choices.length > 0 && ` (${s.choices.map((c) => c.name).join(", ")})`}
              </p>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <QtyStepper quantity={item.quantity} itemName={item.name} onIncrement={onIncrement} onDecrement={onDecrement} onRemove={onRemove} />
          <span className="text-sm font-semibold text-brand-red">
            {formatPaisa(item.kind === "product" ? item.unitPrice * item.quantity : item.dealPrice * item.quantity)}
          </span>
        </div>
      </div>
    </div>
  );
}
