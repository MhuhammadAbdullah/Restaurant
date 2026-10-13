"use client";

import { LoadingDots } from "../../components/LoadingDots";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { useAuthModalStore } from "../../store/useAuthModalStore";
import { useCartStore } from "../../store/useCartStore";
import { useLocationStore } from "../../store/useLocationStore";
import { OPTION_OUT_CART_MESSAGE, SOLD_OUT_CART_MESSAGE, SOLD_OUT_INACTIVE_MESSAGE, useCartAvailability } from "../../lib/outOfStock";
import type { CartDealItem, CartProductItem } from "../../lib/types";
import { FaCheck, FaFileInvoiceDollar, FaHandHoldingDollar, FaTag } from "react-icons/fa6";
import { FiShoppingBag } from "react-icons/fi";
import { ArrowLeftIcon, CalculatorIcon, ChevronDownIcon, GiftIcon, PinIcon, TruckIcon } from "../../components/icons";
import { Skeleton } from "../../components/skeletons";

const DELIVERY_BIKE_ICON_URL = "https://res.cloudinary.com/dgkd8jw6a/image/upload/v1791459488/Delivery-Bike_l7f4t9.webp";
const CASH_ICON_URL = "https://res.cloudinary.com/dgkd8jw6a/image/upload/v1791460707/cash-icon_pirfsz.webp";
const CARDS_ICON_URL = "https://res.cloudinary.com/dgkd8jw6a/image/upload/v1791460716/cards-icon_bi1doe.webp";
const PICKUP_BAG_ICON_URL = "https://res.cloudinary.com/dgkd8jw6a/image/upload/v1791460268/pickup_jgclok.webp";
const PICKUP_TILE_ICON_URL = "https://res.cloudinary.com/dgkd8jw6a/image/upload/v1791460276/pickup-icon_auxxw7.webp";
import { toast } from "../../store/useToastStore";

type Address = { id: string; label: string; city: string; area: string; addressLine: string; isDefault: boolean };
type CustomerMe = { loyaltyPoints: number };
type RestaurantInfo = {
  loyalty?: { enabled: boolean };
  checkout?: {
    showCoupon?: boolean;
    showTip?: boolean;
    showGift?: boolean;
    tipPresets?: number[];
    defaultTip?: number;
    payments?: {
      cod?: { enabled?: boolean; label?: string; pickupLabel?: string; iconUrl?: string | null };
      online?: { enabled?: boolean; label?: string; iconUrl?: string | null };
    };
  };
};

const TITLES = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr."];

/** Backend expects strictly 03XXXXXXXXX — strip dashes/spaces/parens users naturally type. */
function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

