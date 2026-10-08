"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { FaDownload, FaFileExcel, FaFilePdf, FaMagnifyingGlass } from "react-icons/fa6";
import { api, getAccessToken } from "../../../../lib/api";
import { toast } from "../../../../store/useToastStore";
import { useSelectedBranch } from "../../../../lib/useSelectedBranch";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { DateRangePopover } from "../../../../components/ui/date-range-popover";
import { Skeleton } from "../../../../components/ui/skeleton";
import { OrderDetailModal } from "../../../../components/orders/OrderDetailModal";

type Row = {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  source: string;
  orderType: string;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  grandTotal: number;
  collectedAmount: number;
  outstandingAmount: number;
  refundAmount: number;
  transactionRef: string;
  paymentAttempts: number;
  isSale: boolean;
};
type Breakdown = { key: string; label: string; orders: number; netSales: number; tax: number; totalBilled: number; collected: number; outstanding: number };
type FinanceReport = {
  rows: Row[];
  salesSummary: { orders: number; subtotal: number; discounts: number; netSales: number; deliveryFees: number; tax: number; totalBilled: number; averageOrderValue: number };
  byMethod: Breakdown[];
  byBranch: Breakdown[];
  byDay: (Breakdown & { refunds: number })[];
  codReceivable: { withRiders: number; withRidersOrders: number; inTransit: number; inTransitOrders: number; aging: { label: string; orders: number; amount: number }[] };
  orderSummary: { totalOrderAttempts: number; successfulOrders: number; codOrders: number; onlineOrders: number };
  paymentSummary: { paid: number; pending: number; failed: number; expired: number; cancelled: number; refunded: number; partiallyPaid: number };
  financialSummary: {
    grossOrderValue: number;
    onlineCollected: number;
    codCollected: number;
    otherCollected: number;
    totalCollected: number;
    outstandingCod: number;
    pendingOnlineValue: number;
    failedExpiredValue: number;
    refundedAmount: number;
  };
};

