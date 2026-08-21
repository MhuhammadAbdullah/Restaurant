"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, getAccessToken } from "../../../../lib/api";
import { toast } from "../../../../store/useToastStore";
import { useSelectedBranch } from "../../../../lib/useSelectedBranch";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { StatCard } from "../../../../components/StatCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { DateRangePopover } from "../../../../components/ui/date-range-popover";
import { BanknoteIcon, CheckCircleIcon, ClockIcon, XCircleIcon, AlertCircleIcon, TrendingUpIcon, StoreIcon, GlobeIcon } from "../../../../components/icons";

type FinanceReport = {
  rows: Array<{
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
    grandTotal: number;
    collectedAmount: number;
    outstandingAmount: number;
    refundAmount: number;
    transactionRef: string;
    paymentAttempts: number;
  }>;
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

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toDateInput(d);
}

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  PAID: "bg-green-50 text-green-700",
  PENDING: "bg-amber-50 text-amber-700",
  PARTIALLY_PAID: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  CANCELLED: "bg-red-50 text-red-700",
  EXPIRED: "bg-neutral-100 text-neutral-600",
  REFUNDED: "bg-purple-50 text-purple-700",
};

export default function FinanceReportsPage() {
  const { branchId, branches, setBranchId } = useSelectedBranch();
  const { data: me } = useMe();
  const canExport = hasPermission(me, "reports.export");

  const [sourceFilter, setSourceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(() => toDateInput(new Date()));
  const [downloading, setDownloading] = useState<"csv" | "xlsx" | "pdf" | null>(null);

  function buildQuery() {
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    if (sourceFilter) params.set("source", sourceFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (paymentMethodFilter) params.set("paymentMethod", paymentMethodFilter);
    if (paymentStatusFilter) params.set("paymentStatus", paymentStatusFilter);
    if (search.trim()) params.set("search", search.trim());
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return params.toString();
  }

  const { data: report } = useQuery({
    queryKey: ["finance-report", branchId, sourceFilter, typeFilter, paymentMethodFilter, paymentStatusFilter, search, fromDate, toDate],
    queryFn: () => api.get<FinanceReport>(`/reports/finance?${buildQuery()}`),
  });

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
      a.download = `finance-report-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download report");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Order & Finance Reports</h1>
          <p className="text-xs text-neutral-500">Every order and payment attempt — including unpaid, failed, and expired online payments — for reconciliation and audit.</p>
        </div>
        {canExport && (
          <div className="flex gap-2">
            <button onClick={() => download("csv")} disabled={downloading !== null} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:border-brand-red hover:text-brand-red disabled:opacity-50">
              {downloading === "csv" ? "Downloading..." : "Download CSV"}
            </button>
            <button onClick={() => download("xlsx")} disabled={downloading !== null} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:border-brand-red hover:text-brand-red disabled:opacity-50">
              {downloading === "xlsx" ? "Downloading..." : "Download Excel"}
            </button>
            <button onClick={() => download("pdf")} disabled={downloading !== null} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:border-brand-red hover:text-brand-red disabled:opacity-50">
              {downloading === "pdf" ? "Downloading..." : "Download PDF"}
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input placeholder="Search order #, name, phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
        {branches.length > 1 && (
          <Select value={branchId || "all"} onValueChange={(v) => setBranchId(v === "all" ? null : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Branches" /></SelectTrigger>
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
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ORDER_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={paymentMethodFilter || "all"} onValueChange={(v) => setPaymentMethodFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment methods</SelectItem>
            {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={paymentStatusFilter || "all"} onValueChange={(v) => setPaymentStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment statuses</SelectItem>
            {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateRangePopover from={fromDate} to={toDate} onChange={(from, to) => { setFromDate(from); setToDate(to); }} />
      </div>

      {report && (
        <>
          <h2 className="mt-6 text-sm font-semibold text-neutral-700">Order Summary</h2>
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard icon={GlobeIcon} color="text-blue-600 bg-blue-50" label="Total Order Attempts" value={String(report.orderSummary.totalOrderAttempts)} />
            <StatCard icon={CheckCircleIcon} color="text-green-600 bg-green-50" label="Successful Orders" value={String(report.orderSummary.successfulOrders)} />
            <StatCard icon={StoreIcon} color="text-teal-600 bg-teal-50" label="COD Orders" value={String(report.orderSummary.codOrders)} />
            <StatCard icon={TrendingUpIcon} color="text-purple-600 bg-purple-50" label="Online Orders" value={String(report.orderSummary.onlineOrders)} />
          </div>

          <h2 className="mt-6 text-sm font-semibold text-neutral-700">Payment Summary</h2>
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard icon={CheckCircleIcon} color="text-green-600 bg-green-50" label="Paid" value={String(report.paymentSummary.paid)} />
            <StatCard icon={ClockIcon} color="text-amber-600 bg-amber-50" label="Pending" value={String(report.paymentSummary.pending)} />
            <StatCard icon={XCircleIcon} color="text-red-600 bg-red-50" label="Failed" value={String(report.paymentSummary.failed)} />
            <StatCard icon={AlertCircleIcon} color="text-neutral-600 bg-neutral-100" label="Expired" value={String(report.paymentSummary.expired)} />
            <StatCard icon={XCircleIcon} color="text-red-600 bg-red-50" label="Cancelled" value={String(report.paymentSummary.cancelled)} />
            <StatCard icon={BanknoteIcon} color="text-purple-600 bg-purple-50" label="Refunded" value={String(report.paymentSummary.refunded)} />
          </div>

          <h2 className="mt-6 text-sm font-semibold text-neutral-700">Financial Summary</h2>
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard icon={BanknoteIcon} color="text-blue-600 bg-blue-50" label="Gross Order Value" value={formatPaisa(report.financialSummary.grossOrderValue)} />
            <StatCard icon={BanknoteIcon} color="text-green-600 bg-green-50" label="Total Collected" value={formatPaisa(report.financialSummary.totalCollected)} sub={`Online ${formatPaisa(report.financialSummary.onlineCollected)} · COD ${formatPaisa(report.financialSummary.codCollected)}`} />
            <StatCard icon={AlertCircleIcon} color="text-amber-600 bg-amber-50" label="Outstanding COD" value={formatPaisa(report.financialSummary.outstandingCod)} warn={report.financialSummary.outstandingCod > 0} />
            <StatCard icon={ClockIcon} color="text-amber-600 bg-amber-50" label="Pending Online Value" value={formatPaisa(report.financialSummary.pendingOnlineValue)} />
            <StatCard icon={XCircleIcon} color="text-red-600 bg-red-50" label="Failed/Expired Value" value={formatPaisa(report.financialSummary.failedExpiredValue)} />
            <StatCard icon={BanknoteIcon} color="text-purple-600 bg-purple-50" label="Refunded Amount" value={formatPaisa(report.financialSummary.refundedAmount)} />
          </div>

          <h2 className="mt-6 text-sm font-semibold text-neutral-700">Orders ({report.rows.length})</h2>
          <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Order #</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Branch</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Payment</th>
                  <th className="px-4 py-2">Order Status</th>
                  <th className="px-4 py-2">Grand Total</th>
                  <th className="px-4 py-2">Collected</th>
                  <th className="px-4 py-2">Outstanding</th>
                  <th className="px-4 py-2">Attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.rows.map((r) => (
                  <tr key={r.orderId}>
                    <td className="px-4 py-2 font-medium">{r.orderNumber}</td>
                    <td className="px-4 py-2 text-xs text-neutral-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-2">{r.branchName}</td>
                    <td className="px-4 py-2 text-xs text-neutral-600">{r.customerName}</td>
                    <td className="px-4 py-2 text-xs">{r.paymentMethod}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLOR[r.paymentStatus] ?? "bg-neutral-100 text-neutral-600"}`}>{r.paymentStatus}</span>
                    </td>
                    <td className="px-4 py-2 text-xs">{r.orderStatus}</td>
                    <td className="px-4 py-2">{formatPaisa(r.grandTotal)}</td>
                    <td className="px-4 py-2">{formatPaisa(r.collectedAmount)}</td>
                    <td className="px-4 py-2">{r.outstandingAmount > 0 ? formatPaisa(r.outstandingAmount) : "—"}</td>
                    <td className="px-4 py-2 text-center text-xs text-neutral-500">{r.paymentAttempts}</td>
                  </tr>
                ))}
                {report.rows.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-neutral-400">No records match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
