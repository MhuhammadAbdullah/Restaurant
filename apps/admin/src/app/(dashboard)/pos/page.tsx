"use client";

import { LoadingDots } from "../../../components/LoadingDots";
import { SearchInput } from "../../../components/SearchFilterBar";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { effectivePrice, formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useSelectedBranch } from "../../../lib/useSelectedBranch";
import { TipPicker } from "../../../components/pos/TipPicker";
import { ProductConfigModal, type ProductDetail, type ProductCartLine } from "../../../components/pos/ProductConfigModal";
import { DealConfigModal, type Deal, type DealCartLine } from "../../../components/pos/DealConfigModal";
import { TableBillPanel } from "../../../components/pos/TableBillPanel";
import { PaymentModal, type PaymentChoice } from "../../../components/pos/PaymentModal";
import { PrintDialog, type PrintChoice } from "../../../components/pos/PrintDialog";
import { ActiveOrdersDrawer, useActiveOrders } from "../../../components/pos/ActiveOrdersDrawer";
import { hasPermission, useMe } from "../../../lib/useMe";
import { CloseIcon, MinusIcon, PlusIcon } from "../../../components/icons";
import { AreaCombobox } from "../../../components/pos/AreaCombobox";
import {
  FaBoxOpen,
  FaCartShopping,
  FaCheck,
  FaChair,
  FaClipboardList,
  FaStore,
  FaMagnifyingGlass,
  FaMotorcycle,
  FaPenToSquare,
  FaTag,
  FaTicket,
  FaTrashCan,
  FaUserPlus,
  FaUtensils,
  FaCashRegister,
} from "react-icons/fa6";

