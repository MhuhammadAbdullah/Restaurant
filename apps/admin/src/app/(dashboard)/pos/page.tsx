"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useSelectedBranch } from "../../../lib/useSelectedBranch";
import { ProductConfigModal, type ProductDetail, type ProductCartLine } from "../../../components/pos/ProductConfigModal";
import { DealConfigModal, type Deal, type DealCartLine } from "../../../components/pos/DealConfigModal";
import { TableBillPanel } from "../../../components/pos/TableBillPanel";
import { CashIcon, CardIcon, QrIcon } from "../../../components/pos/payment-icons";
import { MinusIcon, PlusIcon } from "../../../components/icons";
import {
  FaBoxOpen,
  FaCartShopping,
  FaCheck,
  FaMagnifyingGlass,
  FaMotorcycle,
  FaPenToSquare,
  FaPersonWalking,
  FaTag,
  FaTicket,
  FaTrashCan,
  FaUserPlus,
  FaUtensils,
} from "react-icons/fa6";

type Category = { id: string; name: string; image: string | null; status: "ACTIVE" | "INACTIVE"; sortOrder: number };
type ProductListItem = {
  id: string;
  name: string;
  basePrice: number;
  discountPrice: number | null;
  status: "ACTIVE" | "INACTIVE";
  branchAvailability: { branchId: string; isAvailable: boolean }[];
  images: { url: string; isPrimary: boolean }[];
};
type TableRow = {
  id: string;
  number: string;
  name: string | null;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING";
  openOrder: { id: string; orderNumber: string; status: string; grandTotal: number; paidTotal: number; balanceDue: number; itemCount: number; createdAt: string } | null;
};
type CustomerLite = { id: string; name: string; phone: string; loyaltyAccount: { pointsBalance: number } | null };
type Quote = {
  subtotal: number;
  taxPct: number;
  taxAmount: number;
  deliveryFee: number;
  couponDiscountAmount: number;
  couponError?: string;
  loyaltyDiscountAmount: number;
  grandTotal: number;
};

type CartLine = (ProductCartLine | DealCartLine) & { key: string };

const ORDER_TYPES = ["WALK_IN", "TAKEAWAY", "DINE_IN", "DELIVERY"] as const;
const ORDER_TYPE_META: Record<(typeof ORDER_TYPES)[number], { label: string; icon: (p: { size?: number }) => React.ReactElement }> = {
  WALK_IN: { label: "Walk-in", icon: (p) => <FaPersonWalking {...p} /> },
  TAKEAWAY: { label: "Takeaway", icon: (p) => <FaBoxOpen {...p} /> },
  DINE_IN: { label: "Dine-in", icon: (p) => <FaUtensils {...p} /> },
  DELIVERY: { label: "Delivery", icon: (p) => <FaMotorcycle {...p} /> },
};
const TABLE_STATUS_META: Record<TableRow["status"], { label: string; dot: string; card: string }> = {
  AVAILABLE: { label: "Available", dot: "bg-green-500", card: "border-neutral-200 bg-white hover:border-green-500" },
  OCCUPIED: { label: "Occupied", dot: "bg-brand-red", card: "border-red-200 bg-red-50/60 hover:border-brand-red" },
  RESERVED: { label: "Reserved", dot: "bg-amber-500", card: "border-amber-200 bg-amber-50/60 hover:border-amber-500" },
  CLEANING: { label: "Cleaning", dot: "bg-blue-500", card: "border-blue-200 bg-blue-50/60 hover:border-blue-500" },
};
const QUICK_CASH = [500, 1000, 2000, 5000];
const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-brand-red focus:outline-none disabled:bg-neutral-50";

function lineUnitTotal(line: CartLine): number {
  if (line.kind === "product") {
    return line.unitPrice + line.choices.reduce((s, c) => s + c.priceAdjustment, 0) + line.addons.reduce((s, a) => s + a.price * a.quantity, 0);
  }
  return line.dealPrice;
}
function lineTotal(line: CartLine): number {
  return lineUnitTotal(line) * line.quantity;
}
/**
 * Identity of a cart line: same product/deal with the same choices, add-ons and instructions. Adding a
 * line that matches an existing one bumps its quantity instead of creating a duplicate row.
 */
