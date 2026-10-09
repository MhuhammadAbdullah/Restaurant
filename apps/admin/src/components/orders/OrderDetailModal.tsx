"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../lib/api";
import { useMe, hasPermission } from "../../lib/useMe";
import { ProductConfigModal, type ProductDetail, type ProductCartLine } from "../pos/ProductConfigModal";
import { CustomerDetailModal } from "../customers/CustomerDetailModal";
import { FaArrowRight, FaBan, FaCheck, FaMotorcycle, FaPlus, FaReceipt, FaRightLeft, FaRotateLeft, FaUtensils } from "react-icons/fa6";
import { CloseIcon, EditIcon, TrashIcon } from "../icons";
import { toast } from "../../store/useToastStore";
import { Skeleton } from "../ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export const STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"];
export const NEXT_STATUS: Record<string, string | null> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
  READY: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
  DELIVERED: null,
  COMPLETED: null,
  CANCELLED: null,
  REFUNDED: null,
};
export const TERMINAL = new Set(["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"]);

// Delivery ↔ pickup swap, mirrors the backend's allowed pairs exactly.
const TYPE_SWAP: Record<string, { to: string; label: string } | undefined> = {
  ONLINE_DELIVERY: { to: "ONLINE_PICKUP", label: "Switch to Pickup" },
  ONLINE_PICKUP: { to: "ONLINE_DELIVERY", label: "Switch to Delivery" },
  DELIVERY: { to: "TAKEAWAY", label: "Switch to Takeaway" },
  TAKEAWAY: { to: "DELIVERY", label: "Switch to Delivery" },
};
const DELIVERY_TYPES = new Set(["ONLINE_DELIVERY", "DELIVERY"]);
const PICKUP_TYPES = new Set(["ONLINE_PICKUP", "TAKEAWAY"]);

// ---- Presentation helpers for the modal header / action bar ----
const STATUS_CHIP: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  PREPARING: "bg-orange-50 text-orange-700",
  READY: "bg-purple-50 text-purple-700",
  OUT_FOR_DELIVERY: "bg-cyan-50 text-cyan-700",
  DELIVERED: "bg-green-50 text-green-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-red-700",
  REFUNDED: "bg-neutral-100 text-neutral-600",
};
function paymentChip(paymentStatus: string): string {
  if (paymentStatus === "PAID") return "bg-green-50 text-green-700";
  if (paymentStatus === "FAILED" || paymentStatus === "CANCELLED" || paymentStatus === "REFUNDED") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}
const actionBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-brand-red hover:text-brand-red disabled:opacity-50";
const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand-red px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50";

const FLOW_DELIVERY = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
const FLOW_OTHER = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];
const FLOW_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "On the way",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
};