type Category = { id: string; name: string; image: string | null; status: "ACTIVE" | "INACTIVE"; sortOrder: number };
type ProductListItem = Pick<ProductDetail, "choiceGroups" | "addons"> & {
  id: string;
  categoryId: string;
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
/** What the phone lookup returns: the customer plus the delivery addresses saved for them. */
type SavedAddress = { id: string; label: string; city: string; area: string; addressLine: string; landmark: string | null; contactNumber: string | null; isDefault: boolean };
type LookupCustomer = { id: string; name: string; phone: string; email: string | null; isGuest: boolean; loyaltyPoints: number; addresses: SavedAddress[] };
type Quote = {
  subtotal: number;
  taxPct: number;
  taxAmount: number;
  deliveryFee: number;
  couponDiscountAmount: number;
  couponError?: string;
  loyaltyDiscountAmount: number;
  roundOff?: number;
  grandTotal: number;
};

type CartLine = (ProductCartLine | DealCartLine) & { key: string };

const ORDER_TYPES = ["TAKEAWAY", "DINE_IN", "DELIVERY"] as const;
const ORDER_TYPE_META: Record<(typeof ORDER_TYPES)[number], { label: string; icon: (p: { size?: number }) => React.ReactElement }> = {
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
/** Shown while the menu is still loading, so the screen is never just blank or "No products match". */
function PosLoading() {
  return (
    <div className="col-span-full flex flex-col items-center gap-3 py-12" role="status" aria-live="polite">
      <span className="h-9 w-9 animate-spin rounded-full border-4 border-brand-red/20 border-t-brand-red" aria-hidden="true" />
      <span className="text-sm text-neutral-500"><LoadingDots>Loading menu</LoadingDots></span>
    </div>
  );
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
  const { branchId, branches, setBranchId, ready: branchesReady } = useSelectedBranch();
  const { data: me } = useMe();
  const canSeeOrders = hasPermission(me, "orders.view,pos.access");
  const { data: activeOrders } = useActiveOrders(branchId ?? "", canSeeOrders);

  // ---- Order setup ----
  const [orderType, setOrderType] = useState<(typeof ORDER_TYPES)[number]>("TAKEAWAY");
  const [tableId, setTableId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState({ city: "", area: "", addressLine: "", landmark: "" });
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<CustomerLite | null>(null);
  const [customerSearchResults, setCustomerSearchResults] = useState<LookupCustomer[]>([]);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAltPhone, setCustomerAltPhone] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  // ---- Catalog browsing ----
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [showDeals, setShowDeals] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [discountedOnly, setDiscountedOnly] = useState(false);


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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  // The phone number of a customer just picked from the suggestions, so the list does not pop open again for it.
  const [lookupSkip, setLookupSkip] = useState<string | null>(null);
  const [tip, setTip] = useState(""); // optional tip, in rupees
  const [tipOpen, setTipOpen] = useState(false);

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
    tip?: number;
  } | null>(null);

  // ---- Add-items-to-existing-order mode (entered automatically by selecting an occupied Dine-In table) ----
  const [amendOrderId, setAmendOrderId] = useState<string | null>(null);

  // ---- UI-only toggles ----
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);
  const [tableDrawerOpen, setTableDrawerOpen] = useState(false);
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

  // The whole menu is loaded once; switching category or searching only filters that list, so it is instant.
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["pos-products", branchId],
    queryFn: () => api.get<ProductListItem[]>(`/catalog/products?branchId=${branchId}&full=true`),
    enabled: !!branchId,
    staleTime: 60_000,
  });
  const searchTerm = searchInput.trim().toLowerCase();
  const visibleProducts = useMemo(
    () =>
      (products ?? []).filter(
        (p) => (!selectedCategoryId || p.categoryId === selectedCategoryId) && (!discountedOnly || p.discountPrice != null) && (!searchTerm || p.name.toLowerCase().includes(searchTerm)),
      ),
    [products, selectedCategoryId, discountedOnly, searchTerm],
  );

  // "All" (no category, not the dedicated Deals tab) should surface deals too, not just regular
  // products — a deal is still something the cashier can ring up from that view.
  const isAllTab = !showDeals && !selectedCategoryId;
  const { data: deals, isLoading: dealsLoading } = useQuery({
    queryKey: ["pos-deals", branchId],
    queryFn: () => api.get<Deal[]>(`/deals?branchId=${branchId}`),
    enabled: !!branchId,
    staleTime: 60_000,
  });

  const dealCard = (d: Deal) => (
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
  );
  const productCard = (p: ProductListItem) => {
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
  };

  // "All" and searching show the menu grouped by category, in the same order as the category buttons above (the order set in
  // Admin > Categories), each group under its category name. A single category or the Deals button shows just that one.
  const dealsCategory = activeCategories.find((c) => c.name.toLowerCase() === "deals");
  const showGrouped = !!searchTerm || isAllTab;
  const searchGroups = useMemo(() => {
    if (!showGrouped) return [];
    const words = searchTerm.split(/\s+/).filter(Boolean);
    const matches = (name: string, category: string) => {
      const hay = `${name} ${category}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    const dealsGroup = () => {
      const ds = (deals ?? []).filter((d) => matches(d.name, dealsCategory?.name ?? "Deals"));
      return ds.length > 0 && !discountedOnly ? [{ key: "deals", name: dealsCategory?.name ?? "Deals", products: [] as ProductListItem[], deals: ds }] : [];
    };
    const out: { key: string; name: string; products: ProductListItem[]; deals: Deal[] }[] = [];
    // With no Deals category among the buttons, deals come first, as before.
    if (!dealsCategory) out.push(...dealsGroup());
    for (const c of activeCategories) {
      if (c.id === dealsCategory?.id) {
        out.push(...dealsGroup());
        continue;
      }
      const ps = (products ?? []).filter((p) => p.categoryId === c.id && (!discountedOnly || p.discountPrice != null) && matches(p.name, c.name));
      if (ps.length > 0) out.push({ key: c.id, name: c.name, products: ps, deals: [] });
    }
    return out;
  }, [showGrouped, searchTerm, products, deals, activeCategories, dealsCategory, discountedOnly]);
  function openCategory(key: string) {
    setSearchInput("");
    if (key === "deals") setShowDeals(true);
    else {
      setShowDeals(false);
      setSelectedCategoryId(key);
    }
  }

  // Floor view: every table plus the running bill of its open dine-in order.
  const { data: tables } = useQuery({
    queryKey: ["pos-tables", branchId],
    queryFn: () => api.get<TableRow[]>(`/tables/overview?branchId=${branchId}`),
    enabled: !!branchId && orderType === "DINE_IN",
    refetchInterval: 15000,
  });

  function openProduct(p: ProductListItem) {
    // The menu was loaded with every product's choices and add-ons, so this needs no request and happens on the click.
    const detail: ProductDetail = p;
    setEditingKey(null);
    // Nothing to choose (no choice sections with options, no add-ons): one click puts it straight into the Current Order.
    // Anything with choices or add-ons opens the popup to pick them.
    const needsPicking = detail.choiceGroups.some((g) => g.choiceGroup.options.some((o) => o.status === "ACTIVE")) || detail.addons.some((a) => a.addon.status === "ACTIVE");
    if (!needsPicking) {
      setCart((c) =>
        upsertLine(c, { kind: "product", productId: detail.id, name: detail.name, quantity: 1, unitPrice: effectivePrice(detail.basePrice, detail.discountPrice), choices: [], addons: [] }, null, "p"),
      );
      return;
    }
    setConfiguringProduct(detail);
  }
  function openDeal(d: Deal) {
    setEditingKey(null);
    // A deal with nothing to pick (every slot has one product, no choices, no add-ons) goes straight into the Current Order.
    const nothingToPick = d.slots.every((sl) => sl.productOptions.length === 1 && sl.choiceGroups.every((g) => g.choiceGroup.options.length === 0) && sl.addons.length === 0);
    if (nothingToPick) {
      setCart((c) =>
        upsertLine(
          c,
          {
            kind: "deal",
            dealId: d.id,
            name: d.name,
            quantity: 1,
            dealPrice: d.dealPrice,
            slots: d.slots.map((sl) => ({ dealSlotId: sl.id, slotLabel: sl.label, productId: sl.productOptions[0]!.product.id, productName: sl.productOptions[0]!.product.name, choices: [], addons: [] })),
          },
          null,
          "d",
        ),
      );
      return;
    }
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
      const cached = products?.find((x) => x.id === line.productId);
      setConfiguringProduct(cached ?? (await api.get<ProductDetail>(`/catalog/products/${line.productId}`)));
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

  useEffect(() => {
    if (!tableDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTableDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tableDrawerOpen]);
  useEffect(() => {
    if (!customerDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCustomerDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customerDrawerOpen]);

  // The address starts in the branch's own city; the area is picked from the areas set up for that city.
  const { data: publicBranches } = useQuery({ queryKey: ["branches-public"], queryFn: () => api.get<{ id: string; city: string }[]>("/branches"), staleTime: 5 * 60_000 });
  const branchCity = publicBranches?.find((b) => b.id === branchId)?.city ?? "";
  useEffect(() => {
    if (branchCity) setDeliveryAddress((cur) => (cur.city.trim() ? cur : { ...cur, city: branchCity }));
  }, [branchCity]);
  // The areas are loaded as soon as the branch is known (not when the drawer is opened) and kept for half an hour, so the
  // Area box has its list the moment it is tapped. Searching then happens on the list already here.
  const areaCity = deliveryAddress.city.trim() || branchCity;
  const { data: cityAreas, isLoading: areasLoading } = useQuery({
    queryKey: ["pos-areas", areaCity.toLowerCase()],
    queryFn: () => api.get<string[]>(`/branches/areas?city=${encodeURIComponent(areaCity)}`),
    enabled: !!areaCity,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    placeholderData: (prev) => prev,
  });

  // ---- Customer search in the drawer: the latest customers load once and are filtered as you type (instant); the server is
  // asked as well, so older customers are found too.
  const [custQuery, setCustQuery] = useState("");
  const [custRemote, setCustRemote] = useState<LookupCustomer[]>([]);
  const [custSearching, setCustSearching] = useState(false);
  const { data: recentCustomers } = useQuery({
    queryKey: ["pos-recent-customers"],
    queryFn: () => api.get<LookupCustomer[]>("/staff/customers/lookup?q="),
    enabled: customerDrawerOpen,
    staleTime: 60_000,
  });
  const custTerm = custQuery.trim().toLowerCase();
  useEffect(() => {
    if (custTerm.length < 2) {
      setCustRemote([]);
      setCustSearching(false);
      return;
    }
    let cancelled = false;
    setCustSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get<LookupCustomer[]>(`/staff/customers/lookup?q=${encodeURIComponent(custQuery.trim())}`);
        if (!cancelled) setCustRemote(r);
      } catch {
        if (!cancelled) setCustRemote([]);
      } finally {
        if (!cancelled) setCustSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [custTerm, custQuery]);
  const custResults = useMemo(() => {
    const all = recentCustomers ?? [];
    if (!custTerm) return [];
    // the same idea as the server: a number matches in any format (03XX, +92, 92...)
    let digits = custTerm.replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("92") && (custTerm.startsWith("+") || digits.length >= 11)) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    const phoneTerm = digits.length >= 3 ? digits : "";
    const local = all.filter((c) => c.name.toLowerCase().includes(custTerm) || (c.email ?? "").toLowerCase().includes(custTerm) || (!!phoneTerm && c.phone.replace(/\D/g, "").includes(phoneTerm)));
    const seen = new Set(local.map((c) => c.id));
    return [...local, ...custRemote.filter((c) => !seen.has(c.id))].slice(0, 8);
  }, [recentCustomers, custRemote, custTerm]);
  function pickFromSearch(c: LookupCustomer) {
    setCustQuery("");
    setCustRemote([]);
    setLookupSkip(null);
    selectCustomer(c, true);
  }

  // Customer lookup while the phone number is typed. Any way of writing the number finds the customer (03XX, +92, 92...); the
  // server returns the matches with their saved addresses, and the cashier picks one. Nothing is filled in until they do.
  useEffect(() => {
    const q = customerPhone.trim();
    if (foundCustomer || q === lookupSkip || q.replace(/\D/g, "").length < 4) {
      setCustomerSearchResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const results = await api.get<LookupCustomer[]>(`/staff/customers/lookup?phone=${encodeURIComponent(q)}`);
        if (!cancelled) setCustomerSearchResults(results);
      } catch {
        if (!cancelled) setCustomerSearchResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [customerPhone, foundCustomer, lookupSkip]);

  /**
   * Picking a suggestion fills the customer's details. Only boxes that are still empty are filled, so nothing the cashier has
   * already typed is overwritten; the customer's other saved addresses stay one tap away under the address heading.
   */
  function selectCustomer(c: LookupCustomer, fresh = false) {
    if (c.isGuest || c.id.startsWith("guest:")) {
      // Phone-only profile (they ordered before without an account): keep the phone, no account to attach.
      setLookupSkip(c.phone);
    } else {
      setFoundCustomer({ id: c.id, name: c.name, phone: c.phone, loyaltyAccount: { pointsBalance: c.loyaltyPoints } });
    }
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    if (fresh) setCustomerEmail(c.email ?? "");
    else if (c.email && !customerEmail.trim()) setCustomerEmail(c.email);
    setSavedAddresses(c.addresses);
    const a = c.addresses.find((x) => x.isDefault) ?? c.addresses[0];
    if (fresh) {
      setDeliveryAddress(a ? { city: a.city || branchCity, area: a.area, addressLine: a.addressLine, landmark: a.landmark ?? "" } : { city: branchCity, area: "", addressLine: "", landmark: "" });
      setCustomerAltPhone(a?.contactNumber && a.contactNumber !== c.phone ? a.contactNumber : "");
    } else if (a) {
      setDeliveryAddress((cur) => ({
        city: cur.city.trim() ? cur.city : a.city || branchCity,
        area: cur.area.trim() ? cur.area : a.area,
        addressLine: cur.addressLine.trim() ? cur.addressLine : a.addressLine,
        landmark: cur.landmark.trim() ? cur.landmark : a.landmark ?? "",
      }));
      if (a.contactNumber && a.contactNumber !== c.phone && !customerAltPhone.trim()) setCustomerAltPhone(a.contactNumber);
    }
    setCustomerSearchResults([]);
    setLoyaltyRedeem(0);
  }
  function useSavedAddress(a: SavedAddress) {
    setDeliveryAddress({ city: a.city || branchCity, area: a.area, addressLine: a.addressLine, landmark: a.landmark ?? "" });
    if (a.contactNumber && a.contactNumber !== customerPhone) setCustomerAltPhone(a.contactNumber);
  }
  function clearCustomer() {
    setFoundCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setCustomerAltPhone("");
    setSavedAddresses([]);
    setLookupSkip(null);
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
  const { data: rawQuote, isFetching: quoteFetching } = useQuery({
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
  // The last price is kept on screen while a new one is worked out, but never for an empty cart: with nothing in it there is
  // nothing to price, so no subtotal, tax or total is shown.
  const quote = cart.length > 0 ? rawQuote : undefined;

  const { data: lastAddress } = useQuery({
    queryKey: ["pos-last-address", foundCustomer?.id],
    queryFn: async () => {
      const orders = await api.get<{ deliveryAddressSnapshot: string | null; deliveryCity: string | null; deliveryArea: string | null; deliveryLandmark: string | null }[]>(
        `/staff/orders?customerId=${foundCustomer!.id}&take=15`,
      );
      return orders.find((o) => o.deliveryAddressSnapshot) ?? null;
    },
    enabled: !!foundCustomer && !foundCustomer.id.startsWith("guest:") && true,
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
    setOrderNote("");
    setNoteOpen(false);
    setTableId("");
    setDeliveryAddress({ city: branchCity, area: "", addressLine: "", landmark: "" });
    setCouponInput("");
    setAppliedCoupon(null);
    setLoyaltyRedeem(0);
    setTip("");
    setTipOpen(false);
    setSavedAddresses([]);
    setLookupSkip(null);
    setPaymentOpen(false);
    setPrintOpen(false);
    setLastResult(null);
    setAmendOrderId(null);
    setIdempotencyKey(newIdempotencyKey());
    refreshFloor();
  }

  // Dine-in bills are settled later, from the table, so no payment is taken at placement.
  const isDineIn = orderType === "DINE_IN";
  const total = quote?.grandTotal ?? Math.max(0, subtotal - (appliedCoupon?.discountAmount ?? 0));
  // Optional tip, on top of the bill (not part of the order total, reported separately).
  const tipPaisa = !isDineIn && tip.trim() && Number(tip) > 0 ? Math.round(Number(tip) * 100) : 0;
  const toCollect = total + tipPaisa;

  /** `pay` comes from the payment popup (counter orders); dine-in bills and added items are placed without one. */
  async function placeOrder(pay?: PaymentChoice) {
    if (!branchId || cart.length === 0 || placing) return;
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
        const method: "CASH" | "CARD" = isDineIn ? "CASH" : pay?.method ?? "CASH";
        const tenderedPaisa = pay?.method === "CASH" ? pay.tendered ?? null : null;
        const cashPaid = !isDineIn && method === "CASH" && tenderedPaisa != null;
        const result = await api.post<{ id: string; orderNumber: string; grandTotal: number; paymentStatus: string; type: string }>("/pos/orders", {
          branchId,
          type: orderType,
          tableId: isDineIn ? tableId : undefined,
          customerId: foundCustomer?.id,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          customerAlternatePhone: customerAltPhone.trim() || undefined,
          customerEmail: customerEmail.trim() || undefined,
          specialInstructions:
            [orderNote.trim(), deliveryNote.trim() ? (orderType === "DELIVERY" ? `Rider: ${deliveryNote.trim()}` : deliveryNote.trim()) : ""].filter(Boolean).join(" | ").slice(0, 500) || undefined,
          deliveryAddress: orderType === "DELIVERY" || (deliveryAddress.city.trim() && deliveryAddress.area.trim() && deliveryAddress.addressLine.trim()) ? deliveryAddress : undefined,
          items: buildItems(),
          couponCode: appliedCoupon?.code,
          loyaltyPointsToRedeem: loyaltyEnabled ? loyaltyRedeem || undefined : undefined,
          paymentMethod: method,
          amountTendered: cashPaid ? tenderedPaisa : undefined,
          tipAmount: tipPaisa > 0 ? tipPaisa : undefined,
          // Only vouched for when the price shown is up to date; the server prices the order itself either way.
          clientTotal: quoteFetching ? undefined : quote?.grandTotal,
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
          changeDue: cashPaid ? Math.max(0, tenderedPaisa! - result.grandTotal - tipPaisa) : undefined,
          tip: tipPaisa > 0 ? tipPaisa : undefined,
        });
        setCart([]);
        setPaymentOpen(false);
        setPrintOpen(true);
        // Load the receipts now, while the print dialog is open, so the print page already has them when a button is pressed.
        if (result.type !== "DINE_IN") void queryClient.prefetchQuery({ queryKey: ["receipt-customer", result.id], queryFn: () => api.get(`/staff/orders/${result.id}/receipt/customer`) });
        void queryClient.prefetchQuery({ queryKey: ["receipt-kitchen", result.id, undefined, false], queryFn: () => api.get(`/staff/orders/${result.id}/receipt/kitchen`) });
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

  /** Goes to the print page for the chosen slip(s); it prints straight away and comes back here. */
  function choosePrint(choice: PrintChoice) {
    if (!lastResult) return;
    const id = lastResult.id;
    setPrintOpen(false);
    router.push(choice === "customer" ? `/pos/receipt/${id}` : choice === "kitchen" ? `/pos/kitchen-ticket/${id}` : `/pos/print/${id}?parts=both`);
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
    setTableDrawerOpen(false);
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
    (orderType !== "DELIVERY" || (!!deliveryAddress.city.trim() && !!deliveryAddress.area.trim() && !!deliveryAddress.addressLine.trim() && !!customerName.trim() && !!customerPhone.trim())) &&
    // for other order types an address is optional, but a half-filled one cannot be saved
    (orderType === "DELIVERY" || !(!!deliveryAddress.area.trim() || !!deliveryAddress.addressLine.trim()) || (!!deliveryAddress.city.trim() && !!deliveryAddress.area.trim() && !!deliveryAddress.addressLine.trim()));

  if (!branchesReady) {
    return <p className="py-16 text-center text-sm text-neutral-400"><LoadingDots>Loading</LoadingDots></p>;
  }

  // With more than one branch, nothing is shown until one is chosen (a single branch is chosen automatically).
  if (!branchId && branches.length > 1) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-brand-red">
          <FaCashRegister size={28} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-neutral-900">Choose a branch to start selling</h1>
        <p className="mt-1 max-w-sm text-sm text-neutral-500">Each branch has its own menu, tables and orders. Pick the one you are working at.</p>
        <div className="mt-5 grid w-full max-w-md gap-2.5 sm:grid-cols-2">
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBranchId(b.id)}
              className="flex items-center gap-3 rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-brand-red hover:bg-brand-red/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-brand-red"><FaStore size={15} /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-neutral-900">{b.name}</span>
                <span className="block text-xs text-neutral-400">{b.code}</span>
              </span>
            </button>
          ))}
        </div>
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
        {customerSearchResults.length > 0 && !foundCustomer && (
          <div className="overflow-hidden rounded-xl border border-brand-red/30 bg-white shadow-sm">
            <p className="border-b border-neutral-100 bg-brand-red/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-red">Customers with this number: tap one to fill the details</p>
            {customerSearchResults.map((c) => (
              <button key={c.id} type="button" onClick={() => selectCustomer(c, false)} className="flex w-full items-center justify-between gap-3 border-b border-neutral-100 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-neutral-50">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-neutral-800">{c.name}{c.isGuest && <span className="ml-1.5 rounded bg-neutral-100 px-1 text-[10px] font-medium text-neutral-500">phone only</span>}</span>
                  {c.addresses[0] && <span className="block truncate text-[11px] text-neutral-400">{c.addresses[0].addressLine}</span>}
                </span>
                <span className="shrink-0 text-xs text-neutral-500">{c.phone}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const branchName = branches.find((b) => b.id === branchId)?.name;
  // A delivery order needs the customer's name and phone and a delivery address before it can be placed.
  const isDeliveryType = orderType === "DELIVERY";
  const addressComplete = !!deliveryAddress.city.trim() && !!deliveryAddress.area.trim() && !!deliveryAddress.addressLine.trim();
  // (the city alone, which starts as the branch's city, is not a half-filled address)
  const addressPartial = !addressComplete && (!!deliveryAddress.area.trim() || !!deliveryAddress.addressLine.trim());
  const deliveryReady = !!customerName.trim() && !!customerPhone.trim() && addressComplete;
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
          <div className="flex flex-wrap items-center gap-2">
          {isDineIn && (
            <button
              type="button"
              onClick={() => setTableDrawerOpen(true)}
              title={tableId ? "Change the table" : "Select a table"}
              className={`relative inline-flex max-w-[260px] items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-sm font-medium transition focus:outline-none ${
                tableId ? "border-neutral-300 text-neutral-700 hover:border-brand-red hover:text-brand-red" : "border-red-300 text-red-700 hover:border-brand-red"
              }`}
            >
              <FaChair size={14} className="shrink-0" />
              <span className="truncate">{selectedTable ? `Table ${selectedTable.name ?? selectedTable.number}` : tableId ? "Table selected" : "Select table"}</span>
              {amendOrderId && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Open bill</span>}
              {!tableId && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="A table is needed" />}
            </button>
          )}
          {!amendOrderId && (
            <button
              type="button"
              onClick={() => setCustomerDrawerOpen(true)}
              title={customerName.trim() || customerPhone.trim() ? "Edit the customer details" : "Add customer details"}
              className={`relative inline-flex max-w-[260px] items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-sm font-medium transition focus:outline-none ${
                isDeliveryType && !deliveryReady ? "border-red-300 text-red-700 hover:border-brand-red" : "border-neutral-300 text-neutral-700 hover:border-brand-red hover:text-brand-red"
              }`}
            >
              <FaUserPlus size={14} className="shrink-0" />
              <span className="truncate">{customerName.trim() || customerPhone.trim() || (isDeliveryType ? "Customer & address" : "Add customer")}</span>
              {isDeliveryType && !deliveryReady && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Details needed" />}
            </button>
          )}
          {canSeeOrders && branchId && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="relative inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 transition hover:border-brand-red hover:text-brand-red"
            >
              <FaClipboardList size={14} /> Active orders
              {(activeOrders?.length ?? 0) > 0 && <span className="rounded-full bg-brand-red px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">{activeOrders!.length}</span>}
            </button>
          )}
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

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search products..." />
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
            className={`flex shrink-0 items-center rounded-lg border px-4 py-2 text-sm font-medium transition ${
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

        {showGrouped ? (
          <div className="mt-5">
            {productsLoading || dealsLoading ? (
              <div className="grid"><PosLoading /></div>
            ) : searchGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-400">{searchTerm ? <>Nothing matches &quot;{searchInput.trim()}&quot;.</> : "No items are available at this branch."}</p>
            ) : (
              searchGroups.map((g) => (
                <div key={g.key} className="mb-8">
                  <button type="button" onClick={() => openCategory(g.key)} title={`Open ${g.name}`} className="mb-3 text-xl font-bold text-neutral-900 transition hover:text-brand-red hover:underline">
                    {g.name}
                  </button>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                    {g.products.map((p) => productCard(p))}
                    {g.deals.map((d) => dealCard(d))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
        {(showDeals || isAllTab) && (
          <div className="mt-5">
            {isAllTab && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Deals</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {deals?.map((d) => dealCard(d))}
              {showDeals && dealsLoading && <PosLoading />}
              {showDeals && !dealsLoading && deals?.length === 0 && <p className="col-span-full py-8 text-center text-sm text-neutral-400">No deals available at this branch.</p>}
            </div>
          </div>
        )}

        {!showDeals && (
          <div className="mt-5">
            {isAllTab && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Products</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {visibleProducts.map((p) => productCard(p))}
              {productsLoading && <PosLoading />}
              {!productsLoading && visibleProducts.length === 0 && <p className="col-span-full py-8 text-center text-sm text-neutral-400">No products match.</p>}
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* ======================= ORDER PANEL ======================= */}
      <div className="w-full shrink-0 lg:sticky lg:top-0 lg:h-[calc(100dvh-7.25rem)] lg:w-[340px] xl:w-[360px] 2xl:w-[400px]">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm lg:h-full">
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
                  <p className="text-xs text-green-700">Cash received {formatPaisa(lastResult.cashTendered)}{lastResult.tip ? ` (incl. tip ${formatPaisa(lastResult.tip)})` : ""}</p>
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
                    Confirm Card Payment Received
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

                {!amendOrderId && orderType === "DELIVERY" && !deliveryReady && (
                  <button type="button" onClick={() => setCustomerDrawerOpen(true)} className="mb-3 block w-full rounded-lg bg-red-50 px-3 py-2 text-left text-xs font-medium text-red-700 hover:bg-red-100">
                    Add the customer&apos;s name, phone and delivery address to place this order. Tap here.
                  </button>
                )}

                {cart.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-300"><FaCartShopping size={22} /></span>
                    <p className="mt-3 text-sm font-medium text-neutral-500">{amendOrderId ? "No new items" : "No items yet"}</p>
                    <p className="text-xs text-neutral-400">Tap a product to add it{amendOrderId ? " to this table's bill" : " to the order"}.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cart.map((l) => {
                      const img =
                        l.kind === "product"
                          ? (() => {
                              const p = products?.find((x) => x.id === l.productId);
                              return p?.images.find((i) => i.isPrimary)?.url ?? p?.images[0]?.url;
                            })()
                          : deals?.find((x) => x.id === l.dealId)?.image;
                      return (
                      <div key={l.key} className="rounded-xl border border-neutral-200 p-2.5 text-sm">
                        <div className="flex items-start justify-between gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {img ? <img src={img} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-neutral-200 object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-300"><FaCartShopping size={14} /></div>}
                          <div className="min-w-0 flex-1">
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
                      );
                    })}
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
                      onClick={() => void placeOrder()}
                      disabled={placing || cart.length === 0}
                      className="w-full rounded-xl bg-brand-red py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                    >
                      {placing ? <LoadingDots>Adding</LoadingDots> : "Add These Items to the Bill"}
                    </button>
                  </>
                ) : (
                  <>
                    {noteOpen || orderNote ? (
                      <div className="mb-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-medium text-neutral-500">Order note</p>
                          <button onClick={() => { setOrderNote(""); setNoteOpen(false); }} className="text-[11px] text-neutral-400 hover:text-red-600">Remove</button>
                        </div>
                        <textarea
                          value={orderNote}
                          onChange={(e) => setOrderNote(e.target.value)}
                          maxLength={300}
                          rows={2}
                          autoFocus={noteOpen && !orderNote}
                          placeholder="e.g. No onions, less spicy, call on arrival..."
                          className={`${fieldClass} resize-none`}
                        />
                        <p className="mt-0.5 text-right text-[10px] text-neutral-400">{orderNote.length}/300</p>
                      </div>
                    ) : (
                      <button onClick={() => setNoteOpen(true)} className="mb-2 mr-4 inline-flex items-center gap-1.5 text-xs font-medium text-brand-red hover:underline">
                        <FaPenToSquare size={12} /> Add order note
                      </button>
                    )}
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

                    <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white text-sm">
                      <div className="space-y-1.5 px-3 py-2.5">
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
                        {quote && !!quote.roundOff && (
                          <div className="flex justify-between text-neutral-400"><span>Round off</span><span>{quote.roundOff > 0 ? "+" : "-"}{formatPaisa(Math.abs(quote.roundOff))}</span></div>
                        )}
                      </div>

                      {!isDineIn && cart.length > 0 && (
                        <div className="border-t border-neutral-100 px-3 py-2">
                          {tipOpen ? (
                            <div>
                              <TipPicker
                                value={tip}
                                onChange={(v) => {
                                  setTip(v);
                                  setTipOpen(false);
                                }}
                              />
                              <button type="button" onClick={() => setTipOpen(false)} className="mt-1.5 text-[11px] text-neutral-400 underline hover:text-neutral-600">Close</button>
                            </div>
                          ) : tipPaisa > 0 ? (
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-neutral-700">Tip</span>
                              <span className="flex items-center gap-3">
                                <span className="font-semibold text-neutral-900">+{formatPaisa(tipPaisa)}</span>
                                <button type="button" onClick={() => setTipOpen(true)} className="text-xs font-medium text-brand-red hover:underline">Change</button>
                                <button type="button" onClick={() => setTip("")} className="text-xs text-neutral-400 hover:text-red-600" aria-label="Remove tip">Remove</button>
                              </span>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setTipOpen(true)} className="flex w-full items-center justify-between py-0.5 text-left text-neutral-600 hover:text-brand-red">
                              <span>Add a tip <span className="text-neutral-400">(optional)</span></span>
                              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-sm leading-none">+</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-3 py-3">
                        <span className="text-lg font-semibold text-neutral-900">Total due</span>
                        <span className="text-2xl font-bold text-brand-red">{formatPaisa(toCollect)}</span>
                      </div>
                    </div>

                    {isDineIn && (
                      <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-neutral-500 ring-1 ring-neutral-200">
                        Dine-in is paid at the end of the meal — place the order now, then tap the table to collect payment (cash or card, split if needed).
                      </p>
                    )}

                    <button
                      onClick={() => (isDineIn || amendOrderId ? void placeOrder() : setPaymentOpen(true))}
                      disabled={placing || !canPlace}
                      className="mt-3 w-full rounded-xl bg-brand-red py-3.5 text-base font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                    >
                      {placing ? <LoadingDots>Placing</LoadingDots> : `Place Order${cart.length > 0 ? ` · ${formatPaisa(toCollect)}` : ""}`}
                    </button>
                    {!canPlace && cart.length > 0 && (
                      <p className="mt-1.5 text-center text-xs text-neutral-400">
                        {orderType === "DINE_IN" && !tableId
                          ? "Select a table to continue."
                          : orderType === "DELIVERY" && (!customerName.trim() || !customerPhone.trim())
                            ? "Enter the customer's name and phone to continue."
                            : orderType === "DELIVERY" && !(deliveryAddress.city.trim() && deliveryAddress.area.trim() && deliveryAddress.addressLine.trim())
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

      {paymentOpen && (
        <PaymentModal orderTotal={total} tip={tipPaisa} busy={placing} calculating={quoteFetching || !quote} onClose={() => setPaymentOpen(false)} onConfirm={(choice) => void placeOrder(choice)} />
      )}
      {printOpen && lastResult && !lastResult.isAmendment && (
        <PrintDialog
          orderNumber={lastResult.orderNumber}
          isDineIn={lastResult.type === "DINE_IN"}
          total={lastResult.grandTotal}
          cashReceived={lastResult.cashTendered}
          change={lastResult.changeDue}
          onClose={() => setPrintOpen(false)}
          onChoose={choosePrint}
        />
      )}
      {/* Tables: slides in from the left */}
      <div className={`fixed inset-0 z-[45] bg-black/40 transition-opacity duration-300 ${tableDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={() => setTableDrawerOpen(false)} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Select a table"
        aria-hidden={!tableDrawerOpen}
        className={`fixed left-0 top-0 z-[45] flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${tableDrawerOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-neutral-900">Select a table</h2>
            <p className="text-xs text-neutral-500">Tap a free table to start an order, or an occupied one to see its bill, add items or take payment</p>
          </div>
          <button type="button" onClick={() => setTableDrawerOpen(false)} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
        </div>
        <div className="flex items-center gap-4 border-b border-neutral-100 px-5 py-2 text-[11px] text-neutral-500">
          {(["AVAILABLE", "OCCUPIED"] as const).map((st) => (
            <span key={st} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${TABLE_STATUS_META[st].dot}`} />{TABLE_STATUS_META[st].label}{tables ? ` (${tables.filter((t) => t.status === st).length})` : ""}</span>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-4">
          {!tables ? (
            <p className="py-10 text-center text-sm text-neutral-400"><LoadingDots>Loading tables</LoadingDots></p>
          ) : tables.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-red/10 text-brand-red"><FaChair size={22} /></span>
              <p className="mt-3 text-sm font-semibold text-neutral-800">No tables set up for this branch</p>
              <p className="mt-1 text-xs text-neutral-500">Add tables under Tables in the menu.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {tables.map((t) => {
                const meta = TABLE_STATUS_META[t.status];
                const selected = tableId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTable(t)}
                    className={`rounded-xl border-2 p-3 text-left transition ${meta.card} ${selected ? "ring-2 ring-brand-red ring-offset-1" : ""}`}
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <span>{selectedTable.name ?? `T${selectedTable.number}`} is marked Occupied but has no open order.</span>
              <button type="button" onClick={() => freeTable(selectedTable.id)} className="rounded-md bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700">Mark available</button>
            </div>
          )}
        </div>
      </aside>

      {/* Customer details: slides in from the left */}
      <div className={`fixed inset-0 z-[45] bg-black/40 transition-opacity duration-300 ${customerDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={() => setCustomerDrawerOpen(false)} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Customer details"
        aria-hidden={!customerDrawerOpen}
        className={`fixed left-0 top-0 z-[45] flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${customerDrawerOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-neutral-900">Customer details</h2>
            <p className="text-xs text-neutral-500">Name, phone and address are needed for delivery; for other orders they are optional</p>
          </div>
          <button type="button" onClick={() => setCustomerDrawerOpen(false)} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="relative">
            <FaMagnifyingGlass size={13} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={custQuery}
              onChange={(e) => setCustQuery(e.target.value)}
              placeholder="Search customer by name, phone or email"
              aria-label="Search customers"
              className="h-11 w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-9 text-sm outline-none focus:border-brand-red"
            />
            {custQuery && (
              <button type="button" onClick={() => setCustQuery("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"><CloseIcon size={11} /></button>
            )}
          </div>
          {custTerm && (
          <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200">
            <p className="border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Search results{custSearching && <span className="ml-2 font-normal normal-case text-neutral-400">searching...</span>}
            </p>
            {custResults.length === 0 ? (
              <p className="px-3 py-3 text-xs text-neutral-400">{custSearching ? "Looking..." : "No customer found. Enter the details below to add a new one."}</p>
            ) : (
              <ul className="max-h-60 divide-y divide-neutral-100 overflow-y-auto">
                {custResults.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pickFromSearch(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-neutral-50">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-xs font-semibold text-brand-red">{c.name.charAt(0).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-800">{c.name}{c.isGuest && <span className="ml-1.5 rounded bg-neutral-100 px-1 text-[10px] font-medium text-neutral-500">phone only</span>}</span>
                        <span className="block truncate text-[11px] text-neutral-400">{c.phone}{c.addresses[0] ? ` · ${c.addresses[0].addressLine}` : ""}</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-brand-red">Select</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          )}

          <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Customer details</p>
          {renderCustomerForm({ required: isDeliveryType, delivery: true })}

          <div className="my-5 border-t border-neutral-100" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-neutral-900">Address<span className="ml-1.5 text-xs font-normal text-neutral-400">(needed for delivery)</span></p>
            {lastAddress && (
              <button
                type="button"
                onClick={() =>
                  setDeliveryAddress({
                    city: lastAddress.deliveryCity ?? "",
                    area: lastAddress.deliveryArea ?? "",
                    addressLine: lastAddress.deliveryAddressSnapshot ?? "",
                    landmark: lastAddress.deliveryLandmark ?? "",
                  })
                }
                className="max-w-full truncate rounded-lg border border-brand-red/30 bg-brand-red/5 px-3 py-1 text-xs font-medium text-brand-red transition hover:bg-brand-red/10"
                title={lastAddress.deliveryAddressSnapshot ?? ""}
              >
                Use last address: {lastAddress.deliveryAddressSnapshot}
              </button>
            )}
          </div>
          {savedAddresses.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Saved addresses</span>
              {savedAddresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => useSavedAddress(a)}
                  title={a.addressLine}
                  className="max-w-[260px] truncate rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:border-brand-red hover:text-brand-red"
                >
                  {a.label}: {a.addressLine}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">City{isDeliveryType && <span className="text-brand-red"> *</span>}</label>
              <input placeholder="City" value={deliveryAddress.city} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, city: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Area{isDeliveryType && <span className="text-brand-red"> *</span>}</label>
              <AreaCombobox value={deliveryAddress.area} options={cityAreas ?? []} loading={areasLoading} onChange={(area) => setDeliveryAddress((cur) => ({ ...cur, area }))} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-500">Complete address{isDeliveryType && <span className="text-brand-red"> *</span>}</label>
              <input placeholder="House / shop, street, block" value={deliveryAddress.addressLine} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, addressLine: e.target.value })} className={fieldClass} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-500">Nearest landmark</label>
              <input placeholder="Optional" value={deliveryAddress.landmark} onChange={(e) => setDeliveryAddress({ ...deliveryAddress, landmark: e.target.value })} className={fieldClass} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-500">Instructions {isDeliveryType ? "for the rider" : "for this order"}</label>
              <input placeholder="Optional" value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} className={fieldClass} />
            </div>
          </div>
          {addressPartial && !isDeliveryType && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">An address is saved with the order only when city, area and the complete address are all filled. Fill the rest or clear these boxes.</p>
          )}
          {isDeliveryType && !deliveryReady && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Still needed: {[!customerName.trim() && "name", !customerPhone.trim() && "phone", !deliveryAddress.city.trim() && "city", !deliveryAddress.area.trim() && "area", !deliveryAddress.addressLine.trim() && "complete address"].filter(Boolean).join(", ")}.</p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-neutral-200 p-4">
          {(customerName || customerPhone || foundCustomer) && (
            <button type="button" onClick={clearCustomer} className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-600 hover:border-red-300 hover:text-red-600">Clear</button>
          )}
          <button type="button" onClick={() => setCustomerDrawerOpen(false)} className="flex-1 rounded-xl bg-brand-red py-2.5 text-sm font-semibold text-white hover:opacity-90">
            {isDeliveryType && !deliveryReady ? "Save for now" : "Done"}
          </button>
        </div>
      </aside>
      {canSeeOrders && branchId && <ActiveOrdersDrawer branchId={branchId} open={drawerOpen} onClose={() => setDrawerOpen(false)} />}

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
