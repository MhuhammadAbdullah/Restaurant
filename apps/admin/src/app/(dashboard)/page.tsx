"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api } from "../../lib/api";
import { useMe, hasPermission } from "../../lib/useMe";
import { OrderDetailModal } from "../../components/orders/OrderDetailModal";
import { Skeleton } from "../../components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { DateRangePopover } from "../../components/ui/date-range-popover";
import {
  StoreIcon,
  BanknoteIcon,
  TrendingUpIcon,
  BarChartIcon,
  UsersIcon,
  AlertCircleIcon,
  StarIcon,
  ClockIcon,
  CheckCircleIcon,
  ChefHatIcon,
  BellIcon,
  TruckIcon,
  CheckCheckIcon,
  XCircleIcon,
  CrownIcon,
  GlobeIcon,
} from "../../components/icons";

type Summary = {
  branches: { total: number; active: number };
  revenue: { today: number; week: number; month: number };
  customers: { total: number; newToday: number };
  loyaltyPointsIssued: number;
  complaints: { open: number; total: number };
};

type OrderStatusCounts = Record<string, number>;
type TopItem = { productId: string; name: string; quantitySold: number };
type TopCustomer = { customerId: string; name: string; phone: string; orderCount: number; totalSpent: number };
type RecentOrder = {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  customer: { name: string; phone: string } | null;
};

// Local YYYY-MM-DD (matches <input type="date">) — avoids UTC-shift off-by-one near midnight.
function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() {
  return toDateInput(new Date());
}
function startOfWeekStr() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return toDateInput(d);
}
function startOfMonthStr() {
  const d = new Date();
  d.setDate(1);
  return toDateInput(d);
}

const ORDER_PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
] as const;
type OrderPeriod = (typeof ORDER_PERIODS)[number]["key"];

const RECENT_ORDER_STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pending", color: "bg-amber-50 text-amber-700" },
  CONFIRMED: { label: "Confirmed", color: "bg-blue-50 text-blue-700" },
  PREPARING: { label: "Preparing", color: "bg-orange-50 text-orange-700" },
  READY: { label: "Ready", color: "bg-purple-50 text-purple-700" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", color: "bg-cyan-50 text-cyan-700" },
  DELIVERED: { label: "Delivered", color: "bg-green-50 text-green-700" },
  COMPLETED: { label: "Completed", color: "bg-green-50 text-green-700" },
  CANCELLED: { label: "Cancelled", color: "bg-red-50 text-red-700" },
  REFUNDED: { label: "Refunded", color: "bg-neutral-100 text-neutral-600" },
};

const ORDER_STATUS_META: Record<string, { label: string; icon: (p: { size?: number; className?: string }) => React.ReactElement; color: string }> = {
  pending: { label: "Pending", icon: ClockIcon, color: "text-amber-600 bg-amber-50" },
  confirmed: { label: "Confirmed", icon: CheckCircleIcon, color: "text-blue-600 bg-blue-50" },
  preparing: { label: "Preparing", icon: ChefHatIcon, color: "text-orange-600 bg-orange-50" },
  ready: { label: "Ready", icon: BellIcon, color: "text-purple-600 bg-purple-50" },
  outForDelivery: { label: "Out for Delivery", icon: TruckIcon, color: "text-cyan-600 bg-cyan-50" },
  delivered: { label: "Delivered", icon: CheckCheckIcon, color: "text-green-600 bg-green-50" },
  cancelled: { label: "Cancelled", icon: XCircleIcon, color: "text-red-600 bg-red-50" },
};
const ORDER_STATUS_ORDER = ["pending", "confirmed", "preparing", "ready", "outForDelivery", "delivered", "cancelled"];

