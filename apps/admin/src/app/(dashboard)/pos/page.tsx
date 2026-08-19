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
import { CashIcon, CardIcon, QrIcon } from "../../../components/pos/payment-icons";
import { MinusIcon, PlusIcon } from "../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

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
type Table = { id: string; number: string; name: string | null; status: string };
type CustomerLite = { id: string; name: string; phone: string; loyaltyAccount: { pointsBalance: number } | null };
type OpenOrder = { id: string; orderNumber: string; status: string; grandTotal: number; type: string; table: { id: string; number: string; name: string | null } | null };

type CartLine = (ProductCartLine | DealCartLine) & { key: string };

const ORDER_TYPES = ["WALK_IN", "TAKEAWAY", "DINE_IN", "DELIVERY"] as const;
const NON_TERMINAL_STATUSES = new Set(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"]);

function lineUnitTotal(line: CartLine): number {
  if (line.kind === "product") {
    return line.unitPrice + line.choices.reduce((s, c) => s + c.priceAdjustment, 0) + line.addons.reduce((s, a) => s + a.price * a.quantity, 0);
  }
  return line.dealPrice;
}
function lineTotal(line: CartLine): number {
  return lineUnitTotal(line) * line.quantity;
}
function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
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
  const [lastResult, setLastResult] = useState<{ id: string; orderNumber: string; grandTotal: number; paymentStatus: string; type: string; isAmendment: boolean; latestRevisionId?: string } | null>(null);

  // ---- Add-items-to-existing-order mode (entered automatically by selecting an occupied Dine-In table) ----
  const [amendOrderId, setAmendOrderId] = useState<string | null>(null);

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

  const { data: tables } = useQuery({
    queryKey: ["pos-tables", branchId],
    queryFn: () => api.get<Table[]>(`/tables?branchId=${branchId}`),
    enabled: !!branchId && orderType === "DINE_IN",
  });

  const { data: openOrders } = useQuery({
    queryKey: ["pos-open-orders", branchId],
    queryFn: () => api.get<OpenOrder[]>(`/staff/orders?branchId=${branchId}`),
    enabled: !!branchId && orderType === "DINE_IN",
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
    if (editingKey) {
      setCart((c) => c.map((l) => (l.key === editingKey ? { ...line, key: editingKey } : l)));
    } else {
      setCart((c) => [...c, { ...line, key: `p-${Date.now()}-${Math.random()}` }]);
    }
    setConfiguringProduct(null);
    setEditingKey(null);
  }
  function addOrUpdateDealLine(line: DealCartLine) {
    if (editingKey) {
      setCart((c) => c.map((l) => (l.key === editingKey ? { ...line, key: editingKey } : l)));
    } else {
      setCart((c) => [...c, { ...line, key: `d-${Date.now()}-${Math.random()}` }]);
    }
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

  async function lookupCustomer() {
    if (!customerPhone.trim()) return;
    try {
      const results = await api.get<CustomerLite[]>(`/staff/customers?search=${encodeURIComponent(customerPhone.trim())}`);
      setCustomerSearchResults(results);
      const exact = results.find((r) => r.phone === customerPhone.trim());
      if (exact) selectCustomer(exact);
    } catch {
      setCustomerSearchResults([]);
    }
  }
  function selectCustomer(c: CustomerLite) {
    setFoundCustomer(c);
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerSearchResults([]);
    setLoyaltyRedeem(0);
  }
  function clearCustomer() {
    setFoundCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
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

  function resetForNewOrder() {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setFoundCustomer(null);
    setTableId("");
    setDeliveryAddress({ city: "", area: "", addressLine: "", landmark: "" });
    setCouponInput("");
    setAppliedCoupon(null);
    setLoyaltyRedeem(0);
    setAmountTendered("");
    setLastResult(null);
    setAmendOrderId(null);
    setIdempotencyKey(newIdempotencyKey());
    void queryClient.invalidateQueries({ queryKey: ["pos-tables"] });
    void queryClient.invalidateQueries({ queryKey: ["pos-open-orders"] });
  }

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
      } else {
        const result = await api.post<{ id: string; orderNumber: string; grandTotal: number; paymentStatus: string; type: string }>("/pos/orders", {
          branchId,
          type: orderType,
          tableId: orderType === "DINE_IN" ? tableId : undefined,
          customerId: foundCustomer?.id,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          deliveryAddress: orderType === "DELIVERY" ? deliveryAddress : undefined,
          items: buildItems(),
          couponCode: appliedCoupon?.code,
          loyaltyPointsToRedeem: loyaltyEnabled ? loyaltyRedeem || undefined : undefined,
          paymentMethod,
          amountTendered: paymentMethod === "CASH" && amountTendered.trim() ? Math.round(Number(amountTendered) * 100) : undefined,
          idempotencyKey,
        });
        setLastResult({ id: result.id, orderNumber: result.orderNumber, grandTotal: result.grandTotal, paymentStatus: result.paymentStatus, type: result.type, isAmendment: false });
        setCart([]);
      }
      void queryClient.invalidateQueries({ queryKey: ["pos-tables"] });
      void queryClient.invalidateQueries({ queryKey: ["pos-open-orders"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not place order");
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

  // A table that's Occupied with no auto-detected order (e.g. stale status left over from a
  // cancelled/completed order made outside the normal flow) must never silently get a second,
  // conflicting new order — reset it from the Tables page first.
  const selectedTableBlocked = orderType === "DINE_IN" && !!tableId && !amendOrderId && tables?.find((t) => t.id === tableId)?.status === "OCCUPIED";
  const canPlace =
    cart.length > 0 &&
    !!branchId &&
    (orderType !== "DINE_IN" || !!tableId) &&
    !selectedTableBlocked &&
    (orderType !== "DELIVERY" || !!deliveryAddress.addressLine);

  if (!branchId && branches.length > 1) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
        <p className="text-sm font-medium text-neutral-700">Select a branch above to start a POS order</p>
        <p className="mt-1 text-xs text-neutral-400">You have access to {branches.length} branches. Pick one from the switcher in the header.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">Point of Sale</h1>
        </div>

        {amendOrderId && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span>
              {(() => {
                const o = openOrders?.find((x) => x.id === amendOrderId);
                const tableLabel = o?.table ? `${o.table.name ?? `Table ${o.table.number}`} already has an open order — adding` : "Adding";
                return `${tableLabel} items to an existing order: order type, customer, and payment are unchanged.`;
              })()}
            </span>
            <button onClick={() => { setAmendOrderId(null); setTableId(""); }} className="font-medium underline">Cancel</button>
          </div>
        )}

        {!amendOrderId && (
          <div className="mt-3 flex flex-wrap gap-2">
            {ORDER_TYPES.map((t) => (
              <button key={t} onClick={() => setOrderType(t)} className={`rounded-full border px-4 py-1.5 text-sm ${orderType === t ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-300"}`}>
                {t.replace("_", " ")}
              </button>
            ))}
          </div>
        )}

        {!amendOrderId && orderType === "DINE_IN" && (
          <Select
            value={tableId || undefined}
            onValueChange={(id) => {
              setTableId(id);
              // The table's own status is the source of truth for "is this table in use" — not
              // merely "does some non-terminal order happen to reference this table id," which can
              // go stale (e.g. an old test/demo order left in PREPARING forever after the table
              // itself was already freed). Only auto-route into amend mode when the table itself
              // is genuinely Occupied right now.
              if (tables?.find((t) => t.id === id)?.status !== "OCCUPIED") return;
              const existingOrder = openOrders?.find((o) => o.table?.id === id && NON_TERMINAL_STATUSES.has(o.status));
              if (existingOrder) {
                setAmendOrderId(existingOrder.id);
                setCart([]);
              }
            }}
          >
            <SelectTrigger className="mt-3 w-full sm:w-72"><SelectValue placeholder="Select table" /></SelectTrigger>
            <SelectContent>
              {tables?.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name ?? `T${t.number}`} {t.status === "OCCUPIED" ? "(Occupied — tap to view/add to its order)" : t.status !== "AVAILABLE" ? `(${t.status})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selectedTableBlocked && (
          <p className="mt-1.5 text-xs text-red-600">
            This table is marked Occupied but has no open order — free it from the Tables page before starting a new order here.
          </p>
        )}

        {!amendOrderId && orderType === "DELIVERY" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input placeholder="City" value={deliveryAddress.city} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, city: e.target.value })} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
            <input placeholder="Area" value={deliveryAddress.area} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, area: e.target.value })} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
            <input placeholder="Address" value={deliveryAddress.addressLine} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, addressLine: e.target.value })} className="col-span-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
            <input placeholder="Landmark (optional)" value={deliveryAddress.landmark} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, landmark: e.target.value })} className="col-span-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search products by name..."
            className="min-w-[200px] flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <label className="flex items-center gap-1.5 text-xs text-neutral-600">
            <input type="checkbox" checked={discountedOnly} onChange={(e) => setDiscountedOnly(e.target.checked)} className="accent-brand-red" />
            Discounted only
          </label>
        </div>

        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
          <button
            onClick={() => { setShowDeals(false); setSelectedCategoryId(""); }}
            className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 p-1.5 ${!showDeals && !selectedCategoryId ? "border-brand-red bg-red-50" : "border-neutral-200 bg-white"}`}
          >
            <span className="text-xs font-medium text-neutral-700">All</span>
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
                title={c.name}
                aria-label={c.name}
                className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 p-1.5 ${active ? "border-brand-red bg-red-50" : "border-neutral-200 bg-white"}`}
              >
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt={c.name} className="h-11 w-11 object-contain" />
                ) : (
                  <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-neutral-700">{c.name}</span>
                )}
              </button>
            );
          })}
        </div>

        {(showDeals || isAllTab) && (
          <div className="mt-4">
            {isAllTab && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Deals</p>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {deals?.map((d) => (
                <button
                  key={d.id}
                  onClick={() => openDeal(d)}
                  className="flex items-center gap-3 overflow-hidden rounded-lg border border-neutral-200 bg-white p-2 text-left text-sm hover:border-brand-red"
                >
                  {d.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-neutral-100" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-sm text-brand-red">{formatPaisa(d.dealPrice)}</p>
                  </div>
                </button>
              ))}
              {showDeals && deals?.length === 0 && <p className="col-span-full text-sm text-neutral-400">No deals available at this branch.</p>}
            </div>
          </div>
        )}

        {!showDeals && (
          <div className="mt-4">
            {isAllTab && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Products</p>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleProducts.map((p) => {
                const available = p.branchAvailability.find((a) => a.branchId === branchId)?.isAvailable ?? false;
                const image = p.images.find((i) => i.isPrimary)?.url ?? p.images[0]?.url;
                return (
                  <button
                    key={p.id}
                    onClick={() => available && openProduct(p)}
                    disabled={!available}
                    className="flex items-center gap-3 overflow-hidden rounded-lg border border-neutral-200 bg-white p-2 text-left text-sm hover:border-brand-red disabled:opacity-40"
                  >
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="h-14 w-14 shrink-0 rounded-lg bg-neutral-100" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      {p.discountPrice != null ? (
                        <p className="text-sm">
                          <span className="text-neutral-400 line-through">{formatPaisa(p.basePrice)}</span>{" "}
                          <span className="font-medium text-brand-red">{formatPaisa(p.discountPrice)}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-brand-red">{formatPaisa(p.basePrice)}</p>
                      )}
                      {!available && <p className="text-xs text-neutral-400">Unavailable at this branch</p>}
                    </div>
                  </button>
                );
              })}
              {visibleProducts.length === 0 && <p className="col-span-full text-sm text-neutral-400">No products match.</p>}
            </div>
          </div>
        )}
      </div>

      <div className="w-96 shrink-0">
        <div className="sticky top-4 rounded-xl border border-neutral-200 bg-white p-4">
          {lastResult ? (
            <div>
              <h2 className="font-semibold text-neutral-900">{lastResult.isAmendment ? "Items Added" : "Order Placed"}</h2>
              <p className="mt-1 text-lg font-semibold text-brand-red">{lastResult.orderNumber}</p>
              <p className="text-sm text-neutral-600">Total: {formatPaisa(lastResult.grandTotal)} · Payment: {lastResult.paymentStatus}</p>

              {lastResult.type === "DINE_IN" ? (
                <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                  Table is open and unpaid. Payment is collected later when the customer requests the bill — open the table from the Tables page to record payment.
                </p>
              ) : (
                lastResult.paymentStatus === "PENDING" && (
                  <button onClick={confirmCardPayment} className="mt-3 w-full rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white">
                    Confirm Card/QR Payment Received
                  </button>
                )
              )}

              <div className="mt-3 space-y-2">
                {lastResult.type !== "DINE_IN" && (
                  <button onClick={() => router.push(`/pos/receipt/${lastResult.id}`)} className="block w-full rounded-lg border border-neutral-300 py-2 text-center text-sm hover:border-brand-red">
                    {lastResult.isAmendment ? "Print Updated Customer Receipt" : "Print Customer Receipt"}
                  </button>
                )}
                <button
                  onClick={() => router.push(`/pos/kitchen-ticket/${lastResult.id}${lastResult.isAmendment && lastResult.latestRevisionId ? `?revisionId=${lastResult.latestRevisionId}` : ""}`)}
                  className="block w-full rounded-lg border border-neutral-300 py-2 text-center text-sm hover:border-brand-red"
                >
                  {lastResult.isAmendment ? "Print Additional Kitchen Ticket" : "Print Kitchen Ticket"}
                </button>
              </div>

              <button onClick={resetForNewOrder} className="mt-3 w-full rounded-lg bg-brand-red py-2.5 text-sm font-semibold text-white">
                New Order
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-semibold text-neutral-900">{amendOrderId ? "Additional Items" : "Current Order"}</h2>

              {!amendOrderId && (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <input
                      placeholder="Customer phone (optional)"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      onBlur={lookupCustomer}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                    />
                    {customerSearchResults.length > 0 && !foundCustomer && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-lg">
                        {customerSearchResults.map((c) => (
                          <button key={c.id} onClick={() => selectCustomer(c)} className="block w-full px-3 py-2 text-left text-xs hover:bg-neutral-50">
                            {c.name} · {c.phone}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {foundCustomer ? (
                    <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                      <span>
                        {foundCustomer.name} · {foundCustomer.loyaltyAccount?.pointsBalance ?? 0} pts
                      </span>
                      <button onClick={clearCustomer} className="underline">Clear</button>
                    </div>
                  ) : (
                    <input placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
                  )}
                </div>
              )}

              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {cart.map((l) => (
                  <div key={l.key} className="rounded-lg border border-neutral-100 p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{l.name}</p>
                        {l.kind === "product" && l.choices.length > 0 && <p className="text-xs text-neutral-400">{l.choices.map((c) => c.name).join(", ")}</p>}
                        {l.kind === "product" && l.addons.length > 0 && <p className="text-xs text-neutral-400">+ {l.addons.map((a) => `${a.name} x${a.quantity}`).join(", ")}</p>}
                        {l.kind === "deal" && <p className="text-xs text-neutral-400">{l.slots.map((s) => s.productName).join(" + ")}</p>}
                        {l.kind === "product" && l.specialInstructions && <p className="text-xs italic text-amber-700">{l.specialInstructions}</p>}
                      </div>
                      <span className="shrink-0 font-medium">{formatPaisa(lineTotal(l))}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => changeQty(l.key, -1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100"><MinusIcon size={10} /></button>
                        <span className="w-5 text-center text-xs">{l.quantity}</span>
                        <button onClick={() => changeQty(l.key, 1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100"><PlusIcon size={10} /></button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <button onClick={() => editLine(l)} className="text-brand-red">Edit</button>
                        <button onClick={() => removeLine(l.key)} className="text-neutral-400">Remove</button>
                      </div>
                    </div>
                  </div>
                ))}
                {cart.length === 0 && <p className="text-sm text-neutral-400">No items yet.</p>}
              </div>

              {!amendOrderId && (
                <>
                  <div className="mt-3 flex gap-2">
                    <input
                      placeholder="Coupon code"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      disabled={!!appliedCoupon}
                      className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:bg-neutral-50"
                    />
                    {appliedCoupon ? (
                      <button onClick={removeCoupon} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">Remove</button>
                    ) : (
                      <button onClick={applyCoupon} disabled={couponChecking || cart.length === 0} className="rounded-lg bg-brand-red px-3 py-1.5 text-sm text-white disabled:opacity-50">
                        {couponChecking ? "..." : "Apply"}
                      </button>
                    )}
                  </div>
                  {appliedCoupon && <p className="mt-1 text-xs text-green-700">{appliedCoupon.code}: -{formatPaisa(appliedCoupon.discountAmount)}</p>}

                  {loyaltyEnabled && foundCustomer && (foundCustomer.loyaltyAccount?.pointsBalance ?? 0) > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-neutral-500">Redeem Loyalty Points (max {foundCustomer.loyaltyAccount!.pointsBalance})</p>
                      <input
                        type="number"
                        min={0}
                        max={foundCustomer.loyaltyAccount!.pointsBalance}
                        value={loyaltyRedeem}
                        onChange={(e) => setLoyaltyRedeem(Math.max(0, Math.min(foundCustomer.loyaltyAccount!.pointsBalance, Number(e.target.value))))}
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="mt-3 flex justify-between border-t pt-2 font-semibold">
                <span>Subtotal</span>
                <span>{formatPaisa(subtotal)}</span>
              </div>
              <p className="text-xs text-neutral-400">Tax and final total confirmed when the order is placed.</p>

              {!amendOrderId && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-neutral-500">Payment Method</p>
                  <div className="mt-1 flex gap-2">
                    {(["CASH", "CARD", "QR"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setPaymentMethod(m)}
                        className={`flex flex-1 flex-col items-center gap-1 rounded-lg border py-2 text-xs ${paymentMethod === m ? "border-brand-red bg-red-50 text-brand-red" : "border-neutral-300"}`}
                      >
                        {m === "CASH" && <CashIcon size={22} />}
                        {m === "CARD" && <CardIcon size={22} />}
                        {m === "QR" && <QrIcon size={22} />}
                        {m}
                      </button>
                    ))}
                  </div>
                  {paymentMethod === "CASH" && (
                    <input
                      type="number"
                      placeholder="Cash received (Rs.)"
                      value={amountTendered}
                      onChange={(e) => setAmountTendered(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                    />
                  )}
                  {paymentMethod !== "CASH" && (
                    <p className="mt-2 text-xs text-neutral-400">Payment stays pending until confirmed after the customer's card/QR is charged.</p>
                  )}
                </div>
              )}

              <button onClick={placeOrder} disabled={placing || !canPlace} className="mt-3 w-full rounded-lg bg-brand-red py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {placing ? "Placing..." : amendOrderId ? "Add These Items" : "Place Order"}
              </button>
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