function lineSignature(l: ProductCartLine | DealCartLine): string {
  const opts = (xs: { choiceGroupId: string; choiceOptionId: string }[]) => xs.map((c) => `${c.choiceGroupId}:${c.choiceOptionId}`).sort().join(",");
  const adds = (xs: { addonId: string; quantity: number }[]) => xs.map((a) => `${a.addonId}x${a.quantity}`).sort().join(",");
  if (l.kind === "product") {
    return `p|${l.productId}|${opts(l.choices)}|${adds(l.addons)}|${(l.specialInstructions ?? "").trim().toLowerCase()}`;
  }
  return `d|${l.dealId}|${l.slots.map((s) => `${s.dealSlotId}:${s.productId}:${opts(s.choices)}:${adds(s.addons)}`).sort().join(";")}`;
}
function upsertLine(cart: CartLine[], line: ProductCartLine | DealCartLine, editingKey: string | null, keyPrefix: string): CartLine[] {
  const sig = lineSignature(line);
  if (editingKey) {
    const edited = cart.map((l) => (l.key === editingKey ? ({ ...line, key: editingKey } as CartLine) : l));
    // Editing a line into an exact copy of another one merges the two.
    const twin = edited.find((l) => l.key !== editingKey && lineSignature(l) === sig);
    if (!twin) return edited;
    return edited.filter((l) => l.key !== editingKey).map((l) => (l.key === twin.key ? { ...l, quantity: l.quantity + line.quantity } : l));
  }
  const existing = cart.find((l) => lineSignature(l) === sig);
  if (existing) return cart.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + line.quantity } : l));
  return [...cart, { ...line, key: `${keyPrefix}-${Date.now()}-${Math.random()}` } as CartLine];
}
function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function minutesSince(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function PosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { branchId, branches } = useSelectedBranch();

  // ---- Order setup ----
  const [orderType, setOrderType] = useState<(typeof ORDER_TYPES)[number]>("WALK_IN");
  const [tableId, setTableId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState({ city: "", area: "", addressLine: "", landmark: "" });
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<CustomerLite | null>(null);
  const [customerSearchResults, setCustomerSearchResults] = useState<CustomerLite[]>([]);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAltPhone, setCustomerAltPhone] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");

  // ---- Catalog browsing ----
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [showDeals, setShowDeals] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [discountedOnly, setDiscountedOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ---- Cart ----
  const [cart, setCart] = useState<CartLine[]>([]);
  const [configuringProduct, setConfiguringProduct] = useState<ProductDetail | null>(null);
  const [configuringDeal, setConfiguringDeal] = useState<Deal | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // ---- Discounts / loyalty ----
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [loyaltyRedeem, setLoyaltyRedeem] = useState(0);

  // ---- Payment ----
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "QR">("CASH");
  const [amountTendered, setAmountTendered] = useState("");

  // ---- Submission ----
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [placing, setPlacing] = useState(false);
  const [lastResult, setLastResult] = useState<{
    id: string;
    orderNumber: string;
    grandTotal: number;
    paymentStatus: string;
    type: string;
    isAmendment: boolean;
    latestRevisionId?: string;
    cashTendered?: number;
    changeDue?: number;
  } | null>(null);

  // ---- Add-items-to-existing-order mode (entered automatically by selecting an occupied Dine-In table) ----
  const [amendOrderId, setAmendOrderId] = useState<string | null>(null);

  // ---- UI-only toggles ----
  const [customerOpen, setCustomerOpen] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);

  const { data: restaurantInfo } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.get<{ loyalty?: { enabled: boolean } }>("/cms/restaurant"),
  });
  const loyaltyEnabled = restaurantInfo?.loyalty?.enabled ?? true;

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/catalog/categories"), staleTime: 0 });
  const activeCategories = useMemo(
    () => (categories ?? []).filter((c) => c.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  const { data: products } = useQuery({
    queryKey: ["pos-products", branchId, selectedCategoryId, search],
    queryFn: () =>
      api.get<ProductListItem[]>(
        `/catalog/products?branchId=${branchId}${selectedCategoryId ? `&categoryId=${selectedCategoryId}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
    enabled: !!branchId && !showDeals,
  });
  const visibleProducts = useMemo(() => (discountedOnly ? (products ?? []).filter((p) => p.discountPrice != null) : products ?? []), [products, discountedOnly]);

  // "All" (no category, not the dedicated Deals tab) should surface deals too, not just regular
  // products — a deal is still something the cashier can ring up from that view.
  const isAllTab = !showDeals && !selectedCategoryId;
  const { data: deals } = useQuery({
    queryKey: ["pos-deals", branchId],
    queryFn: () => api.get<Deal[]>(`/deals?branchId=${branchId}`),
    enabled: !!branchId && (showDeals || isAllTab),
  });

  // Floor view: every table plus the running bill of its open dine-in order.
  const { data: tables } = useQuery({
    queryKey: ["pos-tables", branchId],
    queryFn: () => api.get<TableRow[]>(`/tables/overview?branchId=${branchId}`),
    enabled: !!branchId && orderType === "DINE_IN",
    refetchInterval: 15000,
  });

  async function openProduct(p: ProductListItem) {
    const detail = await api.get<ProductDetail>(`/catalog/products/${p.id}`);
    setEditingKey(null);
    setConfiguringProduct(detail);
  }
  async function openDeal(d: Deal) {
    setEditingKey(null);
    setConfiguringDeal(d);
  }

  function addOrUpdateProductLine(line: ProductCartLine) {
    setCart((c) => upsertLine(c, line, editingKey, "p"));
    setConfiguringProduct(null);
    setEditingKey(null);
  }
  function addOrUpdateDealLine(line: DealCartLine) {
    setCart((c) => upsertLine(c, line, editingKey, "d"));
    setConfiguringDeal(null);
    setEditingKey(null);
  }

  async function editLine(line: CartLine) {
    setEditingKey(line.key);
    if (line.kind === "product") {
      const detail = await api.get<ProductDetail>(`/catalog/products/${line.productId}`);
      setConfiguringProduct(detail);
    } else {
      const detail = await api.get<Deal>(`/deals/${line.dealId}`);
      setConfiguringDeal(detail);
    }
  }
  function removeLine(key: string) {
    setCart((c) => c.filter((l) => l.key !== key));
  }
  function changeQty(key: string, delta: number) {
    setCart((c) => c.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)));
  }

  const subtotal = cart.reduce((s, l) => s + lineTotal(l), 0);

  // Live search as the phone number is typed. People who only ever appeared on an order ("guest:" ids)
  // have no profile to attach — selecting one just pre-fills the name and phone.
  useEffect(() => {
    const q = customerPhone.trim();
    if (foundCustomer || q.length < 4) {
      setCustomerSearchResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const results = await api.get<CustomerLite[]>(`/staff/customers?search=${encodeURIComponent(q)}`);
        if (cancelled) return;
        setCustomerSearchResults(results.slice(0, 6));
        const exact = results.find((r) => r.phone === q);
        if (exact) selectCustomer(exact);
      } catch {
        if (!cancelled) setCustomerSearchResults([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPhone, foundCustomer]);

  function selectCustomer(c: CustomerLite) {
    if (c.id.startsWith("guest:")) {
      setCustomerName(c.name);
      setCustomerPhone(c.phone);
    } else {
      setFoundCustomer(c);
      setCustomerName(c.name);
      setCustomerPhone(c.phone);
    }
    setCustomerSearchResults([]);
    setLoyaltyRedeem(0);
  }
  function clearCustomer() {
    setFoundCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setCustomerAltPhone("");
    setLoyaltyRedeem(0);
  }

  function buildItems() {
    return cart.map((l) =>
      l.kind === "product"
        ? {
            kind: "product" as const,
            productId: l.productId,
            quantity: l.quantity,
            choices: l.choices.map((c) => ({ choiceGroupId: c.choiceGroupId, choiceOptionId: c.choiceOptionId })),
            addons: l.addons.map((a) => ({ addonId: a.addonId, quantity: a.quantity })),
            specialInstructions: l.specialInstructions,
          }
        : {
            kind: "deal" as const,
            dealId: l.dealId,
            quantity: l.quantity,
            selections: l.slots.map((s) => ({
              dealSlotId: s.dealSlotId,
              productId: s.productId,
              choices: s.choices.map((c) => ({ choiceGroupId: c.choiceGroupId, choiceOptionId: c.choiceOptionId })),
              addons: s.addons.map((a) => ({ addonId: a.addonId, quantity: a.quantity })),
            })),
          },
    );
  }

  // Exact amount due (tax, delivery fee, discounts) straight from the server — the cashier never has to
  // guess the total or the change. Re-priced whenever the cart, order type, coupon or points change.
  const quoteItems = useMemo(() => buildItems(), [cart]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: quote } = useQuery({
    queryKey: ["pos-quote", branchId, orderType, appliedCoupon?.code ?? "", loyaltyRedeem, foundCustomer?.id ?? "", quoteItems],
    queryFn: () =>
      api.post<Quote>("/pos/orders/quote", {
        branchId,
        type: orderType,
        customerId: foundCustomer?.id,
        items: quoteItems,
        couponCode: appliedCoupon?.code,
        loyaltyPointsToRedeem: loyaltyEnabled ? loyaltyRedeem : 0,
      }),
    enabled: !!branchId && cart.length > 0 && !amendOrderId,
    placeholderData: (prev) => prev,
  });

  const { data: lastAddress } = useQuery({
    queryKey: ["pos-last-address", foundCustomer?.id],
    queryFn: async () => {
      const orders = await api.get<{ deliveryAddressSnapshot: string | null; deliveryCity: string | null; deliveryArea: string | null; deliveryLandmark: string | null }[]>(
        `/staff/orders?customerId=${foundCustomer!.id}&take=15`,
      );
      return orders.find((o) => o.deliveryAddressSnapshot) ?? null;
    },
    enabled: !!foundCustomer && !foundCustomer.id.startsWith("guest:") && orderType === "DELIVERY",
  });

  async function applyCoupon() {
    if (!couponInput.trim() || !branchId) return;
    setCouponChecking(true);
    try {
      const result = await api.post<{ couponCode: string; discountAmount: number }>("/pos/orders/coupon-preview", {
        branchId,
        code: couponInput.trim(),
        items: buildItems(),
      });
      setAppliedCoupon({ code: result.couponCode, discountAmount: result.discountAmount });
    } catch (e) {
      setAppliedCoupon(null);
      toast.error(e instanceof ApiError ? e.message : "Could not apply coupon");
    } finally {
      setCouponChecking(false);
    }
  }
  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
  }

  function refreshFloor() {
    void queryClient.invalidateQueries({ queryKey: ["pos-tables"] });
    void queryClient.invalidateQueries({ queryKey: ["pos-bill"] });
  }

  function resetForNewOrder() {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setFoundCustomer(null);
    setCustomerEmail("");
    setCustomerAltPhone("");
    setDeliveryNote("");
    setTableId("");
    setDeliveryAddress({ city: "", area: "", addressLine: "", landmark: "" });
    setCouponInput("");
    setAppliedCoupon(null);
    setLoyaltyRedeem(0);
    setAmountTendered("");
    setLastResult(null);
    setAmendOrderId(null);
    setIdempotencyKey(newIdempotencyKey());
    refreshFloor();
  }

  // Dine-in bills are settled later, from the table, so no payment is taken at placement.
  const isDineIn = orderType === "DINE_IN";
  const total = quote?.grandTotal ?? Math.max(0, subtotal - (appliedCoupon?.discountAmount ?? 0));
  const tenderedPaisa = amountTendered.trim() ? Math.round(Number(amountTendered) * 100) : null;
  const cashShort = !isDineIn && paymentMethod === "CASH" && tenderedPaisa != null && tenderedPaisa < total;
  const changeDue = !isDineIn && paymentMethod === "CASH" && tenderedPaisa != null && tenderedPaisa >= total ? tenderedPaisa - total : 0;

  async function placeOrder() {
    if (!branchId || cart.length === 0) return;
    setPlacing(true);
    try {
      if (amendOrderId) {
        const result = await api.post<{ id: string; orderNumber: string; grandTotal: number; paymentStatus: string; type: string; revisions: { id: string }[] }>(
          `/staff/orders/${amendOrderId}/items`,
          { items: buildItems(), idempotencyKey },
        );
        setLastResult({
          id: result.id,
          orderNumber: result.orderNumber,
          grandTotal: result.grandTotal,
          paymentStatus: result.paymentStatus,
          type: result.type,
          isAmendment: true,
          latestRevisionId: result.revisions[result.revisions.length - 1]?.id,
        });
        setCart([]);
        setIdempotencyKey(newIdempotencyKey());
      } else {
        const cashPaid = !isDineIn && paymentMethod === "CASH" && tenderedPaisa != null;
        const result = await api.post<{ id: string; orderNumber: string; grandTotal: number; paymentStatus: string; type: string }>("/pos/orders", {
          branchId,
          type: orderType,
          tableId: isDineIn ? tableId : undefined,
          customerId: foundCustomer?.id,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          customerAlternatePhone: orderType === "DELIVERY" ? customerAltPhone.trim() || undefined : undefined,
          customerEmail: customerEmail.trim() || undefined,
          specialInstructions: orderType === "DELIVERY" ? deliveryNote.trim() || undefined : undefined,
          deliveryAddress: orderType === "DELIVERY" ? deliveryAddress : undefined,
          items: buildItems(),
          couponCode: appliedCoupon?.code,
          loyaltyPointsToRedeem: loyaltyEnabled ? loyaltyRedeem || undefined : undefined,
          paymentMethod: isDineIn ? "CASH" : paymentMethod,
          amountTendered: cashPaid ? tenderedPaisa : undefined,
          clientTotal: quote?.grandTotal,
          idempotencyKey,
        });
        setLastResult({
          id: result.id,
          orderNumber: result.orderNumber,
          grandTotal: result.grandTotal,
          paymentStatus: result.paymentStatus,
          type: result.type,
          isAmendment: false,
          cashTendered: cashPaid ? tenderedPaisa! : undefined,
          changeDue: cashPaid ? Math.max(0, tenderedPaisa! - result.grandTotal) : undefined,
        });
        setCart([]);
      }
      refreshFloor();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not place order");
      // The server total may have moved (price change, coupon expiry) — re-price before the next attempt.
      void queryClient.invalidateQueries({ queryKey: ["pos-quote"] });
    } finally {
      setPlacing(false);
    }
  }

  async function confirmCardPayment() {
    if (!lastResult) return;
    try {
      const result = await api.post<{ paymentStatus: string }>(`/staff/orders/${lastResult.id}/confirm-payment`, {});
      setLastResult({ ...lastResult, paymentStatus: result.paymentStatus });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not confirm payment");
    }
  }

  function pickTable(t: TableRow) {
    if (t.status === "OCCUPIED" && t.openOrder) {
      // Occupied table with a live bill: open it for adding items and taking payment.
      setTableId(t.id);
      if (amendOrderId !== t.openOrder.id) setCart([]);
      setAmendOrderId(t.openOrder.id);
      setLastResult(null);
      return;
    }
    if (amendOrderId) {
      setAmendOrderId(null);
      setCart([]);
    }
    setTableId(t.id);
  }

  async function freeTable(id: string) {
    try {
      await api.patch(`/tables/${id}`, { status: "AVAILABLE" });
      setTableId("");
      refreshFloor();
      toast.success("Table marked available");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update the table");
    }
  }

  // A table that's Occupied with no auto-detected order (e.g. stale status left over from a
  // cancelled/completed order made outside the normal flow) must never silently get a second,
  // conflicting new order — free it first.
  const selectedTable = tables?.find((t) => t.id === tableId);
  const selectedTableBlocked = isDineIn && !!tableId && !amendOrderId && selectedTable?.status === "OCCUPIED" && !selectedTable.openOrder;
  const canPlace =
    cart.length > 0 &&
    !!branchId &&
    (orderType !== "DINE_IN" || !!tableId) &&
    !selectedTableBlocked &&
    (orderType !== "DELIVERY" || (!!deliveryAddress.addressLine.trim() && !!customerName.trim() && !!customerPhone.trim()));

  if (!branchId && branches.length > 1) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
        <p className="text-sm font-medium text-neutral-700">Select a branch above to start a POS order</p>
        <p className="mt-1 text-xs text-neutral-400">You have access to {branches.length} branches. Pick one from the switcher in the header.</p>
      </div>
    );
  }

  /** Phone search + name (+ email / alternate phone). `required` marks name and phone as mandatory (delivery). */
  function renderCustomerForm({ required, delivery }: { required: boolean; delivery: boolean }) {
    const star = required ? <span className="text-brand-red"> *</span> : null;
    const label = "mb-1 block text-xs font-medium text-neutral-500";
    return (
      <div className="space-y-3">
        {foundCustomer && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                {foundCustomer.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-green-900">{foundCustomer.name}</p>
                <p className="text-xs text-green-700">
                  {foundCustomer.phone} · {foundCustomer.loyaltyAccount?.pointsBalance ?? 0} loyalty pts
                </p>
              </div>
            </div>
            <button onClick={clearCustomer} className="shrink-0 text-xs font-medium text-green-800 underline">Change</button>
          </div>
        )}
        <div className={`grid gap-3 ${delivery ? "sm:grid-cols-2" : ""}`}>
          <div className="relative">
            <label className={label}>Phone{star}</label>
            <input
              placeholder="03XX XXXXXXX"
              value={customerPhone}
              disabled={!!foundCustomer}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className={fieldClass}
            />
            {customerSearchResults.length > 0 && !foundCustomer && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                <p className="border-b border-neutral-100 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Existing customers</p>
                {customerSearchResults.map((c) => (
                  <button key={c.id} onClick={() => selectCustomer(c)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50">
                    <span className="truncate font-medium text-neutral-800">{c.name}</span>
                    <span className="shrink-0 text-xs text-neutral-500">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className={label}>Name{star}</label>
            <input placeholder="Customer name" value={customerName} disabled={!!foundCustomer} onChange={(e) => setCustomerName(e.target.value)} className={fieldClass} />
          </div>
          {delivery && (
            <div>
              <label className={label}>Alternate phone</label>
              <input placeholder="Optional" value={customerAltPhone} onChange={(e) => setCustomerAltPhone(e.target.value)} className={fieldClass} />
            </div>
          )}
          <div>
            <label className={label}>Email</label>
            <input
              type="email"
              placeholder="Optional — for order updates"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </div>
    );
  }

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const branchName = branches.find((b) => b.id === branchId)?.name;
  const showCustomerFields = customerOpen || !!customerPhone || !!customerName || !!foundCustomer;
  const showCouponField = couponOpen || !!appliedCoupon;
  const amendTable = amendOrderId ? tables?.find((t) => t.openOrder?.id === amendOrderId) : undefined;

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* ======================= CATALOG ======================= */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Point of Sale</h1>
            {branchName && <p className="text-xs text-neutral-500">{branchName}</p>}
          </div>
        </div>

        {amendOrderId && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>
              {amendTable ? `${amendTable.name ?? `Table ${amendTable.number}`} has an open bill.` : "Open bill selected."} Add more items on the left, or collect payment from the bill on the right.
            </span>
            <button onClick={() => { setAmendOrderId(null); setTableId(""); setCart([]); }} className="shrink-0 font-semibold underline">Close</button>
          </div>
        )}

        {!amendOrderId && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ORDER_TYPES.map((t) => {
              const meta = ORDER_TYPE_META[t];
              const active = orderType === t;
              return (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition ${
                    active ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                  }`}
                >
                  {meta.icon({ size: 15 })}
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}

        {isDineIn && (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-neutral-500">Tables — tap an occupied table to view its bill, add items or take payment</p>
              <span className="hidden shrink-0 items-center gap-3 text-[11px] text-neutral-400 sm:flex">
                {(["AVAILABLE", "OCCUPIED"] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TABLE_STATUS_META[s].dot}`} />{TABLE_STATUS_META[s].label}</span>
                ))}
              </span>
            </div>
            {!tables ? (
              <p className="py-4 text-center text-sm text-neutral-400">Loading tables...</p>
            ) : tables.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-400">No tables set up for this branch.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {tables.map((t) => {
                  const meta = TABLE_STATUS_META[t.status];
                  const selected = tableId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => pickTable(t)}
                      className={`rounded-xl border-2 p-2.5 text-left transition ${meta.card} ${selected ? "ring-2 ring-brand-red ring-offset-1" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-neutral-900">{t.name ?? `T${t.number}`}</span>
                        <span className="flex items-center gap-1 text-[11px] text-neutral-500"><span className={`h-2 w-2 rounded-full ${meta.dot}`} />{meta.label}</span>
                      </div>
                      {t.status === "OCCUPIED" && t.openOrder ? (
                        <p className="mt-1.5 text-xs text-neutral-600">
                          <span className="font-semibold text-brand-red">{formatPaisa(t.openOrder.balanceDue)}</span> due · {t.openOrder.itemCount} items · {minutesSince(t.openOrder.createdAt)}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-neutral-400">{t.status === "OCCUPIED" ? "No open order" : "Tap to start an order"}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedTableBlocked && selectedTable && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                <span>This table is marked Occupied but has no open order.</span>
                <button onClick={() => freeTable(selectedTable.id)} className="rounded-md bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700">Mark available</button>
              </div>
            )}
          </div>
        )}

        {!amendOrderId && orderType === "DELIVERY" && (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-neutral-900">Customer details</p>
              <span className="text-[11px] text-neutral-400">Name and phone are required so the rider can call</span>
            </div>
            <div className="mt-3">{renderCustomerForm({ required: true, delivery: true })}</div>

            <div className="my-4 border-t border-neutral-100" />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-neutral-900">Delivery address</p>
              {lastAddress && (
                <button
                  onClick={() =>
                    setDeliveryAddress({
                      city: lastAddress.deliveryCity ?? "",
                      area: lastAddress.deliveryArea ?? "",
                      addressLine: lastAddress.deliveryAddressSnapshot ?? "",
                      landmark: lastAddress.deliveryLandmark ?? "",
                    })
                  }
                  className="max-w-full truncate rounded-full border border-brand-red/30 bg-brand-red/5 px-3 py-1 text-xs font-medium text-brand-red transition hover:bg-brand-red/10"
                  title={lastAddress.deliveryAddressSnapshot ?? ""}
                >
                  Use last address: {lastAddress.deliveryAddressSnapshot}
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <input placeholder="City" value={deliveryAddress.city} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, city: e.target.value })} className={fieldClass} />
              <input placeholder="Area" value={deliveryAddress.area} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, area: e.target.value })} className={fieldClass} />
              <input placeholder="Complete address *" value={deliveryAddress.addressLine} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, addressLine: e.target.value })} className={`col-span-2 ${fieldClass}`} />
              <input placeholder="Nearest landmark (optional)" value={deliveryAddress.landmark} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, landmark: e.target.value })} className={`col-span-2 ${fieldClass}`} />
              <input placeholder="Instructions for the rider (optional)" value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} className={`col-span-2 ${fieldClass}`} />
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <FaMagnifyingGlass size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search products..." className={`${fieldClass} pl-9`} />
          </div>
          <button
            onClick={() => setDiscountedOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              discountedOnly ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400"
            }`}
          >
            <FaTag size={12} /> Discounted only
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => { setShowDeals(false); setSelectedCategoryId(""); }}
            className={`flex shrink-0 items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
              !showDeals && !selectedCategoryId ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 bg-white text-neutral-600 hover:border-brand-red hover:text-brand-red"
            }`}
          >
            All
          </button>

          {activeCategories.map((c) => {
            const isDeals = c.name.toLowerCase() === "deals";
            const active = isDeals ? showDeals : !showDeals && selectedCategoryId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  if (isDeals) {
                    setShowDeals(true);
                  } else {
                    setShowDeals(false);
                    setSelectedCategoryId(c.id);
                  }
                }}
                className={`flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-2 pr-4 text-sm font-medium transition ${
                  active ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 bg-white text-neutral-600 hover:border-brand-red hover:text-brand-red"
                }`}
              >
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt="" className="h-7 w-7 rounded-full bg-white object-contain" />
                ) : (
                  <span className="h-7 w-7 rounded-full bg-neutral-100" />
                )}
                {c.name}
              </button>
            );
          })}
        </div>

        {(showDeals || isAllTab) && (
          <div className="mt-5">
            {isAllTab && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Deals</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {deals?.map((d) => (
                <button
                  key={d.id}
                  onClick={() => openDeal(d)}
                  className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition hover:border-brand-red hover:shadow-md"
                >
                  <div className="relative aspect-[4/3] w-full bg-neutral-100">
                    {d.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.image} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-brand-red px-2 py-0.5 text-[10px] font-bold uppercase text-white">Deal</span>
                  </div>
                  <div className="flex flex-1 flex-col p-2.5">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-900">{d.name}</p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="text-sm font-semibold text-brand-red">{formatPaisa(d.dealPrice)}</span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white"><PlusIcon size={11} /></span>
                    </div>
                  </div>
                </button>
              ))}
              {showDeals && deals?.length === 0 && <p className="col-span-full py-8 text-center text-sm text-neutral-400">No deals available at this branch.</p>}
            </div>
          </div>
        )}

        {!showDeals && (
          <div className="mt-5">
            {isAllTab && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Products</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {visibleProducts.map((p) => {
                const available = p.branchAvailability.find((a) => a.branchId === branchId)?.isAvailable ?? false;
                const image = p.images.find((i) => i.isPrimary)?.url ?? p.images[0]?.url;
                return (
                  <button
                    key={p.id}
                    onClick={() => available && openProduct(p)}
                    disabled={!available}
                    className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition hover:border-brand-red hover:shadow-md disabled:cursor-not-allowed disabled:hover:border-neutral-200 disabled:hover:shadow-none"
                  >
                    <div className="relative aspect-[4/3] w-full bg-neutral-100">
                      {image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt="" className={`h-full w-full object-cover transition duration-300 group-hover:scale-105 ${available ? "" : "opacity-40 grayscale"}`} />
                      )}
                      {p.discountPrice != null && available && (
                        <span className="absolute left-2 top-2 rounded-md bg-brand-red px-2 py-0.5 text-[10px] font-bold uppercase text-white">Sale</span>
                      )}
                      {!available && (
                        <span className="absolute inset-x-0 bottom-0 bg-neutral-900/70 py-1 text-center text-[11px] font-medium text-white">Unavailable at this branch</span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-2.5">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-900">{p.name}</p>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        {p.discountPrice != null ? (
                          <span className="text-sm">
                            <span className="font-semibold text-brand-red">{formatPaisa(p.discountPrice)}</span>{" "}
                            <span className="text-xs text-neutral-400 line-through">{formatPaisa(p.basePrice)}</span>
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-brand-red">{formatPaisa(p.basePrice)}</span>
                        )}
                        {available && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white"><PlusIcon size={11} /></span>}
                      </div>
                    </div>
                  </button>
                );
              })}
              {visibleProducts.length === 0 && <p className="col-span-full py-8 text-center text-sm text-neutral-400">No products match.</p>}
            </div>
          </div>
        )}
      </div>

      {/* ======================= ORDER PANEL ======================= */}
      <div className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[400px]">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm lg:max-h-[calc(100vh-2rem)]">
          {lastResult ? (
            <div className="overflow-y-auto p-5">
              <div className="flex flex-col items-center text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600"><FaCheck size={20} /></span>
                <h2 className="mt-3 font-semibold text-neutral-900">{lastResult.isAmendment ? "Items Added to Bill" : "Order Placed"}</h2>
                <p className="mt-1 text-2xl font-semibold text-brand-red">{lastResult.orderNumber}</p>
                <p className="mt-1 text-sm text-neutral-600">{lastResult.isAmendment ? "New bill total" : "Total"} {formatPaisa(lastResult.grandTotal)}</p>
                {lastResult.type !== "DINE_IN" && (
                  <span
                    className={`mt-2 rounded-full px-3 py-0.5 text-xs font-medium ${lastResult.paymentStatus === "PAID" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}
                  >
                    Payment {lastResult.paymentStatus}
                  </span>
                )}
              </div>

              {lastResult.cashTendered != null && (
                <div className="mt-4 rounded-xl bg-green-50 p-3 text-center">
                  <p className="text-xs text-green-700">Cash received {formatPaisa(lastResult.cashTendered)}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-green-700">Change to return</p>
                  <p className="text-3xl font-bold text-green-700">{formatPaisa(lastResult.changeDue ?? 0)}</p>
                </div>
              )}

              {lastResult.type === "DINE_IN" ? (
                <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                  {lastResult.isAmendment
                    ? "The table's bill has been updated. Collect payment from the bill when the guest is ready."
                    : "Table is open and unpaid. Tap the table on the floor view whenever the guest asks for the bill to collect payment."}
                </p>
              ) : (
                lastResult.paymentStatus === "PENDING" && (
                  <button onClick={confirmCardPayment} className="mt-4 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">
                    Confirm Card/QR Payment Received
                  </button>
                )
              )}

              <div className="mt-4 space-y-2">
                {lastResult.type !== "DINE_IN" && (
                  <button onClick={() => router.push(`/pos/receipt/${lastResult.id}`)} className="block w-full rounded-lg border border-neutral-300 py-2.5 text-center text-sm font-medium hover:border-brand-red hover:text-brand-red">
                    Print Customer Receipt
                  </button>
                )}
                <button
                  onClick={() => router.push(`/pos/kitchen-ticket/${lastResult.id}${lastResult.isAmendment && lastResult.latestRevisionId ? `?revisionId=${lastResult.latestRevisionId}` : ""}`)}
                  className="block w-full rounded-lg border border-neutral-300 py-2.5 text-center text-sm font-medium hover:border-brand-red hover:text-brand-red"
                >
                  {lastResult.isAmendment ? "Print Additional Kitchen Ticket" : "Print Kitchen Ticket"}
                </button>
              </div>

              {lastResult.isAmendment && amendOrderId && (
                <button onClick={() => setLastResult(null)} className="mt-4 w-full rounded-lg bg-brand-red py-3 text-sm font-semibold text-white hover:opacity-90">
                  Back to Table Bill
                </button>
              )}
              <button
                onClick={resetForNewOrder}
                className={`mt-3 w-full rounded-lg py-3 text-sm font-semibold ${lastResult.isAmendment && amendOrderId ? "border border-neutral-300 text-neutral-600 hover:border-brand-red hover:text-brand-red" : "bg-brand-red text-white hover:opacity-90"}`}
              >
                Start New Order
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <FaCartShopping size={15} className="text-brand-red" />
                  <h2 className="font-semibold text-neutral-900">{amendOrderId ? "Table Bill" : "Current Order"}</h2>
                  {cartCount > 0 && <span className="rounded-full bg-brand-red px-2 py-0.5 text-xs font-semibold text-white">{cartCount}</span>}
                </div>
                {cart.length > 0 && (
                  <button onClick={() => setCart([])} className="text-xs font-medium text-neutral-400 hover:text-red-600">Clear all</button>
                )}
              </div>

              {/* Scrollable body: bill / customer + items */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {amendOrderId && (
                  <div className="mb-4">
                    <TableBillPanel orderId={amendOrderId} hasNewItems={cart.length > 0} onChanged={refreshFloor} onDone={resetForNewOrder} />
                    <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Add more items</p>
                  </div>
                )}

                {!amendOrderId && orderType === "DELIVERY" && (
                  <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${customerName.trim() && customerPhone.trim() ? "bg-neutral-50 text-neutral-600" : "bg-red-50 text-red-700"}`}>
                    {customerName.trim() && customerPhone.trim() ? (
                      <>Deliver to <span className="font-semibold text-neutral-900">{customerName}</span> · {customerPhone}</>
                    ) : (
                      "Add the customer's name and phone in the delivery form."
                    )}
                  </div>
                )}

                {!amendOrderId && orderType !== "DELIVERY" && (
                  <div className="mb-3">
                    {!showCustomerFields ? (
                      <button onClick={() => setCustomerOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-red hover:underline">
                        <FaUserPlus size={12} /> Add customer details (optional)
                      </button>
                    ) : (
                      <div className="rounded-xl border border-neutral-200 p-3">
                        <div className="mb-2.5 flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Customer</p>
                          {!foundCustomer && !customerPhone && !customerName && !customerEmail && (
                            <button onClick={() => setCustomerOpen(false)} className="text-xs text-neutral-400 hover:text-neutral-700">Hide</button>
                          )}
                        </div>
                        {renderCustomerForm({ required: false, delivery: false })}
                      </div>
                    )}
                  </div>
                )}

                {cart.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-300"><FaCartShopping size={22} /></span>
                    <p className="mt-3 text-sm font-medium text-neutral-500">{amendOrderId ? "No new items" : "No items yet"}</p>
                    <p className="text-xs text-neutral-400">Tap a product to add it{amendOrderId ? " to this table's bill" : " to the order"}.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cart.map((l) => (
                      <div key={l.key} className="rounded-xl border border-neutral-200 p-2.5 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-neutral-900">{l.name}</p>
                            {l.kind === "product" && l.choices.length > 0 && <p className="text-xs text-neutral-500">{l.choices.map((c) => c.name).join(", ")}</p>}
                            {l.kind === "product" && l.addons.length > 0 && <p className="text-xs text-neutral-500">+ {l.addons.map((a) => `${a.name} x${a.quantity}`).join(", ")}</p>}
                            {l.kind === "deal" && <p className="text-xs text-neutral-500">{l.slots.map((s) => s.productName).join(" + ")}</p>}
                            {l.kind === "product" && l.specialInstructions && <p className="text-xs italic text-amber-700">{l.specialInstructions}</p>}
                          </div>
                          <span className="shrink-0 font-semibold text-neutral-900">{formatPaisa(lineTotal(l))}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300">
                            <button onClick={() => changeQty(l.key, -1)} aria-label="Decrease quantity" className="flex h-7 w-7 items-center justify-center text-neutral-600 hover:bg-neutral-50"><MinusIcon size={10} /></button>
                            <span className="w-7 text-center text-xs font-semibold">{l.quantity}</span>
                            <button onClick={() => changeQty(l.key, 1)} aria-label="Increase quantity" className="flex h-7 w-7 items-center justify-center text-neutral-600 hover:bg-neutral-50"><PlusIcon size={10} /></button>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => editLine(l)} aria-label="Edit item" className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-brand-red"><FaPenToSquare size={12} /></button>
                            <button onClick={() => removeLine(l.key)} aria-label="Remove item" className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"><FaTrashCan size={12} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pinned footer: discounts, totals, payment, place order */}
              <div className="border-t border-neutral-200 bg-neutral-50/60 px-4 py-3">
                {amendOrderId ? (
                  <>
                    {cart.length > 0 && (
                      <p className="mb-2 flex justify-between text-sm text-neutral-600">
                        <span>New items (before tax)</span>
                        <span className="font-semibold text-neutral-900">{formatPaisa(subtotal)}</span>
                      </p>
                    )}
                    <button
                      onClick={placeOrder}
                      disabled={placing || cart.length === 0}
                      className="w-full rounded-xl bg-brand-red py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                    >
                      {placing ? "Adding..." : "Add These Items to the Bill"}
                    </button>
                  </>
                ) : (
                  <>
                    {showCouponField ? (
                      <div className="flex gap-2">
                        <input
                          placeholder="Coupon code"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          disabled={!!appliedCoupon}
                          className={fieldClass}
                        />
                        {appliedCoupon ? (
                          <button onClick={removeCoupon} className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium hover:border-red-300 hover:text-red-600">Remove</button>
                        ) : (
                          <button onClick={applyCoupon} disabled={couponChecking || cart.length === 0} className="shrink-0 rounded-lg bg-brand-red px-4 text-sm font-semibold text-white disabled:opacity-50">
                            {couponChecking ? "..." : "Apply"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => setCouponOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-red hover:underline">
                        <FaTicket size={12} /> Have a coupon?
                      </button>
                    )}
                    {quote?.couponError && appliedCoupon && <p className="mt-1 text-xs text-red-600">{quote.couponError}</p>}

                    {loyaltyEnabled && foundCustomer && (foundCustomer.loyaltyAccount?.pointsBalance ?? 0) > 0 && (
                      <div className="mt-2.5">
                        <p className="text-xs font-medium text-neutral-500">Redeem loyalty points (max {foundCustomer.loyaltyAccount!.pointsBalance})</p>
                        <input
                          type="number"
                          min={0}
                          max={foundCustomer.loyaltyAccount!.pointsBalance}
                          value={loyaltyRedeem}
                          onChange={(e) => setLoyaltyRedeem(Math.max(0, Math.min(foundCustomer.loyaltyAccount!.pointsBalance, Number(e.target.value))))}
                          className={`mt-1 ${fieldClass}`}
                        />
                      </div>
                    )}

                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between text-neutral-600"><span>Subtotal</span><span>{formatPaisa(quote?.subtotal ?? subtotal)}</span></div>
                      {quote && quote.taxAmount > 0 && (
                        <div className="flex justify-between text-neutral-600"><span>Tax ({quote.taxPct}%)</span><span>{formatPaisa(quote.taxAmount)}</span></div>
                      )}
                      {quote && quote.deliveryFee > 0 && (
                        <div className="flex justify-between text-neutral-600"><span>Delivery fee</span><span>{formatPaisa(quote.deliveryFee)}</span></div>
                      )}
                      {quote && quote.couponDiscountAmount > 0 && (
                        <div className="flex justify-between text-green-700"><span>Coupon{appliedCoupon ? ` (${appliedCoupon.code})` : ""}</span><span>-{formatPaisa(quote.couponDiscountAmount)}</span></div>
                      )}
                      {quote && quote.loyaltyDiscountAmount > 0 && (
                        <div className="flex justify-between text-green-700"><span>Loyalty points</span><span>-{formatPaisa(quote.loyaltyDiscountAmount)}</span></div>
                      )}
                      <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold text-neutral-900">
                        <span>Total due</span>
                        <span className="text-brand-red">{formatPaisa(total)}</span>
                      </div>
                    </div>

                    {isDineIn ? (
                      <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-neutral-500 ring-1 ring-neutral-200">
                        Dine-in is paid at the end of the meal — place the order now, then tap the table to collect payment (cash, card or QR, split if needed).
                      </p>
                    ) : (
                      <div className="mt-3">
                        <div className="grid grid-cols-3 gap-2">
                          {(["CASH", "CARD", "QR"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setPaymentMethod(m)}
                              className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2 text-xs font-medium transition ${
                                paymentMethod === m ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                              }`}
                            >
                              {m === "CASH" && <CashIcon size={20} />}
                              {m === "CARD" && <CardIcon size={20} />}
                              {m === "QR" && <QrIcon size={20} />}
                              {m === "CASH" ? "Cash" : m === "CARD" ? "Card" : "QR"}
                            </button>
                          ))}
                        </div>
                        {paymentMethod === "CASH" ? (
                          <div className="mt-2.5">
                            <input
                              type="number"
                              min={0}
                              placeholder="Cash received (Rs.)"
                              value={amountTendered}
                              onChange={(e) => setAmountTendered(e.target.value)}
                              className={fieldClass}
                            />
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {total > 0 && (
                                <button
                                  onClick={() => setAmountTendered(String(Math.ceil(total / 100)))}
                                  className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-600 hover:border-brand-red hover:text-brand-red"
                                >
                                  Exact
                                </button>
                              )}
                              {QUICK_CASH.map((amt) => (
                                <button
                                  key={amt}
                                  onClick={() => setAmountTendered(String(amt))}
                                  className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-600 hover:border-brand-red hover:text-brand-red"
                                >
                                  {amt.toLocaleString()}
                                </button>
                              ))}
                            </div>
                            {tenderedPaisa != null && total > 0 && (
                              <div className={`mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${cashShort ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                                <span>{cashShort ? "Short by" : "Change to return"}</span>
                                <span className="text-lg">{formatPaisa(cashShort ? total - (tenderedPaisa ?? 0) : changeDue)}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-neutral-500">Payment stays pending until you confirm it after the customer&apos;s card/QR is charged.</p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={placeOrder}
                      disabled={placing || !canPlace || cashShort || (cart.length > 0 && !quote)}
                      className="mt-3 w-full rounded-xl bg-brand-red py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                    >
                      {placing ? "Placing..." : `Place Order${cart.length > 0 ? ` · ${formatPaisa(total)}` : ""}`}
                    </button>
                    {cart.length > 0 && cashShort && <p className="mt-1.5 text-center text-xs text-red-600">Cash received is less than the total due.</p>}
                    {!canPlace && cart.length > 0 && (
                      <p className="mt-1.5 text-center text-xs text-neutral-400">
                        {orderType === "DINE_IN" && !tableId
                          ? "Select a table to continue."
                          : orderType === "DELIVERY" && (!customerName.trim() || !customerPhone.trim())
                            ? "Enter the customer's name and phone to continue."
                            : orderType === "DELIVERY" && !deliveryAddress.addressLine.trim()
                              ? "Enter the delivery address to continue."
                              : ""}
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {configuringProduct && (
        <ProductConfigModal
          product={configuringProduct}
          initial={editingKey ? (cart.find((l) => l.key === editingKey && l.kind === "product") as ProductCartLine | undefined) : undefined}
          onClose={() => { setConfiguringProduct(null); setEditingKey(null); }}
          onSave={addOrUpdateProductLine}
        />
      )}
      {configuringDeal && (
        <DealConfigModal
          deal={configuringDeal}
          onClose={() => { setConfiguringDeal(null); setEditingKey(null); }}
          onSave={addOrUpdateDealLine}
        />
      )}
    </div>
  );
}