/** Surfaces the specific field that failed Zod validation instead of the generic "Request validation failed". */
function describeApiError(e: ApiError): string {
  const fieldErrors = (e.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
  if (fieldErrors) {
    const first = Object.entries(fieldErrors).find(([, msgs]) => msgs.length > 0);
    if (first) return `${first[0]}: ${first[1][0]}`;
  }
  return e.message;
}

export default function CheckoutPage() {
  const router = useRouter();
  const customer = useAuthStore((s) => s.customer);
  const authHasHydrated = useAuthStore((s) => s.hasHydrated);
  const openAuthModal = useAuthModalStore((s) => s.open);
  const { items, clear, hasHydrated, removeItem } = useCartStore();
  const { reasonFor, hasUnavailable } = useCartAvailability();
  const { branch, orderType, city, area, isBranchOpen } = useLocationStore();

  useEffect(() => {
    // Warm up the order-confirmation route's JS bundle while the customer is still filling in
    // the form, so the redirect after placing the order doesn't stall on a cold compile — the
    // exact order number isn't known yet, but any value under the dynamic segment triggers the
    // same route module to load.
    router.prefetch("/order-confirmation/prefetch");
  }, [router]);

  const [title, setTitle] = useState(TITLES[0]!);
  const [addressId, setAddressId] = useState<string>("");
  const [guestAddress, setGuestAddress] = useState({ addressLine: "", landmark: "" });
  const [contactName, setContactName] = useState(customer?.name ?? "");
  const [contactPhone, setContactPhone] = useState(customer?.phone ?? "");
  const [contactAlternatePhone, setContactAlternatePhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [isGift, setIsGift] = useState(false);
  const giftRef = useRef<HTMLDivElement>(null);
  const [gift, setGift] = useState({ recipientName: "", recipientPhone: "", recipientAddress: "", recipientCity: "", recipientArea: "", message: "" });
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "ONLINE">("COD");
  const [showAllItems, setShowAllItems] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [changeRequest, setChangeRequest] = useState("");
  const [tip, setTip] = useState(""); // applied tip, in rupees
  const [tipDraft, setTipDraft] = useState(""); // custom amount being typed; only applied with the Add button
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Placing an order calls clear(), which drops items.length to 0 — without this flag, the
  // "cart is empty, bounce to home" effect below fires on that same re-render and races the
  // explicit redirect to the confirmation page, sending the customer home instead.
  const orderPlacedRef = useRef(false);

  const { data: addresses, isLoading: addressesLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.get<Address[]>("/customers/me/addresses"),
    enabled: !!customer,
  });
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<CustomerMe>("/auth/customer/me"),
    enabled: !!customer,
  });
  const { data: restaurantInfo } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
  });
  const loyaltyEnabled = restaurantInfo?.loyalty?.enabled ?? true;
  // Coupon / tip boxes and the tip amounts are set in Admin > Website > Checkout. Nothing is shown until the settings arrive.
  const showCoupon = restaurantInfo ? restaurantInfo.checkout?.showCoupon !== false : false;
  const showTip = restaurantInfo ? restaurantInfo.checkout?.showTip !== false : false;
  // The gift button is set in Admin > Website > Checkout. Nothing is shown until the settings arrive.
  const showGift = restaurantInfo ? restaurantInfo.checkout?.showGift !== false : false;
  const tipPresets = restaurantInfo?.checkout?.tipPresets ?? [100, 200, 500];
  const defaultTip = restaurantInfo?.checkout?.defaultTip ?? 0;
  // Payment methods (names, icons and on/off) are set in Admin > Website > Checkout.
  const pay = restaurantInfo?.checkout?.payments;
  const paymentOptions = [
    {
      key: "COD" as const,
      label: orderType === "DELIVERY" ? pay?.cod?.label || "Cash on Delivery" : pay?.cod?.pickupLabel || "Pay at Pickup",
      icon: pay?.cod?.iconUrl || CASH_ICON_URL,
      disabled: isGift,
      enabled: pay?.cod?.enabled !== false,
    },
    { key: "ONLINE" as const, label: pay?.online?.label || "Online Payment", icon: pay?.online?.iconUrl || CARDS_ICON_URL, disabled: false, enabled: pay?.online?.enabled !== false },
  ].filter((o) => o.enabled);
  const onlineEnabled = pay?.online?.enabled !== false;
  // Gifts are paid online. If that is switched off, say so instead of doing nothing; otherwise open the gift form right here.
  function toggleGift() {
    if (!isGift && !onlineEnabled) {
      toast.error("Gifts need Online Payment, which is switched off right now.");
      return;
    }
    setIsGift((g) => !g);
    if (!isGift) setTimeout(() => giftRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }
  useEffect(() => {
    // the chosen method may have been switched off: move to one that is available
    const usable = paymentOptions.find((o) => !o.disabled);
    if (restaurantInfo && usable && !paymentOptions.some((o) => o.key === paymentMethod && !o.disabled)) setPaymentMethod(usable.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantInfo, isGift, orderType, pay?.cod?.enabled, pay?.online?.enabled]);
  const defaultTipApplied = useRef(false);
  useEffect(() => {
    if (defaultTipApplied.current || !restaurantInfo) return;
    defaultTipApplied.current = true;
    if (showTip && defaultTip > 0) setTip(String(defaultTip));
  }, [restaurantInfo, showTip, defaultTip]);

  useEffect(() => {
    if (addresses && addresses.length > 0 && !addressId) {
      setAddressId(addresses.find((a) => a.isDefault)?.id ?? addresses[0]!.id);
    }
  }, [addresses, addressId]);

  useEffect(() => {
    if (isGift) setPaymentMethod("ONLINE");
  }, [isGift]);

  useEffect(() => {
    // Wait for the persisted cart to load before deciding it's "empty" — otherwise every
    // refresh reads the pre-hydration default ([]) and bounces the user back to the homepage.
    if (hasHydrated && items.length === 0 && !orderPlacedRef.current) {
      router.push("/");
    }
  }, [hasHydrated, items.length, router]);

  useEffect(() => {
    // Direct navigation (or a stale tab) could land here after the branch has closed —
    // the backend rejects the order anyway, but bounce back with a clear reason instead.
    if (hasHydrated && items.length > 0 && !isBranchOpen) {
      router.push("/");
    }
  }, [hasHydrated, items.length, isBranchOpen, router]);

  // Once the order is accepted the cart is cleared, which would otherwise collapse this page to
  // nothing until the next route (receipt / payment gateway) finishes loading. Cover that gap.
  if (orderPlaced) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-page">
        <span className="h-12 w-12 animate-spin rounded-full border-4 border-brand-red/20 border-t-brand-red" />
        <p className="text-base font-semibold text-ink">Order placed!</p>
        <p className="-mt-2 text-sm text-muted"><LoadingDots>Please wait a moment</LoadingDots></p>
      </div>
    );
  }

  // On a refresh the saved cart and login load a moment after the first paint. Returning nothing here made
  // the whole page collapse (the footer jumped up under the header); keep the page full height with a loader.
  if (!hasHydrated || !authHasHydrated || items.length === 0 || !isBranchOpen) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-red/20 border-t-brand-red" />
        <p className="text-sm text-muted"><LoadingDots>Loading your checkout</LoadingDots></p>
      </div>
    );
  }

  // Sold-out lines are shown (so they can be removed) but never charged.
  const subtotal = items.reduce((s, i) => (reasonFor(i) ? s : s + (i.kind === "product" ? i.unitPrice * i.quantity : i.dealPrice * i.quantity)), 0);
  const estimatedTax = Math.round(subtotal * 0.15);
  const deliveryFee = orderType === "DELIVERY" ? (branch?.deliveryFee ?? 0) : 0;
  const couponDiscount = appliedCoupon?.discountAmount ?? 0;
  // Bills are settled in whole rupees, same as the server.
  const estimatedGrandTotal = Math.round(Math.max(0, subtotal + estimatedTax + deliveryFee - couponDiscount) / 100) * 100;
  // Optional tip, on top of the bill. For delivery it goes to the rider.
  const tipPaisa = tip.trim() && Number(tip) > 0 ? Math.min(Math.round(Number(tip) * 100), 10_000_000) : 0;

  function buildOrderItems() {
    return items.map((item) =>
      item.kind === "product"
        ? {
            kind: "product" as const,
            productId: (item as CartProductItem).productId,
            quantity: item.quantity,
            choices: (item as CartProductItem).choices.map((c) => ({ choiceGroupId: c.choiceGroupId, choiceOptionId: c.choiceOptionId })),
            addons: (item as CartProductItem).addons.map((a) => ({ addonId: a.addonId, quantity: a.quantity })),
            specialInstructions: (item as CartProductItem).specialInstructions,
          }
        : {
            kind: "deal" as const,
            dealId: (item as CartDealItem).dealId,
            quantity: item.quantity,
            selections: (item as CartDealItem).slots.map((s) => ({
              dealSlotId: s.dealSlotId,
              productId: s.productId,
              choices: s.choices.map((c) => ({ choiceGroupId: c.choiceGroupId, choiceOptionId: c.choiceOptionId })),
              addons: s.addons.map((a) => ({ addonId: a.addonId, quantity: a.quantity })),
            })),
            specialInstructions: (item as CartDealItem).specialInstructions,
          },
    );
  }

  async function applyCoupon() {
    if (!couponCode.trim() || !branch) return;
    setApplyingCoupon(true);
    setCouponError(null);
    try {
      const result = await api.public.post<{ couponCode: string; discountAmount: number }>("/orders/coupon-preview", {
        branchId: branch.id,
        code: couponCode.trim(),
        items: buildOrderItems(),
      });
      setAppliedCoupon({ code: result.couponCode, discountAmount: result.discountAmount });
      toast.success(`Coupon "${result.couponCode}" applied`);
    } catch (e) {
      const message = e instanceof ApiError ? describeApiError(e) : "Could not apply coupon";
      setCouponError(message);
      toast.error(message);
    } finally {
      setApplyingCoupon(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }

  async function placeOrder() {
    setSubmitting(true);
    try {
      const orderItems = buildOrderItems();

      const body: Record<string, unknown> = {
        branchId: branch!.id,
        type: orderType === "DELIVERY" ? "ONLINE_DELIVERY" : "ONLINE_PICKUP",
        paymentMethod,
        items: orderItems,
        contactName: `${title} ${contactName}`.trim(),
        contactPhone: normalizePhone(contactPhone),
        contactAlternatePhone: contactAlternatePhone ? normalizePhone(contactAlternatePhone) : undefined,
        contactEmail: contactEmail || undefined,
        specialInstructions: specialInstructions || undefined,
        isGift: showGift && isGift,
        loyaltyPointsToRedeem: customer && useLoyalty && loyaltyEnabled ? me?.loyaltyPoints ?? 0 : 0,
        couponCode: appliedCoupon?.code,
        tipAmount: tipPaisa > 0 ? tipPaisa : undefined,
      };
      if (orderType === "DELIVERY") {
        if (customer) {
          body.addressId = addressId;
        } else {
          body.newAddress = {
            city: city ?? "",
            area: area ?? "",
            addressLine: guestAddress.addressLine,
            landmark: guestAddress.landmark || undefined,
            contactNumber: normalizePhone(contactPhone),
          };
        }
      }
      if (showGift && isGift) body.gift = { ...gift, recipientPhone: normalizePhone(gift.recipientPhone) };
      if (paymentMethod === "COD" && changeRequest) body.changeRequestAmount = Math.round(Number(changeRequest) * 100);

      const result = customer
        ? await api.post<{ order: { orderNumber: string }; paymentRedirectUrl?: string }>("/orders", body)
        : await api.public.post<{ order: { orderNumber: string }; paymentRedirectUrl?: string }>("/orders/guest", body);
      orderPlacedRef.current = true;
      setOrderPlaced(true);
      clear();
      if (result.paymentRedirectUrl) {
        toast.info("Redirecting to payment gateway...");
        setTimeout(() => {
          window.location.href = result.paymentRedirectUrl!;
        }, 600);
      } else {
        router.push(`/order-confirmation/${result.order.orderNumber}`);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? describeApiError(e) : "Could not place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const needsCustomAddress = !!customer && addresses && addresses.length === 0;
  const guestAddressIncomplete = !customer && !guestAddress.addressLine.trim();

  return (
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-8 sm:py-8">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            <h1 className="text-xl font-semibold text-ink">Checkout</h1>
            {showGift && <button
              type="button"
              onClick={toggleGift}
              aria-pressed={isGift}
              aria-disabled={!onlineEnabled && !isGift}
              className={`flex shrink-0 items-center gap-2.5 rounded-full border px-5 py-2.5 text-sm font-medium transition ${
                isGift ? "border-green-600 bg-green-50 text-green-700" : "border-line bg-surface text-ink hover:border-green-600"
              } ${!onlineEnabled && !isGift ? "opacity-60" : ""}`}
            >
              <GiftIcon size={18} className="shrink-0 animate-gift-bounce text-green-600" />
              Send as a Gift
            </button>}
          </div>
          {showGift && !onlineEnabled && <p className="mt-2 text-xs text-muted">Gifts are paid online, and Online Payment is switched off right now.</p>}
          {showGift && isGift && (
            <div ref={giftRef} className="mt-4 scroll-mt-24 space-y-3 rounded-lg border border-green-600/30 bg-green-50/40 p-3">
              <input placeholder="Recipient Name" value={gift.recipientName} onChange={(e) => setGift({ ...gift, recipientName: e.target.value })} className="input" />
              <input placeholder="Recipient Mobile" value={gift.recipientPhone} onChange={(e) => setGift({ ...gift, recipientPhone: e.target.value })} className="input" />
              <input placeholder="Recipient Address" value={gift.recipientAddress} onChange={(e) => setGift({ ...gift, recipientAddress: e.target.value })} className="input" />
              <div className="flex gap-2">
                <input placeholder="City" value={gift.recipientCity} onChange={(e) => setGift({ ...gift, recipientCity: e.target.value })} className="input" />
                <input placeholder="Area" value={gift.recipientArea} onChange={(e) => setGift({ ...gift, recipientArea: e.target.value })} className="input" />
              </div>
              <textarea placeholder="Gift Message" value={gift.message} onChange={(e) => setGift({ ...gift, message: e.target.value })} className="input" />
              <p className="text-xs text-muted">Gift orders require Online Payment.</p>
            </div>
          )}

          {orderType !== "DELIVERY" && (
            <div className="mt-3 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
              <p className="flex items-center gap-2 text-sm text-muted">
                This is a <span className="font-semibold uppercase text-ink">Takeaway Order</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={PICKUP_BAG_ICON_URL} alt="" className="h-7 w-7 object-contain" />
              </p>
              <p className="mt-3 text-sm text-muted">You have to collect your order from</p>
              <p className="mt-1.5 text-base font-semibold text-ink">{branch?.name ?? "your selected branch"}</p>
              {branch?.address && (
                <>
                  <p className="mt-1 text-sm text-muted">
                    <span className="font-semibold text-muted">Location:</span> {branch.address}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-ink hover:text-brand-red"
                  >
                    View Location <PinIcon size={14} className="text-brand-red" />
                  </a>
                </>
              )}
              {branch?.phone && (
                <p className="mt-3 text-sm text-muted">
                  <span className="font-semibold text-muted">Phone:</span> <span className="text-ink">{branch.phone}</span>
                </p>
              )}
              {branch && branch.estimatedDeliveryMins > 0 && (
                <p className="mt-3 text-sm text-muted">
                  Your order will be ready for pickup in approximately <span className="font-semibold text-ink">{branch.estimatedDeliveryMins} minutes</span>.
                </p>
              )}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-alt">
              {orderType === "DELIVERY" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={DELIVERY_BIKE_ICON_URL} alt="" className="h-5 w-5 object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={PICKUP_TILE_ICON_URL} alt="" className="h-5 w-5 object-contain" />
              )}
            </div>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                This is a
                <span className="rounded-full bg-brand-red px-3 py-0.5 text-xs font-semibold text-white">
                  {orderType === "DELIVERY" ? "Delivery" : "Pickup"} Order
                </span>
              </p>
              <p className={`mt-0.5 text-xs text-muted ${orderType === "DELIVERY" ? "" : "uppercase tracking-wide"}`}>
                {orderType === "DELIVERY" ? "Just a last step, please enter your details:" : "Just a last step, please fill your information below"}
              </p>
            </div>
          </div>

          {orderType === "DELIVERY" && branch && (
            <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <p className="text-muted">
                Your order will be delivered from <span className="font-semibold text-ink">{branch.name}</span>
                {branch.address ? <span>, {branch.address}</span> : null}
              </p>
              {branch.estimatedDeliveryMins > 0 && (
                <p className="mt-1.5 text-muted">
                  Estimated delivery time: <span className="font-semibold text-ink">about {branch.estimatedDeliveryMins} minutes</span>
                </p>
              )}
            </div>
          )}

          {!customer && (
            <div className="mt-4 rounded-lg border border-line bg-surface-alt p-3 text-xs text-muted">
              Checking out as guest.{" "}
              <button type="button" onClick={() => openAuthModal("login", "/checkout")} className="font-medium text-brand-red">
                Login
              </button>{" "}
              to save your order history and earn loyalty points.
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-[110px_1fr]">
            <Field label="Title">
              <select value={title} onChange={(e) => setTitle(e.target.value)} className="input">
                {TITLES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Full Name" required>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Full Name" className="input" required />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Mobile Number" required>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value.replace(/[^0-9+ -]/g, ""))} placeholder="03xx-xxxxxxx" inputMode="tel" maxLength={14} className="input" required />
            </Field>
            <Field label="Alternate Mobile Number">
              <input
                value={contactAlternatePhone}
                onChange={(e) => setContactAlternatePhone(e.target.value.replace(/[^0-9+ -]/g, ""))}
                inputMode="tel"
                maxLength={14}
                placeholder="03xx-xxxxxxx"
                className="input"
              />
            </Field>
          </div>

          {orderType === "DELIVERY" ? (
            <>
              <div className="mt-4 rounded-2xl border border-line p-4">
                <Field label="Delivery Address" required>
                  {customer && addressesLoading ? (
                    <Skeleton className="h-12 w-full rounded-xl" />
                  ) : customer && addresses && addresses.length > 0 ? (
                    <select value={addressId} onChange={(e) => setAddressId(e.target.value)} className="input">
                      {addresses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}: {a.addressLine}
                        </option>
                      ))}
                    </select>
                  ) : needsCustomAddress ? (
                    <p className="text-sm text-muted">
                      No saved addresses. <a href="/account/addresses" className="text-brand-red">Add one</a> before checking out.
                    </p>
                  ) : (
                    <div className="flex flex-col items-stretch overflow-hidden rounded-xl border border-line bg-surface focus-within:border-brand-red sm:flex-row">
                      <input
                        value={guestAddress.addressLine}
                        onChange={(e) => setGuestAddress({ ...guestAddress, addressLine: e.target.value })}
                        placeholder="Enter your complete address"
                        className="min-w-0 flex-1 bg-transparent px-5 py-3.5 text-sm text-ink placeholder:text-muted placeholder:opacity-70 focus:outline-none"
                        required
                      />
                      {area && (
                        <span className="flex items-center justify-center border-t border-line bg-surface-alt px-4 py-2.5 text-center text-sm font-semibold text-ink sm:border-l sm:border-t-0 sm:px-5 sm:py-0">
                          {area}
                        </span>
                      )}
                    </div>
                  )}
                </Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Nearest Landmark">
                  <input
                    value={guestAddress.landmark}
                    onChange={(e) => setGuestAddress({ ...guestAddress, landmark: e.target.value })}
                    placeholder="any famous place nearby"
                    className="input"
                  />
                </Field>
                <Field label="Email Address" required>
                  <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Enter your email" className="input" required />
                  <p className="mt-1 text-[11px] text-muted">We email your order confirmation here.</p>
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Delivery Instructions">
                  <input
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    placeholder="Delivery Instructions"
                    className="input"
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4">
                <Field label="Pickup Notes">
                  <input value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} className="input" />
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Email Address" required={!customer}>
                  <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Enter your email" className="input" required={!customer} />
                  {!customer && <p className="mt-1 text-[11px] text-muted">We email your order confirmation here.</p>}
                </Field>
              </div>
            </>
          )}


          {loyaltyEnabled && me && me.loyaltyPoints > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-line p-3">
              <span className="text-sm">Use {me.loyaltyPoints} Loyalty Points (Rs. {me.loyaltyPoints})</span>
              <input type="checkbox" checked={useLoyalty} onChange={(e) => setUseLoyalty(e.target.checked)} />
            </div>
          )}

          <div className="mt-6 border-t border-line pt-6">
            <p className="text-base font-semibold text-ink">Payment Information</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              {paymentOptions.map((opt) => {
                const selected = paymentMethod === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => setPaymentMethod(opt.key)}
                    className={`relative flex w-full min-w-0 flex-col items-center gap-3 rounded-xl border-2 px-2 py-4 text-center text-[13px] font-medium text-ink transition disabled:opacity-40 sm:w-44 sm:px-4 sm:py-5 sm:text-sm ${
                      selected ? "border-brand-red bg-brand-red/10 shadow-md" : "border-line bg-surface hover:border-brand-red/40"
                    }`}
                  >
                    {selected && (
                      <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-red text-white shadow">
                        <FaCheck size={11} />
                      </span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={opt.icon} alt="" className="h-9 w-auto max-w-[72px] object-contain" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {paymentMethod === "COD" && (
            <div className="mt-4">
              <Field label="Change Request">
                <div className="flex overflow-hidden rounded-xl border border-line focus-within:border-brand-red">
                  <span className="flex items-center bg-surface-alt px-5 text-sm text-muted">Rs.</span>
                  <input
                    type="number"
                    placeholder="500"
                    value={changeRequest}
                    onChange={(e) => setChangeRequest(e.target.value)}
                    className="w-full border-0 bg-transparent px-3 py-3.5 text-sm text-ink focus:outline-none"
                  />
                </div>
              </Field>
            </div>
          )}

        </div>

        <div className="h-fit min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5 lg:sticky lg:top-6">
          <div className="space-y-3">
            {(showAllItems ? items : items.slice(0, 3)).map((i) => (
              <div key={i.cartItemId} className={`flex items-center gap-3 rounded-xl border p-3 transition duration-200 hover:shadow-lg ${reasonFor(i) ? "border-brand-red/40 bg-brand-red/5" : "border-line hover:border-brand-red/30"}`}>
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-alt">
                  {i.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.image} alt={i.name} className={`h-full w-full object-cover ${reasonFor(i) ? "opacity-40 grayscale" : ""}`} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] font-semibold ${reasonFor(i) ? "text-muted" : "text-ink"}`}>
                    <span className="mr-1.5 text-xs font-semibold text-muted">{i.quantity} x</span>
                    {i.name}
                    {reasonFor(i) && <span className="ml-2 inline-block -rotate-3 rounded-md border-2 border-brand-red bg-white px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-widest text-brand-red">{reasonFor(i) === "OPTION_OUT" ? "Not available" : "Sold out"}</span>}
                  </p>
                  {reasonFor(i) ? (
                    <>
                      <p className="mt-1 text-xs font-medium text-brand-red">{reasonFor(i) === "INACTIVE" ? SOLD_OUT_INACTIVE_MESSAGE : reasonFor(i) === "OPTION_OUT" ? OPTION_OUT_CART_MESSAGE : SOLD_OUT_CART_MESSAGE}</p>
                      <button type="button" onClick={() => removeItem(i.cartItemId)} className="mt-1.5 rounded-lg border border-brand-red px-3 py-1 text-xs font-semibold text-brand-red hover:bg-brand-red/10">
                        Remove
                      </button>
                    </>
                  ) : (
                    <p className="mt-1 font-semibold text-brand-red">
                      {formatPaisa(i.kind === "product" ? i.unitPrice * i.quantity : i.dealPrice * i.quantity)}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {items.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllItems((v) => !v)}
                className="mx-auto flex items-center gap-1.5 pt-1 text-sm font-medium text-brand-red"
              >
                {showAllItems ? "View Less" : `View More (${items.length - 3} more)`}
                <ChevronDownIcon size={14} className={showAllItems ? "rotate-180" : ""} />
              </button>
            )}
          </div>

          {showCoupon && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">Coupon Code</p>
            {appliedCoupon ? (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-green-600 bg-green-50 px-3 py-2 text-sm">
                <span className="font-medium text-green-800">{appliedCoupon.code} applied</span>
                <button type="button" onClick={removeCoupon} className="text-xs font-medium text-green-800 underline">
                  Remove
                </button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <input
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value);
                    setCouponError(null);
                  }}
                  placeholder="Enter coupon code"
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={applyingCoupon || !couponCode.trim()}
                  className="shrink-0 rounded-lg border border-brand-red px-4 text-sm font-semibold text-brand-red disabled:opacity-50"
                >
                  {applyingCoupon ? <LoadingDots>Applying</LoadingDots> : "Apply"}
                </button>
              </div>
            )}
            {couponError && <p className="mt-1.5 text-xs text-red-600">{couponError}</p>}
          </div>

          )}

          {showTip && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{orderType === "DELIVERY" ? "Tip your rider" : "Add a tip"} <span className="font-normal text-muted">(optional)</span></p>
                {tipPaisa > 0 && (
                  <button type="button" onClick={() => { setTip(""); setTipDraft(""); }} className="text-xs font-medium text-muted underline hover:text-brand-red">Remove</button>
                )}
              </div>
              {tipPresets.length > 0 && (
              <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${tipPresets.length}, minmax(0, 1fr))` }}>
                {tipPresets.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setTip(tip === String(amt) ? "" : String(amt));
                      setTipDraft("");
                    }}
                    className={`rounded-md border px-2 py-2.5 text-sm font-semibold transition ${tip === String(amt) ? "border-brand-red bg-brand-red text-white" : "border-line bg-surface-alt text-ink hover:border-brand-red"}`}
                  >
                    Rs. {amt}
                  </button>
                ))}
              </div>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={tipDraft}
                  onChange={(e) => setTipDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tipDraft.trim() && Number(tipDraft) > 0) {
                      e.preventDefault();
                      setTip(String(Math.round(Number(tipDraft))));
                      setTipDraft("");
                    }
                  }}
                  placeholder="Other amount"
                  aria-label="Custom tip amount in rupees"
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface-alt px-4 py-2.5 text-sm font-semibold text-ink placeholder:font-normal placeholder:text-muted focus:border-brand-red focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  disabled={!(tipDraft.trim() && Number(tipDraft) > 0)}
                  onClick={() => {
                    setTip(String(Math.round(Number(tipDraft))));
                    setTipDraft("");
                  }}
                  className="shrink-0 rounded-md bg-brand-red px-6 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              {tipPaisa > 0 && !tipPresets.includes(tipPaisa / 100) && (
                <p className="mt-2 text-xs font-medium text-green-700 dark:text-green-400">Tip of {formatPaisa(tipPaisa)} added</p>
              )}
            </div>
          </div>
          )}

          <div className="mt-5 rounded-xl border border-line bg-surface-alt p-5">
            <div className="space-y-4 text-sm font-medium text-ink">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <CalculatorIcon size={17} className="text-brand-red" /> Total
                </span>
                <span className="font-semibold">{formatPaisa(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <FaFileInvoiceDollar size={17} className="text-brand-red" /> Tax (15%)
                </span>
                <span className="font-semibold">{formatPaisa(estimatedTax)}</span>
              </div>
              {orderType === "DELIVERY" && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-3">
                    <TruckIcon size={17} className="text-brand-red" /> Delivery Fee
                  </span>
                  <span className="font-semibold">{formatPaisa(deliveryFee)}</span>
                </div>
              )}
              {appliedCoupon && (
                <div className="flex items-center justify-between text-green-700">
                  <span className="flex items-center gap-3">
                    <FaTag size={16} /> Discount ({appliedCoupon.code})
                  </span>
                  <span className="font-semibold">-{formatPaisa(couponDiscount)}</span>
                </div>
              )}
            </div>
            {tipPaisa > 0 && (
              <div className="mt-4 flex items-center justify-between text-sm font-medium text-ink">
                <span className="flex items-center gap-3">
                  <FaHandHoldingDollar size={17} className="text-brand-red" /> {orderType === "DELIVERY" ? "Rider tip" : "Tip"}
                </span>
                <span className="font-semibold">+{formatPaisa(tipPaisa)}</span>
              </div>
            )}
            <div className="mt-5 flex items-center justify-between border-t border-line pt-5">
              <span className="text-base font-bold text-ink">Grand Total</span>
              <span className="text-xl font-bold text-brand-red">{formatPaisa(estimatedGrandTotal + tipPaisa)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted">Final total incl. any discounts is calculated when you place the order.</p>

          <div className="mt-5 border-t border-line pt-5">
            <button
              onClick={placeOrder}
              disabled={submitting || hasUnavailable || (orderType === "DELIVERY" && (needsCustomAddress || guestAddressIncomplete))}
              className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-brand-red py-3.5 font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
            >
              <FiShoppingBag size={20} />
              {submitting ? <LoadingDots>Placing Order</LoadingDots> : hasUnavailable ? "Remove sold-out items first" : "Place Order"}
            </button>
            <button onClick={() => router.push("/")} className="mt-4 flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-brand-red">
              <ArrowLeftIcon size={12} /> continue to add more items
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="block text-[15px] font-semibold text-ink">{label}</label>
        {required && <span className="rounded-full bg-brand-red/10 px-3 py-1 text-xs font-medium text-brand-red">*Required</span>}
      </div>
      {children}
    </div>
  );
}