/** Where the order is in its lifecycle, at a glance. Cancelled/refunded orders get a banner instead. */
function OrderProgress({ status, isDelivery }: { status: string; isDelivery: boolean }) {
  if (status === "CANCELLED" || status === "REFUNDED") {
    return (
      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
        This order was {status === "CANCELLED" ? "cancelled" : "refunded"}.
      </p>
    );
  }
  const flow = isDelivery ? FLOW_DELIVERY : FLOW_OTHER;
  const current = flow.indexOf(status);
  if (current < 0) return null;
  return (
    <ol className="mt-3 flex items-center">
      {flow.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="flex flex-1 items-center last:flex-none">
            <span className="flex flex-col items-center gap-1">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold ${
                  done ? "border-brand-red bg-brand-red text-white" : active ? "border-brand-red bg-white text-brand-red" : "border-neutral-300 bg-white text-neutral-400"
                }`}
              >
                {done ? <FaCheck size={9} /> : i + 1}
              </span>
              <span className={`whitespace-nowrap text-[10px] ${active ? "font-semibold text-neutral-900" : "text-neutral-400"}`}>{FLOW_LABEL[step]}</span>
            </span>
            {i < flow.length - 1 && <span className={`mx-1 mb-4 h-0.5 flex-1 rounded ${done ? "bg-brand-red" : "bg-neutral-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

// Friendlier labels for the status-history timeline — falls back to the raw action string for
// anything not explicitly named here (new action types never crash the timeline, just look terse).
const HISTORY_ACTION_LABEL: Record<string, string> = {
  "order.statusChange": "Status changed",
  "order.cancel": "Order cancelled",
  "order.refund": "Order refunded",
  "order.itemsAdded": "Items added",
  "order.itemQuantityChanged": "Item quantity changed",
  "order.itemRemoved": "Item removed",
  "order.typeChanged": "Order type changed",
  "order.deliveryDetailsUpdated": "Delivery details updated",
  "order.branchTransferred": "Branch changed",
  "order.deliveryEtaChanged": "Delivery time updated",
  "order.riderAssigned": "Rider assigned",
  "order.riderUnassigned": "Rider unassigned",
};

type OrderItemDetail = {
  id: string;
  productId: string | null;
  nameSnapshot: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  specialInstructions: string | null;
  orderRevisionId: string | null;
  choices: { id: string; choiceOptionId: string; nameSnapshot: string; priceAdjustmentSnapshot: number }[];
  addons: { id: string; addonId: string; nameSnapshot: string; quantity: number; priceSnapshot: number }[];
  dealSlots: {
    id: string;
    nameSnapshot: string;
    choices: { id: string; nameSnapshot: string; priceAdjustmentSnapshot: number }[];
    addons: { id: string; nameSnapshot: string; quantity: number; priceSnapshot: number }[];
  }[];
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  type: string;
  source: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  discountAmount: number;
  couponDiscountAmount: number;
  loyaltyDiscountAmount: number;
  grandTotal: number;
  createdAt: string;
  specialInstructions: string | null;
  internalNotes: string | null;
  changeRequestAmount: number | null;
  contactName: string | null;
  contactPhone: string | null;
  contactAlternatePhone: string | null;
  contactEmail: string | null;
  deliveryAddressSnapshot: string | null;
  deliveryCity: string | null;
  deliveryArea: string | null;
  deliveryLandmark: string | null;
  estimatedDeliveryAt: string | null;
  branch: { id: string; name: string; address: string | null; city: string; area: string };
  table: { number: string; name: string | null } | null;
  customer: { id: string; name: string; phone: string; email: string | null } | null;
  assignedRider: { id: string; name: string; phone: string | null } | null;
  items: OrderItemDetail[];
  payments: { id: string; method: string; status: string; amount: number; transactionRef: string | null; createdAt: string }[];
  revisions: { id: string; staffId: string | null; previousGrandTotal: number; newGrandTotal: number; note: string | null; createdAt: string }[];
  branchTransfers: {
    id: string;
    fromBranch: { id: string; name: string };
    toBranch: { id: string; name: string };
    transferredByStaff: { name: string } | null;
    note: string | null;
    createdAt: string;
  }[];
};

type RiderOption = { id: string; name: string; phone: string | null; status: string; assignedOrders: number; completedOrders: number };
type PrintEvent = { id: string; type: string; status: string; createdAt: string; staff: { name: string } | null };
type ProductOption = {
  id: string;
  name: string;
  basePrice: number;
  discountPrice: number | null;
  status: string;
  category?: { id: string; name: string } | null;
  images?: { url: string }[];
};
type BranchOption = { id: string; name: string; city: string; area: string };
type HistoryEntry = { id: string; action: string; oldValue: unknown; newValue: unknown; createdAt: string; staffUser: { name: string } | null };

// A stored OrderItemChoice only keeps the option id, not its parent group — resolve it against
// the freshly fetched product detail so ProductConfigModal's per-group selection state works.
function resolveChoiceGroupId(product: ProductDetail, choiceOptionId: string): string | null {
  for (const cg of product.choiceGroups) {
    if (cg.choiceGroup.options.some((o) => o.id === choiceOptionId)) return cg.choiceGroup.id;
  }
  return null;
}

function customerMapUrl(order: OrderDetail): string | null {
  const address = [order.deliveryAddressSnapshot, order.deliveryArea, order.deliveryCity].filter(Boolean).join(", ");
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function describeHistoryValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) => val !== undefined && val !== null);
    if (entries.length === 0) return null;
    return entries.map(([k, val]) => `${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`).join(", ");
  }
  return String(v);
}

export function OrderDetailModal({ orderId, onClose, onNavigateReceipt }: { orderId: string; onClose: () => void; onNavigateReceipt: (id: string) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canEdit = hasPermission(me, "orders.edit");
  const canAddItems = hasPermission(me, "pos.access");
  const canCancel = hasPermission(me, "orders.cancel");
  const canRefund = hasPermission(me, "orders.refund");
  const canViewCustomers = hasPermission(me, "customers.view");
  const canTransfer = hasPermission(me, "orders.transfer");
  const canAssignRider = hasPermission(me, "riders.assign");

  const [viewingCustomerId, setViewingCustomerId] = useState<string | null>(null);
  const [statusPopupOpen, setStatusPopupOpen] = useState(false);
  const [branchPopupOpen, setBranchPopupOpen] = useState(false);
  const [transferBranchId, setTransferBranchId] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [activityTab, setActivityTab] = useState<"status" | "revisions" | "prints" | null>(null);
  const [riderPopupOpen, setRiderPopupOpen] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState("");
  const [payMethod, setPayMethod] = useState<"CASH" | "CARD" | "QR">("CASH");

  const { data: order } = useQuery({ queryKey: ["order-detail", orderId], queryFn: () => api.get<OrderDetail>(`/staff/orders/${orderId}`) });
  const { data: printEvents } = useQuery({ queryKey: ["order-print-events", orderId], queryFn: () => api.get<PrintEvent[]>(`/staff/orders/${orderId}/print-events`) });
  const { data: history } = useQuery({
    queryKey: ["order-history", orderId],
    queryFn: () => api.get<HistoryEntry[]>(`/staff/orders/${orderId}/history`),
    enabled: showHistory,
  });
  const { data: riders } = useQuery({
    queryKey: ["order-modal-riders", order?.branch.id],
    queryFn: () => api.get<RiderOption[]>(`/staff/riders?branchId=${order!.branch.id}`),
    enabled: canAssignRider && !!order,
  });
  // Full branch records (with city) for the "nearby branches only" transfer picker — the global
  // BranchPicker only exposes {id,name,code}, not enough to filter geographically.
  const { data: allBranches } = useQuery({
    queryKey: ["order-modal-branches"],
    queryFn: () => api.get<BranchOption[]>("/branches"),
    enabled: canTransfer && branchPopupOpen,
  });
  const nearbyBranches = useMemo(() => {
    if (!order || !allBranches) return [];
    return allBranches.filter((b) => b.id !== order.branch.id && b.city === order.branch.city);
  }, [allBranches, order]);

  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    contactName: "",
    contactPhone: "",
    contactAlternatePhone: "",
    contactEmail: "",
    deliveryAddressSnapshot: "",
    deliveryCity: "",
    deliveryArea: "",
    deliveryLandmark: "",
  });
  const [busy, setBusy] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [productCategory, setProductCategory] = useState<string>("ALL");
  const [configuringProduct, setConfiguringProduct] = useState<ProductDetail | null>(null);
  const [configuringItemId, setConfiguringItemId] = useState<string | null>(null);
  const [configuringInitial, setConfiguringInitial] = useState<ProductCartLine | undefined>(undefined);

  const { data: products } = useQuery({
    queryKey: ["order-modal-products", order?.branch.id],
    queryFn: () => api.get<ProductOption[]>(`/catalog/products?branchId=${order!.branch.id}`),
    enabled: canAddItems && !!order,
  });

  const activeProducts = useMemo(() => (products ?? []).filter((p) => p.status === "ACTIVE"), [products]);
  const productCategories = useMemo(() => {
    const names = new Set<string>();
    for (const p of activeProducts) if (p.category?.name) names.add(p.category.name);
    return [...names].sort();
  }, [activeProducts]);
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return activeProducts.filter(
      (p) => (productCategory === "ALL" || p.category?.name === productCategory) && (!q || p.name.toLowerCase().includes(q)),
    );
  }, [activeProducts, productSearch, productCategory]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["order-detail", orderId] });
    await queryClient.invalidateQueries({ queryKey: ["order-history", orderId] });
    await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-recent-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-order-status-counts"] });
  }

  function startEditingDetails() {
    if (!order) return;
    setDetailsForm({
      contactName: order.contactName ?? order.customer?.name ?? "",
      contactPhone: order.contactPhone ?? order.customer?.phone ?? "",
      contactAlternatePhone: order.contactAlternatePhone ?? "",
      contactEmail: order.contactEmail ?? order.customer?.email ?? "",
      deliveryAddressSnapshot: order.deliveryAddressSnapshot ?? "",
      deliveryCity: order.deliveryCity ?? "",
      deliveryArea: order.deliveryArea ?? "",
      deliveryLandmark: order.deliveryLandmark ?? "",
    });
    setEditingDetails(true);
  }

  async function saveDetails() {
    setBusy(true);
    try {
      await api.patch(`/staff/orders/${orderId}/delivery-details`, detailsForm);
      setEditingDetails(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save changes");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: string) {
    setBusy(true);
    try {
      await api.patch(`/staff/orders/${orderId}/status`, { status });
      setStatusPopupOpen(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update status");
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Request the bill": the customer's ready to pay, so collect payment against whatever the
   * current balance due is (already correctly reflects every item added since the order opened —
   * addItemsToOrder keeps grandTotal live). Cash settles immediately; Card/QR needs the explicit
   * Confirm step below. Closing the order + freeing the table is entirely the backend's job
   * (closeDineInOrderIfFullyPaid) — this just calls the same two payment endpoints POS already uses.
   */
  async function recordPaymentAction(balanceDue: number) {
    setBusy(true);
    try {
      await api.post(`/staff/orders/${orderId}/payments`, { method: payMethod, amount: balanceDue });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not record payment");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPaymentAction(paymentId: string) {
    setBusy(true);
    try {
      await api.post(`/staff/orders/${orderId}/confirm-payment`, { paymentId });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not confirm payment");
    } finally {
      setBusy(false);
    }
  }

  async function changeType(newType: string) {
    if (!confirm(`Change order type to ${newType.replace(/_/g, " ")}? This will recalculate the delivery fee and total.`)) return;
    setBusy(true);
    try {
      await api.patch(`/staff/orders/${orderId}/type`, { type: newType });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not change order type");
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer() {
    if (!transferBranchId) return;
    if (!confirm(`Transfer this order to the selected branch? The previous branch will no longer manage it.`)) return;
    setBusy(true);
    try {
      await api.patch(`/staff/orders/${orderId}/transfer`, { toBranchId: transferBranchId, note: transferNote || undefined });
      setBranchPopupOpen(false);
      setTransferBranchId("");
      setTransferNote("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not transfer order");
    } finally {
      setBusy(false);
    }
  }

  async function receiveCodCash() {
    if (!order) return;
    const who = order.assignedRider ? ` from ${order.assignedRider.name}` : "";
    if (!confirm(`Confirm you have received ${formatPaisa(order.grandTotal - paidTotal)} in cash${who} for ${order.orderNumber}? The order will be marked PAID.`)) return;
    setBusy(true);
    try {
      await api.post("/staff/orders/settle-cod", { orderIds: [orderId], receivedAmount: order.grandTotal - paidTotal });
      toast.success("Cash received — order marked paid");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not record the cash");
    } finally {
      setBusy(false);
    }
  }

  async function assignRider(riderId: string | null) {
    setBusy(true);
    try {
      await api.patch(`/staff/orders/${orderId}/rider`, { riderId });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not assign rider");
    } finally {
      setBusy(false);
    }
  }

  // The backend rejects anything not exactly 5-minute-aligned (0 seconds). Older orders' original
  // estimatedDeliveryAt was computed as "now + N minutes" with arbitrary seconds, so it must be
  // rounded here too — not just when it's missing — or every ±5 click on an unaligned order would
  // fail validation and surface as an error alert. Rounds up so the estimate never gets tighter.
  function roundUpToFive(date: Date): Date {
    const d = new Date(date);
    d.setSeconds(0, 0);
    const remainder = d.getMinutes() % 5;
    if (remainder !== 0) d.setMinutes(d.getMinutes() + (5 - remainder));
    return d;
  }

  async function adjustEta(deltaMinutes: number) {
    if (!order) return;
    const base = roundUpToFive(order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt) : new Date(Date.now() + 30 * 60_000));
    const next = new Date(base.getTime() + deltaMinutes * 60_000);
    if (next.getTime() <= Date.now()) return;
    setBusy(true);
    try {
      await api.patch(`/staff/orders/${orderId}/delivery-eta`, { estimatedDeliveryAt: next.toISOString() });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update delivery time");
    } finally {
      setBusy(false);
    }
  }

  function buildRiderMessage(order: OrderDetail): string {
    const itemsSummary = order.items.map((i) => `${i.quantity}x ${i.nameSnapshot}`).join(", ");
    const address = [order.deliveryAddressSnapshot, order.deliveryArea, order.deliveryCity, order.deliveryLandmark].filter(Boolean).join(", ");
    const lines = [
      `Order ${order.orderNumber}`,
      `Customer: ${order.contactName ?? order.customer?.name ?? "Guest"}`,
      `Phone: ${order.contactPhone ?? order.customer?.phone ?? "-"}`,
      order.contactAlternatePhone && `Alt Phone: ${order.contactAlternatePhone}`,
      address && `Address: ${address}`,
      `Amount: Rs. ${(order.grandTotal / 100).toFixed(0)}`,
      `Items: ${itemsSummary}`,
      order.specialInstructions && `Order Note: ${order.specialInstructions}`,
    ].filter(Boolean);
    return lines.join("\n");
  }

  function whatsAppLink(order: OrderDetail, riderPhone: string): string {
    const phone = riderPhone.replace(/[^\d+]/g, "");
    return `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(buildRiderMessage(order))}`;
  }

  async function assignRiderFromPopup(sendWhatsApp: boolean) {
    if (!order || !selectedRiderId) return;
    const rider = riders?.find((r) => r.id === selectedRiderId);
    setBusy(true);
    try {
      await api.patch(`/staff/orders/${orderId}/rider`, { riderId: selectedRiderId });
      await refresh();
      setRiderPopupOpen(false);
      setSelectedRiderId("");
      if (sendWhatsApp && rider?.phone) {
        window.open(whatsAppLink(order, rider.phone), "_blank");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not assign rider");
    } finally {
      setBusy(false);
    }
  }

  async function updateItemQuantity(itemId: string, quantity: number) {
    if (quantity < 1) return;
    setBusy(true);
    try {
      await api.patch(`/staff/orders/${orderId}/items/${itemId}`, { quantity });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update quantity");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(itemId: string, name: string) {
    if (!confirm(`Remove "${name}" from this order?`)) return;
    setBusy(true);
    try {
      await api.delete(`/staff/orders/${orderId}/items/${itemId}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove item");
    } finally {
      setBusy(false);
    }
  }

  async function openAddProduct(productId: string) {
    setAddItemOpen(false);
    setProductSearch("");
    setProductCategory("ALL");
    setBusy(true);
    try {
      const detail = await api.get<ProductDetail>(`/catalog/products/${productId}`);
      setConfiguringItemId(null);
      setConfiguringInitial(undefined);
      setConfiguringProduct(detail);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load product");
    } finally {
      setBusy(false);
    }
  }

  async function openEditItem(item: OrderItemDetail) {
    if (!item.productId) return;
    setBusy(true);
    try {
      const detail = await api.get<ProductDetail>(`/catalog/products/${item.productId}`);
      setConfiguringItemId(item.id);
      setConfiguringInitial({
        kind: "product",
        productId: item.productId,
        name: item.nameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        choices: item.choices
          .map((c) => ({
            choiceGroupId: resolveChoiceGroupId(detail, c.choiceOptionId) ?? "",
            choiceOptionId: c.choiceOptionId,
            name: c.nameSnapshot,
            priceAdjustment: c.priceAdjustmentSnapshot,
          }))
          .filter((c) => c.choiceGroupId),
        addons: item.addons.map((a) => ({ addonId: a.addonId, name: a.nameSnapshot, price: a.priceSnapshot, quantity: a.quantity })),
        specialInstructions: item.specialInstructions ?? undefined,
      });
      setConfiguringProduct(detail);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load product");
    } finally {
      setBusy(false);
    }
  }

  function closeConfigModal() {
    setConfiguringProduct(null);
    setConfiguringItemId(null);
    setConfiguringInitial(undefined);
  }

  async function saveConfiguredItem(line: ProductCartLine) {
    setBusy(true);
    try {
      const payload = {
        kind: "product" as const,
        productId: line.productId,
        quantity: line.quantity,
        choices: line.choices.map((c) => ({ choiceGroupId: c.choiceGroupId, choiceOptionId: c.choiceOptionId })),
        addons: line.addons.map((a) => ({ addonId: a.addonId, quantity: a.quantity })),
        specialInstructions: line.specialInstructions,
      };
      if (configuringItemId) {
        await api.patch(`/staff/orders/${orderId}/items/${configuringItemId}/configure`, payload);
      } else {
        await api.post(`/staff/orders/${orderId}/items`, { items: [payload] });
      }
      closeConfigModal();
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save item");
    } finally {
      setBusy(false);
    }
  }

  const typeSwap = order ? TYPE_SWAP[order.type] : undefined;
  const isDeliveryType = order ? DELIVERY_TYPES.has(order.type) : false;
  // Registered customers have a real id; guest checkouts/POS walk-ins are keyed by phone only —
  // `guest:<phone>` is the synthetic id CustomersService understands (see customers.service.ts).
  const customerId = order ? (order.customer?.id ?? (order.contactPhone ? `guest:${order.contactPhone}` : null)) : null;
  const isPending = order?.status === "PENDING";
  const mapUrl = order ? customerMapUrl(order) : null;
  const paidTotal = order ? order.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0) : 0;
  const balanceDue = order ? order.grandTotal - paidTotal : 0;
  const pendingPayment = order?.payments.find((p) => p.status === "PENDING");
  // Delivered cash-on-delivery order whose cash an admin has not yet received (the rider still holds it).
  const awaitingCodCash = !!order && order.paymentMethod === "COD" && (order.status === "DELIVERED" || order.status === "COMPLETED") && order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-neutral-200 px-5 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            {order ? (
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-neutral-900">{order.orderNumber}</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[order.status] ?? "bg-neutral-100 text-neutral-600"}`}>{order.status.replace(/_/g, " ")}</span>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">{order.type.replace(/_/g, " ")}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${paymentChip(order.paymentStatus)}`}>{order.paymentMethod} · {order.paymentStatus}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Placed {new Date(order.createdAt).toLocaleString()} · {order.branch.name} · {order.source}
                </p>
              </div>
            ) : (
              <Skeleton className="h-5 w-32" />
            )}
            <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
          </div>
          {order && <OrderProgress status={order.status} isDelivery={isDeliveryType} />}
        </div>
        {order && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-5 py-2.5">
            {canEdit && isPending && (
              <button onClick={() => changeStatus("CONFIRMED")} disabled={busy} className={primaryBtn}>
                <FaCheck size={11} /> Accept Order
              </button>
            )}
            {canEdit && !isPending && !TERMINAL.has(order.status) && NEXT_STATUS[order.status] && (
              <button onClick={() => changeStatus(NEXT_STATUS[order.status]!)} disabled={busy} className={primaryBtn}>
                <FaArrowRight size={11} /> Mark {NEXT_STATUS[order.status]!.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
              </button>
            )}
            {canEdit && !TERMINAL.has(order.status) && (
              <button onClick={() => setStatusPopupOpen(true)} className={actionBtn}>Change Status</button>
            )}
            {canAssignRider && isDeliveryType && !TERMINAL.has(order.status) && (
              <button onClick={() => setRiderPopupOpen(true)} className={actionBtn}>
                <FaMotorcycle size={13} /> {order.assignedRider ? "Change Rider" : "Assign Rider"}
              </button>
            )}
            {canAddItems && !TERMINAL.has(order.status) && (
              <button onClick={() => setAddItemOpen(true)} className={actionBtn}>
                <FaPlus size={11} /> Add Item
              </button>
            )}
            {canTransfer && !TERMINAL.has(order.status) && order.type !== "DINE_IN" && (
              <button onClick={() => setBranchPopupOpen(true)} className={actionBtn}>
                <FaRightLeft size={12} /> Change Branch
              </button>
            )}
            <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-neutral-200 sm:block" />
            <button onClick={() => onNavigateReceipt(order.id)} className={actionBtn}>
              <FaReceipt size={12} /> Customer Receipt
            </button>
            <button onClick={() => router.push(`/pos/kitchen-ticket/${order.id}`)} className={actionBtn}>
              <FaUtensils size={12} /> Kitchen Ticket
            </button>
            {order.revisions.length > 0 && (
              <button onClick={() => router.push(`/pos/kitchen-ticket/${order.id}?full=true`)} className={`${actionBtn} text-neutral-500`}>Reprint Full Kitchen Order</button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {canRefund && order.paymentStatus !== "REFUNDED" && order.status !== "REFUNDED" && (
                <button
                  onClick={() => {
                    if (confirm(`Refund order ${order.orderNumber}? This cannot be undone.`)) void changeStatus("REFUNDED");
                  }}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  <FaRotateLeft size={11} /> Refund
                </button>
              )}
              {canCancel && !TERMINAL.has(order.status) && (
                <button
                  onClick={() => {
                    if (confirm(`Cancel order ${order.orderNumber}?`)) void changeStatus("CANCELLED");
                  }}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  <FaBan size={12} /> Cancel Order
                </button>
              )}
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm">
          {order && (
            <>
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
                {/* ---------------- MAIN COLUMN: what was ordered and what is owed ---------------- */}
                <div className="space-y-4 lg:col-span-3">
                  {/* Items */}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase text-neutral-500">Order Items ({order.items.length})</p>
                      {canAddItems && !TERMINAL.has(order.status) && (
                        <button
                          onClick={() => setAddItemOpen(true)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-red px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                        >
                          <FaPlus size={10} /> Add Item
                        </button>
                      )}
                    </div>
                    <div className="mt-1.5 space-y-1.5">
                      {order.items.map((item) => (
                        <div key={item.id} className="rounded-lg border border-neutral-200 px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-neutral-900">{item.nameSnapshot}</p>
                              {(item.choices.length > 0 || item.addons.length > 0) && (
                                <p className="mt-0.5 text-xs text-neutral-500">
                                  {[...item.choices.map((c) => c.nameSnapshot), ...item.addons.map((a) => `${a.nameSnapshot}${a.quantity > 1 ? ` x${a.quantity}` : ""}`)].join(", ")}
                                </p>
                              )}
                              {item.dealSlots.length > 0 && (
                                <div className="mt-1 space-y-0.5">
                                  {item.dealSlots.map((slot) => (
                                    <p key={slot.id} className="text-xs text-neutral-500">
                                      {slot.nameSnapshot}
                                      {[...slot.choices.map((c) => c.nameSnapshot), ...slot.addons.map((a) => a.nameSnapshot)].length > 0
                                        ? ` (${[...slot.choices.map((c) => c.nameSnapshot), ...slot.addons.map((a) => a.nameSnapshot)].join(", ")})`
                                        : ""}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {item.specialInstructions && <p className="mt-1 text-xs italic text-neutral-400">"{item.specialInstructions}"</p>}
                              {item.orderRevisionId && <span className="mt-1 inline-block rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Added later</span>}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {canEdit && !TERMINAL.has(order.status) ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => updateItemQuantity(item.id, item.quantity - 1)} disabled={busy} className="flex h-6 w-6 items-center justify-center rounded border border-neutral-300 text-xs disabled:opacity-50">−</button>
                                  <span className="w-5 text-center text-xs">{item.quantity}</span>
                                  <button onClick={() => updateItemQuantity(item.id, item.quantity + 1)} disabled={busy} className="flex h-6 w-6 items-center justify-center rounded border border-neutral-300 text-xs disabled:opacity-50">+</button>
                                </div>
                              ) : (
                                <span className="text-xs text-neutral-500">x{item.quantity}</span>
                              )}
                              <span className="w-16 text-right text-xs font-medium">{formatPaisa(item.lineTotal)}</span>
                              {canEdit && item.productId && !TERMINAL.has(order.status) && (
                                <button onClick={() => openEditItem(item)} disabled={busy} aria-label="Edit item" className="text-neutral-400 hover:text-brand-red disabled:opacity-50">
                                  <EditIcon size={14} />
                                </button>
                              )}
                              {canEdit && !TERMINAL.has(order.status) && (
                                <button onClick={() => removeItem(item.id, item.nameSnapshot)} disabled={busy} aria-label="Remove item" className="text-neutral-400 hover:text-red-600 disabled:opacity-50">
                                  <TrashIcon size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>


                  {/* Instructions */}
                  {(order.specialInstructions || order.changeRequestAmount != null || (canEdit && order.internalNotes)) && (
                    <div className="rounded-lg border border-neutral-200 p-3">
                      <p className="text-xs font-semibold uppercase text-neutral-500">Instructions</p>
                      <div className="mt-1.5 space-y-1.5 text-xs">
                        {order.specialInstructions && (
                          <p><span className="font-medium text-neutral-700">Order Note:</span> <span className="text-neutral-600">{order.specialInstructions}</span></p>
                        )}
                        {order.changeRequestAmount != null && (
                          <p><span className="font-medium text-neutral-700">Cash Change Requested:</span> <span className="text-neutral-600">{formatPaisa(order.changeRequestAmount)}</span></p>
                        )}
                        {canEdit && order.internalNotes && (
                          <p className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800"><span className="font-medium">Internal Note (staff only):</span> {order.internalNotes}</p>
                        )}
                      </div>
                    </div>
                  )}


                  {awaitingCodCash && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-xs font-semibold uppercase text-red-700">Delivered — cash not received yet</p>
                      <p className="mt-1 text-xs text-red-800">
                        {order.assignedRider ? `${order.assignedRider.name} is holding ` : "The rider is holding "}
                        <span className="font-semibold">{formatPaisa(balanceDue)}</span>. The order stays unpaid until the cash is handed in and you confirm it.
                      </p>
                      {canAssignRider && (
                        <button onClick={receiveCodCash} disabled={busy} className="mt-2 w-full rounded-lg bg-brand-red py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                          Mark cash received
                        </button>
                      )}
                    </div>
                  )}

                  {/* Payment / Totals */}
                  <div className="space-y-1 rounded-lg bg-neutral-50 p-3 text-xs">
                    <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>{formatPaisa(order.subtotal)}</span></div>
                    <div className="flex justify-between"><span className="text-neutral-500">Tax</span><span>{formatPaisa(order.taxAmount)}</span></div>
                    {order.deliveryFee > 0 && <div className="flex justify-between"><span className="text-neutral-500">Delivery Fee</span><span>{formatPaisa(order.deliveryFee)}</span></div>}
                    {order.discountAmount > 0 && <div className="flex justify-between"><span className="text-neutral-500">Discount</span><span>-{formatPaisa(order.discountAmount)}</span></div>}
                    {order.couponDiscountAmount > 0 && <div className="flex justify-between"><span className="text-neutral-500">Coupon</span><span>-{formatPaisa(order.couponDiscountAmount)}</span></div>}
                    {order.loyaltyDiscountAmount > 0 && <div className="flex justify-between"><span className="text-neutral-500">Loyalty</span><span>-{formatPaisa(order.loyaltyDiscountAmount)}</span></div>}
                    <div className="flex justify-between border-t border-neutral-200 pt-2 text-sm font-semibold text-neutral-900"><span>Grand Total</span><span className="text-brand-red">{formatPaisa(order.grandTotal)}</span></div>
                  </div>


                  {/* Payment attempt history — each retry after a failed/expired online payment
                      is its own Payment row against this same order, kept for reconciliation. */}
                  {order.paymentMethod === "ONLINE" && order.payments.length > 0 && (
                    <div className="rounded-lg border border-neutral-200 p-3">
                      <p className="text-xs font-semibold uppercase text-neutral-500">Payment Attempts</p>
                      <div className="mt-2 space-y-1.5">
                        {[...order.payments]
                          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                          .map((p, i) => (
                            <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-neutral-500">
                                #{i + 1} · {new Date(p.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                {p.transactionRef && <span className="ml-1 text-neutral-400">({p.transactionRef})</span>}
                              </span>
                              <span className="flex items-center gap-2">
                                <span>{formatPaisa(p.amount)}</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 font-medium ${
                                    p.status === "PAID"
                                      ? "bg-green-100 text-green-700"
                                      : p.status === "FAILED" || p.status === "CANCELLED"
                                        ? "bg-red-100 text-red-700"
                                        : p.status === "EXPIRED"
                                          ? "bg-neutral-200 text-neutral-600"
                                          : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {p.status}
                                </span>
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}


                  {/* Record Payment ("request the bill") — never auto-closes the order itself;
                      closing + freeing the table happens server-side only once payment actually
                      clears (recordPayment/confirmPayment → closeDineInOrderIfFullyPaid). */}
                  {canAddItems && order.paymentStatus !== "PAID" && !TERMINAL.has(order.status) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase text-amber-800">Payment — Balance Due</p>
                        <span className="text-sm font-semibold text-amber-800">{formatPaisa(balanceDue)}</span>
                      </div>

                      {pendingPayment ? (
                        <div className="mt-2">
                          <p className="text-xs text-amber-700">{pendingPayment.method} payment of {formatPaisa(pendingPayment.amount)} awaiting confirmation.</p>
                          <button onClick={() => confirmPaymentAction(pendingPayment.id)} disabled={busy} className="mt-2 w-full rounded-lg bg-brand-red py-2 text-xs font-semibold text-white disabled:opacity-50">
                            Confirm Payment Received
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <div className="flex gap-1.5">
                            {(["CASH", "CARD", "QR"] as const).map((m) => (
                              <button
                                key={m}
                                onClick={() => setPayMethod(m)}
                                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${payMethod === m ? "border-brand-red bg-white text-brand-red" : "border-amber-200 text-amber-700"}`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => recordPaymentAction(balanceDue)}
                            disabled={busy || balanceDue <= 0}
                            className="mt-2 w-full rounded-lg bg-brand-red py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Record {payMethod} Payment
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ---------------- SIDE COLUMN: who, where and who delivers ---------------- */}
                <div className="space-y-4 lg:col-span-2">
                  {/* Customer */}
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-neutral-500">Customer</p>
                      {canEdit && !editingDetails && !TERMINAL.has(order.status) && (
                        <button onClick={startEditingDetails} className="text-xs font-medium text-brand-red hover:underline">Edit</button>
                      )}
                    </div>

                    {editingDetails ? (
                      <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input placeholder="Name" value={detailsForm.contactName} onChange={(e) => setDetailsForm((f) => ({ ...f, contactName: e.target.value }))} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs" />
                          <input placeholder="Phone" value={detailsForm.contactPhone} onChange={(e) => setDetailsForm((f) => ({ ...f, contactPhone: e.target.value }))} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input placeholder="Alternate Phone" value={detailsForm.contactAlternatePhone} onChange={(e) => setDetailsForm((f) => ({ ...f, contactAlternatePhone: e.target.value }))} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs" />
                          <input placeholder="Email" value={detailsForm.contactEmail} onChange={(e) => setDetailsForm((f) => ({ ...f, contactEmail: e.target.value }))} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs" />
                        </div>
                        {isDeliveryType && (
                          <>
                            <input placeholder="Address" value={detailsForm.deliveryAddressSnapshot} onChange={(e) => setDetailsForm((f) => ({ ...f, deliveryAddressSnapshot: e.target.value }))} className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs" />
                            <div className="grid grid-cols-2 gap-2">
                              <input placeholder="Area" value={detailsForm.deliveryArea} onChange={(e) => setDetailsForm((f) => ({ ...f, deliveryArea: e.target.value }))} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs" />
                              <input placeholder="City" value={detailsForm.deliveryCity} onChange={(e) => setDetailsForm((f) => ({ ...f, deliveryCity: e.target.value }))} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs" />
                            </div>
                            <input placeholder="Landmark" value={detailsForm.deliveryLandmark} onChange={(e) => setDetailsForm((f) => ({ ...f, deliveryLandmark: e.target.value }))} className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs" />
                          </>
                        )}
                        <div className="flex gap-2">
                          <button onClick={saveDetails} disabled={busy} className="rounded-lg bg-brand-red px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Save</button>
                          <button onClick={() => setEditingDetails(false)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 space-y-0.5 text-xs text-neutral-600">
                        <p className="font-medium text-neutral-900">{order.contactName ?? order.customer?.name ?? "Guest"}</p>
                        <p>
                          {order.contactPhone ?? order.customer?.phone ? (
                            <a href={`tel:${(order.contactPhone ?? order.customer?.phone ?? "").replace(/[^\d+]/g, "")}`} className="hover:text-brand-red hover:underline">
                              {order.contactPhone ?? order.customer?.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </p>
                        {order.contactAlternatePhone && <p>Alt: {order.contactAlternatePhone}</p>}
                        <p>{order.contactEmail ?? order.customer?.email ?? "—"}</p>
                        {isDeliveryType && (
                          <div className="pt-1">
                            <p className="text-neutral-500">
                              {[order.deliveryAddressSnapshot, order.deliveryArea, order.deliveryCity, order.deliveryLandmark].filter(Boolean).join(", ") || "No address on file"}
                            </p>
                            {mapUrl && (
                              <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-xs font-medium text-brand-red hover:underline">View Map</a>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {canViewCustomers && customerId && !editingDetails && (
                      <div className="mt-2 flex gap-3 border-t border-neutral-100 pt-2">
                        <button onClick={() => setViewingCustomerId(customerId)} className="text-xs font-medium text-brand-red hover:underline">
                          View Order History
                        </button>
                        <button onClick={() => setViewingCustomerId(customerId)} className="text-xs font-medium text-neutral-500 hover:text-red-600 hover:underline">
                          Block Customer
                        </button>
                      </div>
                    )}
                  </div>


                  {/* Branch / Pickup */}
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <p className="text-xs font-semibold uppercase text-neutral-500">Branch{PICKUP_TYPES.has(order.type) ? " / Pickup" : ""}</p>
                    <p className="mt-1.5 text-xs text-neutral-600">
                      <span className="font-medium text-neutral-900">{order.branch.name}</span> ({order.branch.area}, {order.branch.city})
                      {order.branchTransfers.length > 0 && (
                        <span className="block text-neutral-400">Original: {order.branchTransfers[0]!.fromBranch.name}</span>
                      )}
                    </p>
                    {PICKUP_TYPES.has(order.type) && order.branch.address && (
                      <p className="mt-1 text-xs text-neutral-500">Pickup at: {order.branch.address}</p>
                    )}
                    {order.branchTransfers.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-neutral-100 pt-2">
                        {order.branchTransfers.map((t) => (
                          <p key={t.id} className="text-[11px] text-neutral-500">
                            {new Date(t.createdAt).toLocaleString()}: {t.fromBranch.name} → {t.toBranch.name} by {t.transferredByStaff?.name ?? "?"}
                            {t.note && <span> ({t.note})</span>}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>


                  {/* Delivery time */}
                  {isDeliveryType && (
                    <div className="rounded-lg border border-neutral-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase text-neutral-500">Delivery Time</p>
                          <p className="mt-1.5 text-2xl font-semibold leading-none text-neutral-900">
                            {order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not set"}
                          </p>
                          <p className="mt-1.5 text-[11px] text-neutral-400">Ordered at {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        {canEdit && !TERMINAL.has(order.status) && (
                          <div className="flex shrink-0 overflow-hidden rounded-lg border border-neutral-300 text-xs font-medium">
                            <button
                              onClick={() => adjustEta(-5)}
                              disabled={busy}
                              aria-label="Decrease by 5 minutes"
                              className="px-3 py-2 text-neutral-700 transition hover:bg-neutral-50 hover:text-brand-red disabled:opacity-50"
                            >
                              − 5 min
                            </button>
                            <span aria-hidden="true" className="w-px bg-neutral-300" />
                            <button
                              onClick={() => adjustEta(5)}
                              disabled={busy}
                              aria-label="Increase by 5 minutes"
                              className="px-3 py-2 text-neutral-700 transition hover:bg-neutral-50 hover:text-brand-red disabled:opacity-50"
                            >
                              + 5 min
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Rider */}
                  {isDeliveryType && (
                    <div className="rounded-lg border border-neutral-200 p-3">
                      <p className="text-xs font-semibold uppercase text-neutral-500">Rider</p>
                      {order.assignedRider ? (
                        <div className="mt-2 flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-sm font-semibold text-brand-red">
                            {order.assignedRider.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-neutral-900">{order.assignedRider.name}</p>
                            {order.assignedRider.phone && <p className="text-xs text-neutral-500">{order.assignedRider.phone}</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-xs">
                            {order.assignedRider.phone && (
                              <a href={whatsAppLink(order, order.assignedRider.phone)} target="_blank" rel="noreferrer" className="font-medium text-brand-red hover:underline">WhatsApp</a>
                            )}
                            {canAssignRider && !TERMINAL.has(order.status) && (
                              <button onClick={() => assignRider(null)} disabled={busy} className="text-neutral-400 hover:text-red-600 disabled:opacity-50">Unassign</button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-neutral-400">No rider assigned yet.</p>
                      )}
                    </div>
                  )}

                  {/* Order Information */}
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <p className="text-xs font-semibold uppercase text-neutral-500">Order Information</p>
                    <dl className="mt-1 divide-y divide-neutral-100 text-xs">
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-neutral-500">Source</dt>
                        <dd className="font-medium text-neutral-900">{order.source}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-neutral-500">Type</dt>
                        <dd className="flex items-center gap-2">
                          <span className="font-medium text-neutral-900">{order.type.replace(/_/g, " ")}</span>
                          {canEdit && typeSwap && !TERMINAL.has(order.status) && (
                            <button
                              onClick={() => changeType(typeSwap.to)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-red hover:underline disabled:opacity-50"
                            >
                              <FaRightLeft size={9} /> {typeSwap.label}
                            </button>
                          )}
                        </dd>
                      </div>
                      {order.table && (
                        <div className="flex items-center justify-between gap-3 py-2">
                          <dt className="text-neutral-500">Table</dt>
                          <dd className="font-medium text-neutral-900">{order.table.name ?? order.table.number}</dd>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-neutral-500">Payment</dt>
                        <dd className="flex items-center gap-2">
                          <span className="font-medium text-neutral-900">{order.paymentMethod}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${paymentChip(order.paymentStatus)}`}>{order.paymentStatus}</span>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-neutral-500">Placed</dt>
                        <dd className="font-medium text-neutral-900">{new Date(order.createdAt).toLocaleString()}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-neutral-500">Status</dt>
                        <dd className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[order.status] ?? "bg-neutral-100 text-neutral-600"}`}>{order.status.replace(/_/g, " ")}</span>
                          {canEdit && !TERMINAL.has(order.status) && (
                            <button onClick={() => setStatusPopupOpen(true)} className="text-[11px] font-medium text-brand-red hover:underline">Change</button>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>

                </div>
              </div>

              {/* Activity — status history, revisions and prints, one tab at a time */}
              <div className="mt-5 rounded-lg border border-neutral-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-1 text-xs font-semibold uppercase text-neutral-500">Activity</p>
                  {(
                    [
                      { key: "status", label: "Status History" },
                      { key: "revisions", label: `Revisions (${order.revisions.length})` },
                      { key: "prints", label: `Prints (${printEvents?.length ?? 0})` },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => {
                        setActivityTab(activityTab === t.key ? null : t.key);
                        if (t.key === "status") setShowHistory(true);
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        activityTab === t.key ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 text-neutral-600 hover:border-brand-red hover:text-brand-red"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {activityTab === "status" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
                      <div>
                        <p className="text-neutral-700">Order placed</p>
                        <p className="text-[10px] text-neutral-400">{new Date(order.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {!history && (
                      <div className="space-y-1.5">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-4/5" />
                      </div>
                    )}
                    {history?.map((h) => {
                      const detail = describeHistoryValue(h.newValue);
                      return (
                        <div key={h.id} className="flex items-start gap-2 text-xs">
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-red" />
                          <div>
                            <p className="text-neutral-700">
                              {HISTORY_ACTION_LABEL[h.action] ?? h.action}
                              {h.staffUser && <span className="text-neutral-400"> ({h.staffUser.name})</span>}
                            </p>
                            {detail && <p className="text-neutral-500">{detail}</p>}
                            <p className="text-[10px] text-neutral-400">{new Date(h.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })}
                    {history?.length === 0 && <p className="text-xs text-neutral-400">No changes recorded yet.</p>}
                  </div>
                )}

                {activityTab === "revisions" && (
                  <div className="mt-3">
                    {order.revisions.length === 0 ? (
                      <p className="text-xs text-neutral-400">No amendments. This order has not been modified since creation.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {order.revisions.map((r) => (
                          <div key={r.id} className="rounded-lg bg-neutral-50 px-3 py-2 text-xs">
                            <p>{new Date(r.createdAt).toLocaleString()}: {formatPaisa(r.previousGrandTotal)} → {formatPaisa(r.newGrandTotal)}</p>
                            {r.note && <p className="text-neutral-500">{r.note}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activityTab === "prints" && (
                  <div className="mt-3">
                    {!printEvents || printEvents.length === 0 ? (
                      <p className="text-xs text-neutral-400">No print actions logged yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {printEvents.map((e) => (
                          <div key={e.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-1.5 text-xs">
                            <span>{e.type}: {new Date(e.createdAt).toLocaleString()} by {e.staff?.name ?? "?"}</span>
                            <span className={`rounded-full px-2 py-0.5 ${e.status === "PRINTED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{e.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </div>

      {/* Add item picker — searchable, category-filtered list of every active product at this branch */}
      {addItemOpen && order && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setAddItemOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-neutral-900">Add Item</p>
                <p className="text-xs text-neutral-400">{order.orderNumber} · {order.branch.name}</p>
              </div>
              <button onClick={() => setAddItemOpen(false)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={12} />
              </button>
            </div>

            <div className="space-y-2.5 border-b border-neutral-100 px-4 py-3">
              <input
                autoFocus
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-red focus:outline-none"
              />
              {productCategories.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {["ALL", ...productCategories].map((c) => (
                    <button
                      key={c}
                      onClick={() => setProductCategory(c)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        productCategory === c ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 text-neutral-600 hover:border-brand-red hover:text-brand-red"
                      }`}
                    >
                      {c === "ALL" ? "All" : c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {!products ? (
                <div className="space-y-2 px-2 py-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-neutral-400">No matching products.</p>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openAddProduct(p.id)}
                    disabled={busy}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                      {p.images?.[0]?.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.images[0].url} alt="" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-900">{p.name}</span>
                      {p.category?.name && <span className="block truncate text-xs text-neutral-400">{p.category.name}</span>}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-neutral-700">{formatPaisa(p.discountPrice ?? p.basePrice)}</span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-red text-white">
                      <FaPlus size={10} />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status popup (spec §5) */}
      {statusPopupOpen && order && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setStatusPopupOpen(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-neutral-900">Change Status</p>
            <p className="mt-0.5 text-xs text-neutral-400">Current: {order.status}</p>
            <div className="mt-3 space-y-1.5">
              {NEXT_STATUS[order.status] && (
                <button onClick={() => changeStatus(NEXT_STATUS[order.status]!)} disabled={busy} className="w-full rounded-lg bg-brand-red py-2 text-xs font-medium text-white disabled:opacity-50">
                  {order.status === "PENDING" ? "Accept (→ Confirmed)" : `Mark ${NEXT_STATUS[order.status]!.replace(/_/g, " ")}`}
                </button>
              )}
              {canCancel && (
                <button onClick={() => changeStatus("CANCELLED")} disabled={busy} className="w-full rounded-lg border border-neutral-300 py-2 text-xs text-neutral-600 hover:text-red-600 disabled:opacity-50">Cancel Order</button>
              )}
              {canRefund && order.paymentStatus !== "REFUNDED" && (
                <button onClick={() => changeStatus("REFUNDED")} disabled={busy} className="w-full rounded-lg border border-red-300 py-2 text-xs text-red-600 disabled:opacity-50">Refund Order</button>
              )}
            </div>
            <button onClick={() => setStatusPopupOpen(false)} className="mt-3 w-full rounded-lg border border-neutral-300 py-2 text-xs">Close</button>
          </div>
        </div>
      )}

      {/* Branch transfer popup (spec §6/§7) — nearby (same-city) branches only */}
      {branchPopupOpen && order && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setBranchPopupOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-neutral-900">Change Branch</p>
            <p className="mt-0.5 text-xs text-neutral-400">Current: {order.branch.name} ({order.branch.city})</p>
            <div className="mt-3 space-y-2">
              <Select value={transferBranchId || undefined} onValueChange={setTransferBranchId}>
                <SelectTrigger className="w-full text-xs"><SelectValue placeholder="Select a nearby branch…" /></SelectTrigger>
                <SelectContent>
                  {nearbyBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}: {b.area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {allBranches && nearbyBranches.length === 0 && (
                <p className="text-[11px] text-neutral-400">No other branches in {order.branch.city}.</p>
              )}
              <input placeholder="Reason (optional)" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs" />
              <div className="flex gap-2">
                <button onClick={submitTransfer} disabled={busy || !transferBranchId} className="flex-1 rounded-lg bg-brand-red py-2 text-xs font-medium text-white disabled:opacity-50">Confirm Transfer</button>
                <button onClick={() => setBranchPopupOpen(false)} className="flex-1 rounded-lg border border-neutral-300 py-2 text-xs">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Rider popup (spec §17-19) — branch-scoped rider list + WhatsApp message preview */}
      {riderPopupOpen && order && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setRiderPopupOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-neutral-900">Assign Rider</p>
            <p className="mt-0.5 text-xs text-neutral-400">Riders at {order.branch.name} only</p>

            <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
              {(riders ?? []).filter((r) => r.status === "ACTIVE").map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRiderId(r.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${selectedRiderId === r.id ? "border-brand-red bg-red-50" : "border-neutral-200 hover:border-neutral-300"}`}
                >
                  <span>
                    <span className="font-medium text-neutral-900">{r.name}</span>
                    <span className="block text-neutral-400">{r.phone ?? "No phone on file"}</span>
                  </span>
                  <span className="text-[11px] text-neutral-400">{r.assignedOrders} assigned</span>
                </button>
              ))}
              {riders && riders.filter((r) => r.status === "ACTIVE").length === 0 && (
                <p className="text-xs text-neutral-400">No riders available at this branch.</p>
              )}
            </div>

            {selectedRiderId && (
              <div className="mt-3 border-t border-neutral-100 pt-3">
                <p className="text-xs font-semibold uppercase text-neutral-500">Message Preview</p>
                <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-2 text-[11px] text-neutral-600">{buildRiderMessage(order)}</pre>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => assignRiderFromPopup(false)} disabled={busy} className="flex-1 rounded-lg border border-neutral-300 py-2 text-xs font-medium disabled:opacity-50">Assign Rider</button>
                  <button onClick={() => assignRiderFromPopup(true)} disabled={busy} className="flex-1 rounded-lg bg-brand-red py-2 text-xs font-medium text-white disabled:opacity-50">Assign &amp; Send WhatsApp</button>
                </div>
              </div>
            )}

            <button onClick={() => { setRiderPopupOpen(false); setSelectedRiderId(""); }} className="mt-3 w-full rounded-lg border border-neutral-300 py-2 text-xs">Close</button>
          </div>
        </div>
      )}

      {configuringProduct && (
        <ProductConfigModal product={configuringProduct} initial={configuringInitial} onClose={closeConfigModal} onSave={saveConfiguredItem} addLabel="Add This Item" />
      )}

      {viewingCustomerId && <CustomerDetailModal id={viewingCustomerId} onClose={() => setViewingCustomerId(null)} />}
    </>
  );
}