const SOURCES = ["ONLINE", "POS"];
const ORDER_TYPES = ["ONLINE_DELIVERY", "ONLINE_PICKUP", "DINE_IN", "WALK_IN", "TAKEAWAY", "DELIVERY"];
const PAYMENT_METHODS = ["COD", "ONLINE", "CASH", "CARD", "QR"];
const PAYMENT_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED"];

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "month", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "custom", label: "Custom" },
] as const;
type Period = (typeof PERIODS)[number]["key"];

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function periodRange(period: Period): { from: string; to: string } | null {
  const now = new Date();
  const day = (offset: number) => toDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
  switch (period) {
    case "today": return { from: day(0), to: day(0) };
    case "yesterday": return { from: day(-1), to: day(-1) };
    case "7d": return { from: day(-6), to: day(0) };
    case "30d": return { from: day(-29), to: day(0) };
    case "month": return { from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: day(0) };
    case "lastMonth": return { from: toDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: toDateInput(new Date(now.getFullYear(), now.getMonth(), 0)) };
    default: return null;
  }
}
const prettyDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  PAID: "bg-green-50 text-green-700",
  PENDING: "bg-amber-50 text-amber-700",
  PARTIALLY_PAID: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  CANCELLED: "bg-red-50 text-red-700",
  EXPIRED: "bg-neutral-100 text-neutral-600",
  REFUNDED: "bg-purple-50 text-purple-700",
};
const ORDER_STATUS_COLOR: Record<string, string> = {
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

const LEDGER_VIEWS = [
  { key: "all", label: "All records" },
  { key: "sales", label: "Sales only" },
  { key: "outstanding", label: "Outstanding" },
  { key: "exceptions", label: "Failed / cancelled / refunded" },
] as const;
type LedgerView = (typeof LEDGER_VIEWS)[number]["key"];
const PAGE_SIZE = 50;

function StatementLine({ label, value, bold, tone, indent }: { label: string; value: number; bold?: boolean; tone?: "negative" | "muted"; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${bold ? "border-t border-neutral-200 font-semibold text-neutral-900" : "text-neutral-600"} ${indent ? "pl-4" : ""}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${tone === "negative" ? "text-green-700" : tone === "muted" ? "text-neutral-400" : bold ? "text-neutral-900" : "text-neutral-800"}`}>
        {tone === "negative" && value > 0 ? "-" : ""}
        {formatPaisa(value)}
      </span>
    </div>
  );
}

function BreakdownTable({ title, firstHeader, rows, showRefunds }: { title: string; firstHeader: string; rows: (Breakdown & { refunds?: number })[]; showRefunds?: boolean }) {
  const total = rows.reduce(
    (t, r) => ({
      orders: t.orders + r.orders,
      netSales: t.netSales + r.netSales,
      tax: t.tax + r.tax,
      totalBilled: t.totalBilled + r.totalBilled,
      collected: t.collected + r.collected,
      outstanding: t.outstanding + r.outstanding,
      refunds: t.refunds + (r.refunds ?? 0),
    }),
    { orders: 0, netSales: 0, tax: 0, totalBilled: 0, collected: 0, outstanding: 0, refunds: 0 },
  );
  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <p className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-800">{title}</p>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">{firstHeader}</th>
              <th className="px-3 py-2 text-right font-medium">Orders</th>
              <th className="px-3 py-2 text-right font-medium">Net sales</th>
              <th className="px-3 py-2 text-right font-medium">Tax</th>
              <th className="px-3 py-2 text-right font-medium">Total billed</th>
              <th className="px-3 py-2 text-right font-medium">Collected</th>
              <th className="px-3 py-2 text-right font-medium">Outstanding</th>
              {showRefunds && <th className="px-3 py-2 text-right font-medium">Refunds</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 tabular-nums">
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-neutral-50">
                <td className="whitespace-nowrap px-4 py-2 font-medium text-neutral-800">{showRefunds ? prettyDate(r.key) : r.label}</td>
                <td className="px-3 py-2 text-right">{r.orders}</td>
                <td className="px-3 py-2 text-right">{formatPaisa(r.netSales)}</td>
                <td className="px-3 py-2 text-right text-neutral-500">{formatPaisa(r.tax)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatPaisa(r.totalBilled)}</td>
                <td className="px-3 py-2 text-right text-green-700">{formatPaisa(r.collected)}</td>
                <td className={`px-3 py-2 text-right ${r.outstanding > 0 ? "font-medium text-amber-700" : "text-neutral-400"}`}>{r.outstanding > 0 ? formatPaisa(r.outstanding) : "—"}</td>
                {showRefunds && <td className={`px-3 py-2 text-right ${(r.refunds ?? 0) > 0 ? "text-purple-700" : "text-neutral-400"}`}>{(r.refunds ?? 0) > 0 ? formatPaisa(r.refunds ?? 0) : "—"}</td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={showRefunds ? 8 : 7} className="px-4 py-8 text-center text-neutral-400">No sales in this period.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-neutral-50 text-sm font-semibold tabular-nums">
              <tr className="border-t border-neutral-200">
                <td className="px-4 py-2">Total</td>
                <td className="px-3 py-2 text-right">{total.orders}</td>
                <td className="px-3 py-2 text-right">{formatPaisa(total.netSales)}</td>
                <td className="px-3 py-2 text-right">{formatPaisa(total.tax)}</td>
                <td className="px-3 py-2 text-right">{formatPaisa(total.totalBilled)}</td>
                <td className="px-3 py-2 text-right text-green-700">{formatPaisa(total.collected)}</td>
                <td className="px-3 py-2 text-right text-amber-700">{formatPaisa(total.outstanding)}</td>
                {showRefunds && <td className="px-3 py-2 text-right text-purple-700">{formatPaisa(total.refunds)}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default function FinanceReportsPage() {
  const router = useRouter();
  const { branchId, branches, setBranchId } = useSelectedBranch();
  const { data: me } = useMe();
  const canExport = hasPermission(me, "reports.export");

  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState(() => periodRange("30d")!.from);
  const [customTo, setCustomTo] = useState(() => periodRange("30d")!.to);
  const [sourceFilter, setSourceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [downloading, setDownloading] = useState<"csv" | "xlsx" | "pdf" | null>(null);
  const [ledgerView, setLedgerView] = useState<LedgerView>("all");
  const [page, setPage] = useState(0);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const range = period === "custom" ? { from: customFrom, to: customTo } : periodRange(period)!;
  const filtersActive = !!(sourceFilter || typeFilter || paymentMethodFilter || paymentStatusFilter || search.trim());

  function buildQuery() {
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    if (sourceFilter) params.set("source", sourceFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (paymentMethodFilter) params.set("paymentMethod", paymentMethodFilter);
    if (paymentStatusFilter) params.set("paymentStatus", paymentStatusFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    return params.toString();
  }

  const { data: report, isFetching } = useQuery({
    queryKey: ["finance-report", branchId, sourceFilter, typeFilter, paymentMethodFilter, paymentStatusFilter, debouncedSearch, range.from, range.to],
    queryFn: () => api.get<FinanceReport>(`/reports/finance?${buildQuery()}`),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    setPage(0);
  }, [ledgerView, branchId, sourceFilter, typeFilter, paymentMethodFilter, paymentStatusFilter, debouncedSearch, range.from, range.to]);

  async function download(format: "csv" | "xlsx" | "pdf") {
    setDownloading(format);
    try {
      const token = getAccessToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";
      const res = await fetch(`${apiUrl}/reports/finance/export.${format}?${buildQuery()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finance-report-${range.from}_to_${range.to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download report");
    } finally {
      setDownloading(null);
    }
  }

  function clearFilters() {
    setSourceFilter("");
    setTypeFilter("");
    setPaymentMethodFilter("");
    setPaymentStatusFilter("");
    setSearch("");
  }

  const ledgerRows = useMemo(() => {
    const rows = report?.rows ?? [];
    switch (ledgerView) {
      case "sales": return rows.filter((r) => r.isSale);
      case "outstanding": return rows.filter((r) => r.outstandingAmount > 0);
      case "exceptions": return rows.filter((r) => !r.isSale || r.refundAmount > 0);
      default: return rows;
    }
  }, [report, ledgerView]);
  const ledgerTotals = useMemo(() => {
    const sales = ledgerRows.filter((r) => r.isSale);
    const sum = (key: keyof Row) => sales.reduce((s, r) => s + (r[key] as number), 0);
    return { orders: sales.length, subtotal: sum("subtotal"), discount: sum("discount"), deliveryFee: sum("deliveryFee"), tax: sum("tax"), grandTotal: sum("grandTotal"), collected: sum("collectedAmount"), outstanding: sum("outstandingAmount") };
  }, [ledgerRows]);
  const pageCount = Math.max(1, Math.ceil(ledgerRows.length / PAGE_SIZE));
  const pageRows = ledgerRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const branchLabel = branches.find((b) => b.id === branchId)?.name ?? "All branches";
  const ss = report?.salesSummary;
  const fs = report?.financialSummary;
  const cod = report?.codReceivable;
  const totalReceivable = (cod?.withRiders ?? 0) + (cod?.inTransit ?? 0) + (fs?.pendingOnlineValue ?? 0);

  const exportBtn = "inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-brand-red hover:text-brand-red disabled:opacity-50";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Order &amp; Finance Reports</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-neutral-500">
            Sales statement, collections and receivables for accounts. Every order and payment attempt is included — unpaid, failed and expired online payments too — so nothing is hidden from reconciliation.
          </p>
        </div>
        {canExport && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => download("xlsx")} disabled={downloading !== null} className={exportBtn}>
              <FaFileExcel size={14} className="text-green-600" /> {downloading === "xlsx" ? "Preparing..." : "Excel"}
            </button>
            <button onClick={() => download("pdf")} disabled={downloading !== null} className={exportBtn}>
              <FaFilePdf size={14} className="text-red-600" /> {downloading === "pdf" ? "Preparing..." : "PDF"}
            </button>
            <button onClick={() => download("csv")} disabled={downloading !== null} className={exportBtn}>
              <FaDownload size={12} /> {downloading === "csv" ? "Preparing..." : "CSV"}
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-lg border border-neutral-300 bg-white p-0.5 text-xs">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${period === p.key ? "bg-brand-red text-white" : "text-neutral-500 hover:text-neutral-900"}`}
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <FaMagnifyingGlass size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              placeholder="Search order #, name, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-sm placeholder:text-neutral-400 focus:border-brand-red focus:outline-none"
            />
          </div>
          {branches.length > 1 && (
            <Select value={branchId || "all"} onValueChange={(v) => setBranchId(v === "all" ? null : v)}>
              <SelectTrigger className="w-56"><SelectValue placeholder="All Branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={sourceFilter || "all"} onValueChange={(v) => setSourceFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter || "all"} onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All order types</SelectItem>
              {ORDER_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={paymentMethodFilter || "all"} onValueChange={(v) => setPaymentMethodFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment methods</SelectItem>
              {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={paymentStatusFilter || "all"} onValueChange={(v) => setPaymentStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment statuses</SelectItem>
              {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtersActive && (
            <button onClick={clearFilters} className="text-xs font-medium text-brand-red hover:underline">Clear filters</button>
          )}
        </div>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
        <span className="font-semibold text-neutral-700">{prettyDate(range.from)}{range.from !== range.to && ` – ${prettyDate(range.to)}`}</span>
        <span>·</span>
        <span>{branchLabel}</span>
        <span>·</span>
        <span>{report ? `${report.rows.length} record${report.rows.length === 1 ? "" : "s"}` : "Loading..."}</span>
        {isFetching && report && <span className="text-neutral-400">Updating…</span>}
      </p>

      {!report ? (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-32" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Net sales</p>
              <p className="mt-1.5 text-2xl font-bold text-neutral-900">{formatPaisa(ss!.netSales)}</p>
              <p className="mt-0.5 text-xs text-neutral-400">{ss!.orders} orders · avg {formatPaisa(ss!.averageOrderValue)}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Tax collected</p>
              <p className="mt-1.5 text-2xl font-bold text-neutral-900">{formatPaisa(ss!.tax)}</p>
              <p className="mt-0.5 text-xs text-neutral-400">Delivery fees {formatPaisa(ss!.deliveryFees)}</p>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-green-700">Total collected</p>
              <p className="mt-1.5 text-2xl font-bold text-green-700">{formatPaisa(fs!.totalCollected)}</p>
              <p className="mt-0.5 text-xs text-neutral-500">Online {formatPaisa(fs!.onlineCollected)} · COD {formatPaisa(fs!.codCollected)} · Other {formatPaisa(fs!.otherCollected)}</p>
            </div>
            <div className={`rounded-xl border p-4 ${totalReceivable > 0 ? "border-amber-200 bg-amber-50/50" : "border-neutral-200 bg-white"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${totalReceivable > 0 ? "text-amber-700" : "text-neutral-500"}`}>Still to receive</p>
              <p className={`mt-1.5 text-2xl font-bold ${totalReceivable > 0 ? "text-amber-700" : "text-neutral-900"}`}>{formatPaisa(totalReceivable)}</p>
              <p className="mt-0.5 text-xs text-neutral-500">COD + pending online payments</p>
            </div>
          </div>

          {/* Statement + receivable */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 lg:col-span-3">
              <p className="text-sm font-semibold text-neutral-800">Sales statement</p>
              <p className="text-xs text-neutral-400">Recognised sales only — cancelled, refunded and unpaid-online orders are excluded.</p>
              <div className="mt-3 divide-y divide-neutral-100">
                <div>
                  <StatementLine label="Item sales (subtotal)" value={ss!.subtotal} />
                  <StatementLine label="Less: discounts, coupons & loyalty" value={ss!.discounts} tone="negative" />
                  <StatementLine label="Net sales" value={ss!.netSales} bold />
                  <StatementLine label="Add: delivery fees" value={ss!.deliveryFees} />
                  <StatementLine label="Add: tax collected" value={ss!.tax} />
                  <StatementLine label="Total billed to customers" value={ss!.totalBilled} bold />
                </div>
                <div className="pt-2">
                  <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Settlement</p>
                  <StatementLine label="Collected online" value={fs!.onlineCollected} indent />
                  <StatementLine label="Collected cash on delivery (received by admin)" value={fs!.codCollected} indent />
                  <StatementLine label="Collected at counter (cash / card / QR)" value={fs!.otherCollected} indent />
                  <StatementLine label="Total collected" value={fs!.totalCollected} bold />
                  <StatementLine label="COD held by riders" value={cod!.withRiders} indent />
                  <StatementLine label="COD out for delivery" value={cod!.inTransit} indent />
                  <StatementLine label="Pending online payments" value={fs!.pendingOnlineValue} indent />
                </div>
                <div className="pt-2">
                  <StatementLine label="Refunded to customers" value={fs!.refundedAmount} />
                  <StatementLine label="Failed / expired online value (not billed)" value={fs!.failedExpiredValue} tone="muted" />
                </div>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-2">
              <div className={`rounded-xl border p-4 ${cod!.withRiders > 0 ? "border-red-200 bg-red-50/40" : "border-neutral-200 bg-white"}`}>
                <p className="text-sm font-semibold text-neutral-800">COD cash receivable</p>
                <p className="text-xs text-neutral-400">Delivered orders stay unpaid until an admin receives the rider&apos;s cash.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-neutral-500">Held by riders</p>
                    <p className={`text-xl font-bold ${cod!.withRiders > 0 ? "text-red-600" : "text-neutral-900"}`}>{formatPaisa(cod!.withRiders)}</p>
                    <p className="text-xs text-neutral-400">{cod!.withRidersOrders} delivered order{cod!.withRidersOrders === 1 ? "" : "s"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Out for delivery</p>
                    <p className="text-xl font-bold text-neutral-900">{formatPaisa(cod!.inTransit)}</p>
                    <p className="text-xs text-neutral-400">{cod!.inTransitOrders} order{cod!.inTransitOrders === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">Age of cash held by riders</p>
                <div className="mt-1.5 space-y-1">
                  {cod!.aging.map((b, i) => (
                    <div key={b.label} className="flex items-center justify-between text-sm">
                      <span className="text-neutral-600">{b.label}</span>
                      <span className={`tabular-nums ${b.amount > 0 && i >= 2 ? "font-semibold text-red-600" : b.amount > 0 ? "font-medium text-neutral-800" : "text-neutral-300"}`}>
                        {b.amount > 0 ? `${formatPaisa(b.amount)} · ${b.orders}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <button onClick={() => router.push("/riders")} className="mt-4 text-xs font-medium text-brand-red hover:underline">Settle rider cash on the Riders page →</button>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="text-sm font-semibold text-neutral-800">Orders &amp; payments</p>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {[
                    ["Order attempts", report.orderSummary.totalOrderAttempts],
                    ["Successful orders", report.orderSummary.successfulOrders],
                    ["COD orders", report.orderSummary.codOrders],
                    ["Online orders", report.orderSummary.onlineOrders],
                    ["Paid", report.paymentSummary.paid],
                    ["Pending", report.paymentSummary.pending],
                    ["Part paid", report.paymentSummary.partiallyPaid],
                    ["Failed", report.paymentSummary.failed],
                    ["Expired", report.paymentSummary.expired],
                    ["Cancelled", report.paymentSummary.cancelled],
                    ["Refunded", report.paymentSummary.refunded],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between">
                      <span className="text-neutral-500">{label}</span>
                      <span className="font-semibold tabular-nums text-neutral-900">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Breakdowns */}
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <BreakdownTable title="By payment method" firstHeader="Method" rows={report.byMethod} />
            <BreakdownTable title="By branch" firstHeader="Branch" rows={report.byBranch} />
          </div>
          <div className="mt-4">
            <BreakdownTable title="Daily sales register" firstHeader="Date" rows={report.byDay} showRefunds />
          </div>

          {/* Order ledger */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-neutral-800">Order ledger</h2>
            <div className="flex flex-wrap rounded-lg border border-neutral-300 bg-white p-0.5 text-xs">
              {LEDGER_VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setLedgerView(v.key)}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${ledgerView === v.key ? "bg-brand-red text-white" : "text-neutral-500 hover:text-neutral-900"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Order</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Branch</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Method</th>
                  <th className="px-3 py-2.5 font-medium">Payment</th>
                  <th className="px-3 py-2.5 font-medium">Order status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Subtotal</th>
                  <th className="px-3 py-2.5 text-right font-medium">Discount</th>
                  <th className="px-3 py-2.5 text-right font-medium">Delivery</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tax</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 text-right font-medium">Collected</th>
                  <th className="px-3 py-2.5 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 tabular-nums">
                {pageRows.map((r) => (
                  <tr key={r.orderId} onClick={() => setDetailOrderId(r.orderId)} className={`cursor-pointer transition hover:bg-neutral-50 ${r.isSale ? "" : "bg-neutral-50/60 text-neutral-500"}`}>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-brand-red">{r.orderNumber}</span>
                      {!r.isSale && <span className="ml-1.5 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-600">Not a sale</span>}
                      {r.paymentAttempts > 1 && <span className="ml-1.5 text-[10px] text-neutral-400">{r.paymentAttempts} attempts</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-neutral-500">{new Date(r.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-3 py-2.5">{r.branchName}</td>
                    <td className="px-3 py-2.5">{r.customerName}</td>
                    <td className="px-3 py-2.5 text-xs font-medium">{r.paymentMethod}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PAYMENT_STATUS_COLOR[r.paymentStatus] ?? "bg-neutral-100 text-neutral-600"}`}>{r.paymentStatus.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ORDER_STATUS_COLOR[r.orderStatus] ?? "bg-neutral-100 text-neutral-600"}`}>{r.orderStatus.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatPaisa(r.subtotal)}</td>
                    <td className="px-3 py-2.5 text-right">{r.discount > 0 ? `-${formatPaisa(r.discount)}` : "—"}</td>
                    <td className="px-3 py-2.5 text-right">{r.deliveryFee > 0 ? formatPaisa(r.deliveryFee) : "—"}</td>
                    <td className="px-3 py-2.5 text-right">{formatPaisa(r.tax)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-neutral-900">{formatPaisa(r.grandTotal)}</td>
                    <td className="px-3 py-2.5 text-right text-green-700">{r.collectedAmount > 0 ? formatPaisa(r.collectedAmount) : "—"}</td>
                    <td className={`px-3 py-2.5 text-right ${r.outstandingAmount > 0 ? "font-semibold text-amber-700" : "text-neutral-300"}`}>{r.outstandingAmount > 0 ? formatPaisa(r.outstandingAmount) : "—"}</td>
                  </tr>
                ))}
                {ledgerRows.length === 0 && (
                  <tr><td colSpan={14} className="px-4 py-10 text-center text-sm text-neutral-400">No records match these filters.</td></tr>
                )}
              </tbody>
              {ledgerRows.length > 0 && (
                <tfoot className="bg-neutral-50 text-sm font-semibold tabular-nums">
                  <tr className="border-t-2 border-neutral-200">
                    <td className="px-3 py-2.5" colSpan={7}>
                      Totals — {ledgerTotals.orders} recognised sale{ledgerTotals.orders === 1 ? "" : "s"}
                      <span className="ml-2 text-xs font-normal text-neutral-400">(whole filtered set, not just this page)</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatPaisa(ledgerTotals.subtotal)}</td>
                    <td className="px-3 py-2.5 text-right">{ledgerTotals.discount > 0 ? `-${formatPaisa(ledgerTotals.discount)}` : "—"}</td>
                    <td className="px-3 py-2.5 text-right">{formatPaisa(ledgerTotals.deliveryFee)}</td>
                    <td className="px-3 py-2.5 text-right">{formatPaisa(ledgerTotals.tax)}</td>
                    <td className="px-3 py-2.5 text-right">{formatPaisa(ledgerTotals.grandTotal)}</td>
                    <td className="px-3 py-2.5 text-right text-green-700">{formatPaisa(ledgerTotals.collected)}</td>
                    <td className="px-3 py-2.5 text-right text-amber-700">{formatPaisa(ledgerTotals.outstanding)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {ledgerRows.length > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between text-sm text-neutral-600">
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, ledgerRows.length)} of {ledgerRows.length}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:border-brand-red hover:text-brand-red disabled:opacity-40">
                  Previous
                </button>
                <span className="text-xs">Page {page + 1} of {pageCount}</span>
                <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:border-brand-red hover:text-brand-red disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-neutral-400">Click any order to open its full details.</p>
        </>
      )}

      {detailOrderId && (
        <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} onNavigateReceipt={(id) => router.push(`/pos/receipt/${id}`)} />
      )}
    </div>
  );
}
