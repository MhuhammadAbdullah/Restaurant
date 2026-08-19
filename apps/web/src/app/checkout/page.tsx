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
import { ArrowLeftIcon, GiftIcon, TruckIcon, CashIcon, CardIcon, PinIcon, PhoneIcon } from "../../components/icons";
import { Skeleton } from "../../components/skeletons";
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-ink">Checkout</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                This is a <span className="font-semibold text-ink">{orderType === "DELIVERY" ? "Delivery" : "Pick-Up"} Order</span>
                <TruckIcon size={16} className="text-brand-red" />
              </p>
              <p className="mt-0.5 text-xs text-muted">Just a last step, please enter your details:</p>
            </div>
            <button
              type="button"
              onClick={() => setIsGift((g) => !g)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                isGift ? "border-green-600 bg-green-50 text-green-700" : "border-line text-ink hover:border-green-600 hover:text-green-700"
              }`}
            >
              Send as a Gift <GiftIcon size={15} />
            </button>
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
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="03XXXXXXXXX" className="input" required />
            </Field>
            <Field label="Alternate Mobile Number">
              <input
                value={contactAlternatePhone}
                onChange={(e) => setContactAlternatePhone(e.target.value)}
                placeholder="03XXXXXXXXX"
                className="input"
              />
            </Field>
          </div>

          {orderType === "DELIVERY" && (
            <div className="mt-4">
              <Field label="Delivery Address" required>
                {customer && addressesLoading ? (
                  <Skeleton className="h-10 w-full rounded-lg" />
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
                  <div className="relative">
                    <input
                      value={guestAddress.addressLine}
                      onChange={(e) => setGuestAddress({ ...guestAddress, addressLine: e.target.value })}
                      placeholder="Enter your complete address"
                      className="input pr-24"
                      required
                    />
                    {area && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-surface-alt px-2.5 py-1.5 text-xs font-medium text-ink">
                        {area}
                      </span>
                    )}
                  </div>
                )}
              </Field>
            </div>
          )}

          {orderType !== "DELIVERY" && (
            <div className="mt-4 rounded-lg border border-line bg-surface-alt p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-ink">
                <PinIcon size={16} className="text-brand-red" /> Pickup from {branch?.name ?? "your selected branch"}
              </p>
              {branch?.address && <p className="mt-1 text-xs text-muted">{branch.address}</p>}
              {branch?.phone && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <PhoneIcon size={11} /> {branch.phone}
                </p>
              )}
              <p className="mt-2 text-xs text-muted">You'll collect this order yourself from the branch, so no delivery address is needed.</p>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {orderType === "DELIVERY" && (
              <Field label="Nearest Landmark">
                <input
                  value={guestAddress.landmark}
                  onChange={(e) => setGuestAddress({ ...guestAddress, landmark: e.target.value })}
                  placeholder="any famous place nearby"
                  className="input"
                />
              </Field>
            )}
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

          <div className="mt-5">
            <p className="text-sm font-medium text-ink">Payment Information</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isGift}
                onClick={() => setPaymentMethod("COD")}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 py-4 text-sm font-medium text-ink transition disabled:opacity-40 ${
                  paymentMethod === "COD" ? "border-green-600" : "border-line"
                }`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-white">
                  <CashIcon size={16} />
                </span>
                Cash on Delivery
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("ONLINE")}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 py-4 text-sm font-medium text-ink transition ${
                  paymentMethod === "ONLINE" ? "border-brand-red" : "border-line"
                }`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-red text-white">
                  <CardIcon size={16} />
                </span>
                Online Payment
              </button>
            </div>
          </div>

          {paymentMethod === "COD" && (
            <div className="mt-4">
              <Field label="Change Request">
                <div className="flex overflow-hidden rounded-lg border border-line">
                  <span className="flex items-center bg-surface-alt px-3 text-sm text-muted">Rs.</span>
                  <input
                    type="number"
                    placeholder="500"
                    value={changeRequest}
                    onChange={(e) => setChangeRequest(e.target.value)}
                    className="w-full border-0 bg-transparent px-3 py-2.5 text-sm text-ink focus:outline-none"
                  />
                </div>
              </Field>
            </div>
          )}

        </div>

        <div className="h-fit rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-6">
          <div className="space-y-2 text-sm">
            {items.map((i) => (
              <div key={i.cartItemId} className="flex justify-between text-muted">
                <span>
                  {i.quantity} x {i.name}
                </span>
                <span className="text-ink">{formatPaisa(i.kind === "product" ? i.unitPrice * i.quantity : i.dealPrice * i.quantity)}</span>
              </div>
            ))}
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

          <div className="mt-4 border-t border-line pt-4">
            <p className="font-semibold text-ink">Your Order</p>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted">
                <span>Total</span>
                <span>{formatPaisa(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Tax 15%</span>
                <span>{formatPaisa(estimatedTax)}</span>
              </div>
              {orderType === "DELIVERY" && (
                <div className="flex justify-between text-muted">
                  <span>Delivery Fee</span>
                  <span>{formatPaisa(deliveryFee)}</span>
                </div>
              )}
              {appliedCoupon && (
                <div className="flex justify-between text-green-700">
                  <span>Discount ({appliedCoupon.code})</span>
                  <span>-{formatPaisa(couponDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-ink">
                <span>Grand Total</span>
                <span>{formatPaisa(estimatedGrandTotal)}</span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted">Final total incl. any discounts is calculated when you place the order.</p>
          </div>

          <button
            onClick={placeOrder}
            disabled={submitting || (orderType === "DELIVERY" && (needsCustomAddress || guestAddressIncomplete))}
            className="mt-4 w-full rounded-full bg-brand-red py-3.5 font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Placing Order..." : "Place Order"}
          </button>
          <button onClick={() => router.push("/")} className="mt-3 flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-brand-red">
            <ArrowLeftIcon size={12} /> continue to add more items
          </button>
        </div>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--color-line);
          padding: 0.6rem 0.75rem;
          font-size: 0.875rem;
          background: transparent;
          color: inherit;
        }
      `}</style>
    </main>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-sm font-medium text-ink">{label}</label>
        {required && <span className="text-xs font-semibold text-brand-red">*Required</span>}
      </div>
      {children}
    </div>
  );
}
