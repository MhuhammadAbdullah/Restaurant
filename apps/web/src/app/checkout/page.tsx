"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { useAuthModalStore } from "../../store/useAuthModalStore";
import { useCartStore } from "../../store/useCartStore";
import { useLocationStore } from "../../store/useLocationStore";
import type { CartDealItem, CartProductItem } from "../../lib/types";
import { FaCheck, FaFileInvoiceDollar, FaTag } from "react-icons/fa6";
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
type RestaurantInfo = { loyalty?: { enabled: boolean } };

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
  const { items, clear, hasHydrated } = useCartStore();
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
  const [gift, setGift] = useState({ recipientName: "", recipientPhone: "", recipientAddress: "", recipientCity: "", recipientArea: "", message: "" });
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "ONLINE">("COD");
  const [showAllItems, setShowAllItems] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [changeRequest, setChangeRequest] = useState("");
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
        <p className="-mt-2 text-sm text-muted">Please wait a moment...</p>
      </div>
    );
  }

  if (!hasHydrated || !authHasHydrated || items.length === 0 || !isBranchOpen) {
    return null;
  }

  const subtotal = items.reduce((s, i) => s + (i.kind === "product" ? i.unitPrice * i.quantity : i.dealPrice * i.quantity), 0);
  const estimatedTax = Math.round(subtotal * 0.15);
  const deliveryFee = orderType === "DELIVERY" ? (branch?.deliveryFee ?? 0) : 0;
  const couponDiscount = appliedCoupon?.discountAmount ?? 0;
  const estimatedGrandTotal = Math.max(0, subtotal + estimatedTax + deliveryFee - couponDiscount);

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
        isGift,
        loyaltyPointsToRedeem: customer && useLoyalty && loyaltyEnabled ? me?.loyaltyPoints ?? 0 : 0,
        couponCode: appliedCoupon?.code,
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
      if (isGift) body.gift = { ...gift, recipientPhone: normalizePhone(gift.recipientPhone) };
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
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold text-ink">Checkout</h1>
            <button
              type="button"
              onClick={() => setIsGift((g) => !g)}
              className={`flex shrink-0 items-center gap-2.5 rounded-full border px-5 py-2.5 text-sm font-medium transition ${
                isGift ? "border-green-600 bg-green-50 text-green-700" : "border-line bg-surface text-ink hover:border-green-600"
              }`}
            >
              <GiftIcon size={18} className="shrink-0 animate-gift-bounce text-green-600" />
              Send as a Gift
            </button>
          </div>

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
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="03xx-xxxxxxx" className="input" required />
            </Field>
            <Field label="Alternate Mobile Number">
              <input
                value={contactAlternatePhone}
                onChange={(e) => setContactAlternatePhone(e.target.value)}
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
                    <div className="flex items-stretch overflow-hidden rounded-xl border border-line bg-surface focus-within:border-brand-red">
                      <input
                        value={guestAddress.addressLine}
                        onChange={(e) => setGuestAddress({ ...guestAddress, addressLine: e.target.value })}
                        placeholder="Enter your complete address"
                        className="min-w-0 flex-1 bg-transparent px-5 py-3.5 text-sm text-ink placeholder:text-muted placeholder:opacity-70 focus:outline-none"
                        required
                      />
                      {area && (
                        <span className="flex items-center border-l border-line bg-surface-alt px-5 text-sm font-semibold text-ink">
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
                <Field label="Email Address">
                  <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Enter your email" className="input" />
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
                <Field label="Email Address">
                  <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Enter your email" className="input" />
                </Field>
              </div>
            </>
          )}

          {isGift && (
            <div className="mt-4 space-y-3 rounded-lg border border-brand-red/30 p-3">
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

          {loyaltyEnabled && me && me.loyaltyPoints > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-line p-3">
              <span className="text-sm">Use {me.loyaltyPoints} Loyalty Points (Rs. {me.loyaltyPoints})</span>
              <input type="checkbox" checked={useLoyalty} onChange={(e) => setUseLoyalty(e.target.checked)} />
            </div>
          )}

          <div className="mt-6 border-t border-line pt-6">
            <p className="text-base font-semibold text-ink">Payment Information</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {(
                [
                  { key: "COD", label: orderType === "DELIVERY" ? "Cash on Delivery" : "Pay at Pickup", icon: CASH_ICON_URL, disabled: isGift },
                  { key: "ONLINE", label: "Online Payment", icon: CARDS_ICON_URL, disabled: false },
                ] as const
              ).map((opt) => {
                const selected = paymentMethod === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => setPaymentMethod(opt.key)}
                    className={`relative flex w-44 flex-col items-center gap-3 rounded-xl border-2 px-4 py-5 text-sm font-medium text-ink transition disabled:opacity-40 ${
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

        <div className="h-fit rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-6">
          <div className="space-y-3">
            {(showAllItems ? items : items.slice(0, 3)).map((i) => (
              <div key={i.cartItemId} className="flex items-center gap-3 rounded-xl border border-line p-3 transition duration-200 hover:border-brand-red/30 hover:shadow-lg">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-alt">
                  {i.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.image} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    <span className="mr-1.5 text-xs font-semibold text-muted">{i.quantity} x</span>
                    {i.name}
                  </p>
                  <p className="mt-1 font-semibold text-brand-red">
                    {formatPaisa(i.kind === "product" ? i.unitPrice * i.quantity : i.dealPrice * i.quantity)}
                  </p>
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
                  {applyingCoupon ? "Applying..." : "Apply"}
                </button>
              </div>
            )}
            {couponError && <p className="mt-1.5 text-xs text-red-600">{couponError}</p>}
          </div>

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
            <div className="mt-5 flex items-center justify-between border-t border-line pt-5">
              <span className="text-base font-bold text-ink">Grand Total</span>
              <span className="text-xl font-bold text-brand-red">{formatPaisa(estimatedGrandTotal)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted">Final total incl. any discounts is calculated when you place the order.</p>

          <div className="mt-5 border-t border-line pt-5">
            <button
              onClick={placeOrder}
              disabled={submitting || (orderType === "DELIVERY" && (needsCustomAddress || guestAddressIncomplete))}
              className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-brand-red py-3.5 font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
            >
              <FiShoppingBag size={20} />
              {submitting ? "Placing Order..." : "Place Order"}
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
