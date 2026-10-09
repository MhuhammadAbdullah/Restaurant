"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api } from "../../lib/api";
import { useMe, hasPermission } from "../../lib/useMe";
import { OrderDetailModal } from "../../components/orders/OrderDetailModal";
import { StatCard } from "../../components/StatCard";
import { Skeleton } from "../../components/ui/skeleton";
import { DateRangePopover } from "../../components/ui/date-range-popover";
import {
  ChartCard,
  DonutChart,
  HorizontalBars,
  OrdersTrendChart,
  PAYMENT_META,
  PeakHoursChart,
  RevenueTrendChart,
  STATUS_BAR_COLOR,
  STATUS_LABEL,
  TYPE_META,
  BRAND,
  type BarRow,
  type Slice,
  type TrendPoint,
} from "../../components/dashboard/charts";
import {
  StoreIcon,
  BanknoteIcon,
  TrendingUpIcon,
  BarChartIcon,
  UsersIcon,
  AlertCircleIcon,
  StarIcon,
  CrownIcon,
  GlobeIcon,
  ShoppingBagIcon,
  CalculatorIcon,
  XCircleIcon,
} from "../../components/icons";

type Summary = {
  branches: { total: number; active: number };
  revenue: { today: number; week: number; month: number };
  customers: { total: number; newToday: number };
  loyaltyPointsIssued: number;
  complaints: { open: number; total: number };
};

type PeriodTotals = { revenue: number; orders: number; avgOrderValue: number; cancelled: number };
type Analytics = {
  granularity: "hour" | "day";
  totals: PeriodTotals;
  previous: PeriodTotals;
  trend: TrendPoint[];
  byType: { type: string; orders: number; revenue: number }[];
  byPayment: { method: string; orders: number; revenue: number }[];
  byStatus: Record<string, number>;
  byBranch: { branchId: string; name: string; orders: number; revenue: number }[];
  byHour: { hour: number; orders: number }[];
};

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
function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
}
function startOfMonthStr() {
  const d = new Date();
  d.setDate(1);
  return toDateInput(d);
}
const todayStr = () => toDateInput(new Date());

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
] as const;
type Period = (typeof PERIODS)[number]["key"];

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

const STATUS_ORDER = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"];