export default function DashboardPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const canView = hasPermission(me, "reports.view");
  const canViewOrders = hasPermission(me, "orders.view");
  const [branchId, setBranchId] = useState<string>(""); // "" = All Branches
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["dashboard-summary", branchId],
    queryFn: () => api.get<Summary>(`/reports/dashboard-summary${branchId ? `?branchId=${branchId}` : ""}`),
    enabled: canView,
  });

  const [orderPeriod, setOrderPeriod] = useState<OrderPeriod>("today");
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);
  const orderRange = useMemo(() => {
    if (orderPeriod === "today") return { from: todayStr(), to: todayStr() };
    if (orderPeriod === "week") return { from: startOfWeekStr(), to: todayStr() };
    if (orderPeriod === "month") return { from: startOfMonthStr(), to: todayStr() };
    return { from: customFrom, to: customTo };
  }, [orderPeriod, customFrom, customTo]);
  const { data: orderCounts } = useQuery({
    queryKey: ["dashboard-order-status-counts", branchId, orderRange.from, orderRange.to],
    queryFn: () =>
      api.get<OrderStatusCounts>(
        `/reports/order-status-counts?${branchId ? `branchId=${branchId}&` : ""}from=${orderRange.from}&to=${orderRange.to}`,
      ),
    enabled: canView,
    refetchInterval: 15000,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["dashboard-recent-orders", branchId],
    queryFn: () => api.get<RecentOrder[]>(`/staff/orders?source=ONLINE&take=10${branchId ? `&branchId=${branchId}` : ""}`),
    enabled: canViewOrders,
    refetchInterval: 15000,
  });

  const [itemsFrom, setItemsFrom] = useState(todayStr);
  const [itemsTo, setItemsTo] = useState(todayStr);
  const { data: topItems } = useQuery({
    queryKey: ["dashboard-top-items", branchId, itemsFrom, itemsTo],
    queryFn: () =>
      api.get<TopItem[]>(
        `/reports/top-items?limit=10${branchId ? `&branchId=${branchId}` : ""}${itemsFrom ? `&from=${itemsFrom}` : ""}${itemsTo ? `&to=${itemsTo}` : ""}`,
      ),
    enabled: canView,
  });

  const [customersFrom, setCustomersFrom] = useState(startOfMonthStr);
  const [customersTo, setCustomersTo] = useState(todayStr);
  const { data: topCustomers } = useQuery({
    queryKey: ["dashboard-top-customers", branchId, customersFrom, customersTo],
    queryFn: () =>
      api.get<TopCustomer[]>(
        `/reports/top-customers?limit=20${branchId ? `&branchId=${branchId}` : ""}${customersFrom ? `&from=${customersFrom}` : ""}${customersTo ? `&to=${customersTo}` : ""}`,
      ),
    enabled: canView,
  });

  if (me && !canView) {
    return <p className="text-neutral-500">Use the sidebar to access your modules.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
        {me && me.branches.length > 1 && (
          <Select value={branchId || "all"} onValueChange={(v) => setBranchId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {me.branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!data ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 p-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="mt-3 h-3 w-16" />
              <Skeleton className="mt-2 h-5 w-20" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Card icon={StoreIcon} color="text-blue-600 bg-blue-50" label="Branches" value={`${data.branches.active}/${data.branches.total}`} />
            <Card icon={BanknoteIcon} color="text-green-600 bg-green-50" label="Today's Revenue" value={formatPaisa(data.revenue.today)} />
            <Card icon={TrendingUpIcon} color="text-emerald-600 bg-emerald-50" label="Week Revenue" value={formatPaisa(data.revenue.week)} />
            <Card icon={BarChartIcon} color="text-teal-600 bg-teal-50" label="Month Revenue" value={formatPaisa(data.revenue.month)} />
            <Card icon={UsersIcon} color="text-purple-600 bg-purple-50" label="Total Customers" value={String(data.customers.total)} sub={`+${data.customers.newToday} today`} />
            <Card icon={AlertCircleIcon} color="text-red-600 bg-red-50" label="Open Complaints" value={String(data.complaints.open)} warn={data.complaints.open > 0} />
            <Card icon={StarIcon} color="text-pink-600 bg-pink-50" label="Loyalty Points Issued" value={String(data.loyaltyPointsIssued)} />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-neutral-700">Orders</h2>
              {orderCounts && (
                <span className="rounded-full bg-neutral-900 px-2.5 py-0.5 text-xs font-medium text-white">
                  {ORDER_STATUS_ORDER.reduce((sum, s) => sum + (orderCounts[s] ?? 0), 0)} total
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-neutral-300 p-0.5 text-xs">
                {ORDER_PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setOrderPeriod(p.key)}
                    className={`rounded-md px-2.5 py-1 font-medium transition ${
                      orderPeriod === p.key ? "bg-brand-red text-white" : "text-neutral-500 hover:text-neutral-900"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {orderPeriod === "custom" && (
                <DateRangePopover from={customFrom} to={customTo} onChange={(from, to) => { setCustomFrom(from); setCustomTo(to); }} />
              )}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-7">
            {ORDER_STATUS_ORDER.map((status) => {
              const meta = ORDER_STATUS_META[status]!;
              const Icon = meta.icon;
              return (
                <div key={status} className="rounded-lg border border-neutral-200 p-3 text-center">
                  <span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full ${meta.color}`}>
                    <Icon size={16} />
                  </span>
                  <p className="mt-1.5 text-lg font-semibold text-neutral-900">{orderCounts?.[status] ?? 0}</p>
                  <p className="text-xs text-neutral-500">{meta.label}</p>
                </div>
              );
            })}
          </div>

          {canViewOrders && (
            <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <GlobeIcon size={16} className="text-brand-red" />
                <h2 className="text-sm font-semibold text-neutral-700">Recent Orders</h2>
                <span className="text-xs text-neutral-400">Latest 10 · received online through the website</span>
              </div>
              {!recentOrders || recentOrders.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-400">No online orders yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-neutral-400">
                      <tr>
                        <th className="py-1.5 pr-3">Order #</th>
                        <th className="py-1.5 pr-3">Customer</th>
                        <th className="py-1.5 pr-3">Type</th>
                        <th className="py-1.5 pr-3">Total</th>
                        <th className="py-1.5 pr-3">Placed</th>
                        <th className="py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {recentOrders.map((o) => {
                        const meta = RECENT_ORDER_STATUS_META[o.status] ?? { label: o.status, color: "bg-neutral-100 text-neutral-600" };
                        return (
                          <tr key={o.id} onClick={() => setDetailOrderId(o.id)} className="cursor-pointer hover:bg-neutral-50">
                            <td className="py-2 pr-3 font-medium text-brand-red">{o.orderNumber}</td>
                            <td className="py-2 pr-3 text-neutral-600">{o.customer?.name ?? "Guest"}</td>
                            <td className="py-2 pr-3 text-neutral-500">{o.type.replace(/_/g, " ")}</td>
                            <td className="py-2 pr-3 text-neutral-600">{formatPaisa(o.grandTotal)}</td>
                            <td className="py-2 pr-3 text-neutral-400">{new Date(o.createdAt).toLocaleString()}</td>
                            <td className="py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>{meta.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUpIcon size={16} className="text-brand-red" />
                  <h2 className="text-sm font-semibold text-neutral-700">Top 10 Items</h2>
                </div>
                <DateRangePopover from={itemsFrom} to={itemsTo} onChange={(from, to) => { setItemsFrom(from); setItemsTo(to); }} />
              </div>
              {!topItems || topItems.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-400">No orders in this range.</p>
              ) : (
                <div className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1">
                  {topItems.map((p, i) => (
                    <div key={p.productId} className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-500">{i + 1}</span>
                        {p.name}
                      </span>
                      <span className="shrink-0 text-neutral-500">{p.quantitySold} sold</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CrownIcon size={16} className="text-brand-red" />
                  <h2 className="text-sm font-semibold text-neutral-700">Top 20 Customers</h2>
                </div>
                <DateRangePopover from={customersFrom} to={customersTo} onChange={(from, to) => { setCustomersFrom(from); setCustomersTo(to); }} />
              </div>
              {!topCustomers || topCustomers.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-400">No customer orders in this range.</p>
              ) : (
                <div className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1">
                  {topCustomers.map((c, i) => (
                    <div key={c.customerId} className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-500">{i + 1}</span>
                        <span>
                          {c.name}
                          {c.phone && <span className="text-neutral-400"> · {c.phone}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-neutral-500">
                        {formatPaisa(c.totalSpent)} · {c.orderCount} orders
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {detailOrderId && (
        <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} onNavigateReceipt={(id) => router.push(`/pos/receipt/${id}`)} />
      )}
    </div>
  );
}

function Card({
  icon: Icon,
  color,
  label,
  value,
  sub,
  warn,
}: {
  icon: (p: { size?: number; className?: string }) => React.ReactElement;
  color: string;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white"}`}>
      <span className={`flex h-9 w-9 items-center justify-center rounded-full ${warn ? "bg-red-100 text-red-600" : color}`}>
        <Icon size={18} />
      </span>
      <p className="mt-2 text-xs text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${warn ? "text-red-600" : "text-neutral-900"}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}