/** Percent change vs the previous period of equal length; null when there is nothing to compare to. */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function KpiCard({
  icon: Icon,
  color,
  label,
  value,
  change,
  note,
  lowerIsBetter,
}: {
  icon: (p: { size?: number; className?: string }) => React.ReactElement;
  color: string;
  label: string;
  value: string;
  change: number | null;
  /** What the change is measured against, or why there is none. */
  note: string;
  lowerIsBetter?: boolean;
}) {
  const good = change == null ? null : lowerIsBetter ? change <= 0 : change >= 0;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${color}`}>
          <Icon size={18} />
        </span>
        {change != null && (
          <span title={note} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${good ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

/** How the period right before the selected one is called: "yesterday" for a single day, else "the previous N days". */
function previousPeriodName(from: string, to: string): string {
  const days = Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1;
  return days === 1 ? "yesterday" : `the previous ${days} days`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const canView = hasPermission(me, "reports.view");
  const canViewOrders = hasPermission(me, "orders.view");
  const [branchId, setBranchId] = useState<string>(""); // "" = All Branches
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);
  const range = useMemo(() => {
    if (period === "today") return { from: todayStr(), to: todayStr() };
    if (period === "7d") return { from: daysAgoStr(6), to: todayStr() };
    if (period === "30d") return { from: daysAgoStr(29), to: todayStr() };
    if (period === "month") return { from: startOfMonthStr(), to: todayStr() };
    return { from: customFrom, to: customTo };
  }, [period, customFrom, customTo]);
  const branchQs = branchId ? `branchId=${branchId}&` : "";
  const rangeQs = `from=${range.from}&to=${range.to}`;

  const { data } = useQuery({
    queryKey: ["dashboard-summary", branchId],
    queryFn: () => api.get<Summary>(`/reports/dashboard-summary${branchId ? `?branchId=${branchId}` : ""}`),
    enabled: canView,
  });

  const { data: analytics, isFetching: analyticsFetching } = useQuery({
    queryKey: ["dashboard-analytics", branchId, range.from, range.to],
    queryFn: () => api.get<Analytics>(`/reports/dashboard-analytics?${branchQs}${rangeQs}`),
    enabled: canView,
    refetchInterval: 30000,
    placeholderData: (prev) => prev,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["dashboard-recent-orders", branchId],
    queryFn: () => api.get<RecentOrder[]>(`/staff/orders?source=ONLINE&take=10${branchId ? `&branchId=${branchId}` : ""}`),
    enabled: canViewOrders,
    refetchInterval: 15000,
  });

  const { data: topItems } = useQuery({
    queryKey: ["dashboard-top-items", branchId, range.from, range.to],
    queryFn: () => api.get<TopItem[]>(`/reports/top-items?limit=10&${branchQs}${rangeQs}`),
    enabled: canView,
  });

  const { data: topCustomers } = useQuery({
    queryKey: ["dashboard-top-customers", branchId, range.from, range.to],
    queryFn: () => api.get<TopCustomer[]>(`/reports/top-customers?limit=20&${branchQs}${rangeQs}`),
    enabled: canView,
  });

  const branchList = me?.branches ?? [];
  const selectedBranchName = branchList.find((b) => b.id === branchId)?.name;
  const periodLabel = PERIODS.find((p) => p.key === period)!.label;
  const showBranchComparison = !branchId && (analytics?.byBranch.length ?? 0) > 1;

  const typeSlices: Slice[] = (analytics?.byType ?? []).map((t) => ({
    key: t.type,
    label: TYPE_META[t.type]?.label ?? t.type,
    value: t.orders,
    color: TYPE_META[t.type]?.color ?? "#898781",
  }));
  const paymentSlices: Slice[] = (analytics?.byPayment ?? []).map((p) => ({
    key: p.method,
    label: PAYMENT_META[p.method]?.label ?? p.method,
    value: p.orders,
    color: PAYMENT_META[p.method]?.color ?? "#898781",
  }));
  const statusRows: BarRow[] = STATUS_ORDER.filter((s) => (analytics?.byStatus[s] ?? 0) > 0).map((s) => ({
    key: s,
    label: STATUS_LABEL[s] ?? s,
    value: analytics!.byStatus[s]!,
    color: STATUS_BAR_COLOR(s),
  }));
  const branchRows: BarRow[] = (analytics?.byBranch ?? []).map((b) => ({
    key: b.branchId,
    label: b.name,
    value: b.revenue,
    extra: `${b.orders} orders`,
  }));
  const topItemRows: BarRow[] = (topItems ?? []).map((p) => ({ key: p.productId, label: p.name, value: p.quantitySold }));

  if (me && !canView) {
    return <p className="text-neutral-500">Use the sidebar to access your modules.</p>;
  }

  const totals = analytics?.totals;
  const previous = analytics?.previous;
  /** "Today's Revenue", "Last 7 Days Orders", "This Month's ...", or "... (1 Jul – 9 Oct)" for a custom range. */
  const kpiLabel = (base: string) => {
    switch (period) {
      case "today": return `Today's ${base}`;
      case "7d": return `Last 7 Days ${base}`;
      case "30d": return `Last 30 Days ${base}`;
      case "month": return `This Month's ${base}`;
      default: {
        const fmt = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
        return `${base} (${fmt(range.from)}${range.from === range.to ? "" : ` – ${fmt(range.to)}`})`;
      }
    }
  };
  const prevName = previousPeriodName(range.from, range.to);
  /** "vs yesterday" / "vs previous 7 days", or an honest reason when there is nothing to compare against. */
  const compareNote = (change: number | null) =>
    !previous || previous.orders === 0
      ? `No orders ${prevName === "yesterday" ? "yesterday" : `in ${prevName}`}`
      : change == null
        ? `None ${prevName === "yesterday" ? "yesterday" : `in ${prevName}`}`
        : `vs ${prevName === "yesterday" ? "yesterday" : prevName.replace("the ", "")}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            {selectedBranchName ?? (branchList.length > 1 ? "All branches" : branchList[0]?.name ?? "")} · {periodLabel}
            {period !== "today" && ` (${range.from} to ${range.to})`}
            {analyticsFetching && <span className="ml-2 text-neutral-400">Updating…</span>}
          </p>
        </div>
      </div>

      {/* Filters: branch (single / all) and period — they drive every number and chart below. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3">
        {branchList.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-neutral-500">Branch</span>
            {[{ id: "", name: "All Branches" }, ...branchList].map((b) => (
              <button
                key={b.id || "all"}
                onClick={() => setBranchId(b.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  branchId === b.id ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 text-neutral-600 hover:border-brand-red hover:text-brand-red"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs font-medium text-neutral-500">{branchList[0]?.name ?? ""}</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-neutral-300 p-0.5 text-xs">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  period === p.key ? "bg-brand-red text-white" : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <DateRangePopover
              from={customFrom}
              to={customTo}
              onChange={(from, to) => {
                setCustomFrom(from);
                setCustomTo(to);
              }}
            />
          )}
        </div>
      </div>

      {/* Overview — fixed windows (today / week / month) and account-wide counters */}
      <h2 className="mt-4 text-sm font-semibold text-neutral-700">Overview</h2>
      {!data ? (
        <div className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 p-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="mt-3 h-3 w-16" />
              <Skeleton className="mt-2 h-5 w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={StoreIcon} color="text-blue-600 bg-blue-50" label="Branches" value={`${data.branches.active}/${data.branches.total}`} />
          <StatCard icon={UsersIcon} color="text-purple-600 bg-purple-50" label="Total Customers" value={String(data.customers.total)} sub={`+${data.customers.newToday} today`} />
          <StatCard icon={AlertCircleIcon} color="text-red-600 bg-red-50" label="Open Complaints" value={String(data.complaints.open)} warn={data.complaints.open > 0} />
          <StatCard icon={StarIcon} color="text-pink-600 bg-pink-50" label="Loyalty Points Issued" value={String(data.loyaltyPointsIssued)} />
        </div>
      )}

      {/* KPIs for the selected period */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!totals || !previous ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 p-4">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="mt-3 h-3 w-16" />
              <Skeleton className="mt-2 h-6 w-24" />
            </div>
          ))
        ) : (
          <>
            <KpiCard icon={BanknoteIcon} color="text-red-600 bg-red-50" label={kpiLabel("Revenue")} value={formatPaisa(totals.revenue)} change={pctChange(totals.revenue, previous.revenue)} note={compareNote(pctChange(totals.revenue, previous.revenue))} />
            <KpiCard icon={ShoppingBagIcon} color="text-blue-600 bg-blue-50" label={kpiLabel("Orders")} value={String(totals.orders)} change={pctChange(totals.orders, previous.orders)} note={compareNote(pctChange(totals.orders, previous.orders))} />
            <KpiCard
              icon={CalculatorIcon}
              color="text-teal-600 bg-teal-50"
              label={kpiLabel("Avg. Order Value")}
              value={formatPaisa(totals.avgOrderValue)}
              change={pctChange(totals.avgOrderValue, previous.avgOrderValue)}
              note={compareNote(pctChange(totals.avgOrderValue, previous.avgOrderValue))}
            />
            <KpiCard
              icon={XCircleIcon}
              color="text-neutral-600 bg-neutral-100"
              label={kpiLabel("Cancelled / Refunded")}
              value={String(totals.cancelled)}
              change={pctChange(totals.cancelled, previous.cancelled)}
              note={compareNote(pctChange(totals.cancelled, previous.cancelled))}
              lowerIsBetter
            />
          </>
        )}
      </div>

      {/* Trends */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard title="Revenue" subtitle={analytics?.granularity === "hour" ? "by hour" : "by day"} className="lg:col-span-3" icon={<TrendingUpIcon size={16} className="mr-1.5 self-center text-brand-red" />}>
          {analytics ? <RevenueTrendChart data={analytics.trend} granularity={analytics.granularity} /> : <Skeleton className="h-64 w-full" />}
        </ChartCard>
        <ChartCard title="Orders" subtitle={analytics?.granularity === "hour" ? "by hour" : "by day"} className="lg:col-span-2" icon={<BarChartIcon size={16} className="mr-1.5 self-center text-brand-red" />}>
          {analytics ? <OrdersTrendChart data={analytics.trend} granularity={analytics.granularity} /> : <Skeleton className="h-64 w-full" />}
        </ChartCard>
      </div>

      {/* Breakdowns */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Orders by Type">
          {analytics ? <DonutChart slices={typeSlices} centerLabel="orders" /> : <Skeleton className="h-40 w-full" />}
        </ChartCard>
        <ChartCard title="Payment Method">
          {analytics ? <DonutChart slices={paymentSlices} centerLabel="orders" /> : <Skeleton className="h-40 w-full" />}
        </ChartCard>
        <ChartCard title="Order Status">
          {analytics ? <HorizontalBars rows={statusRows} valueLabel="Orders" /> : <Skeleton className="h-40 w-full" />}
        </ChartCard>
      </div>

      <div className={`mt-4 grid grid-cols-1 gap-4 ${showBranchComparison ? "lg:grid-cols-2" : ""}`}>
        {showBranchComparison && (
          <ChartCard title="Branch Comparison" subtitle="revenue by branch" icon={<StoreIcon size={16} className="mr-1.5 self-center text-brand-red" />}>
            <HorizontalBars rows={branchRows} color={BRAND} formatValue={(v) => formatPaisa(v)} valueLabel="Revenue" />
          </ChartCard>
        )}
        <ChartCard title="Peak Hours" subtitle="orders by hour of day">
          {analytics ? <PeakHoursChart data={analytics.byHour} /> : <Skeleton className="h-52 w-full" />}
        </ChartCard>
      </div>

      {/* Top items + top customers */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Top 10 Items" subtitle="units sold" icon={<TrendingUpIcon size={16} className="mr-1.5 self-center text-brand-red" />}>
          {topItems ? <HorizontalBars rows={topItemRows} color={BRAND} valueLabel="Units sold" /> : <Skeleton className="h-60 w-full" />}
        </ChartCard>

        <ChartCard title="Top 20 Customers" icon={<CrownIcon size={16} className="mr-1.5 self-center text-brand-red" />}>
          {!topCustomers || topCustomers.length === 0 ? (
            <p className="flex h-40 items-center justify-center text-sm text-neutral-400">No customer orders in this range.</p>
          ) : (
            <div className="max-h-[340px] space-y-1 overflow-y-auto pr-1">
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
        </ChartCard>
      </div>

      {canViewOrders && (
        <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
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

      {detailOrderId && (
        <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} onNavigateReceipt={(id) => router.push(`/pos/receipt/${id}`)} />
      )}
    </div>
  );
}
