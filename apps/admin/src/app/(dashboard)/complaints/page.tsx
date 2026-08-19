"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { useSelectedBranch } from "../../../lib/useSelectedBranch";
import { ComplaintDetailModal, CATEGORY_LABEL, ORDER_TYPE_LABEL } from "../../../components/complaints/ComplaintDetailModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { DateRangePopover } from "../../../components/ui/date-range-popover";

type Complaint = {
  id: string;
  complaintNumber: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  orderNumberInput: string | null;
  orderType: string | null;
  customer: { name: string; phone: string; email: string } | null;
  branch: { name: string; city: string } | null;
  order: { orderNumber: string } | null;
};

const STATUSES = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"];
const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700",
  UNDER_REVIEW: "bg-amber-50 text-amber-700",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  RESOLVED: "bg-green-50 text-green-700",
  CLOSED: "bg-neutral-100 text-neutral-600",
  REJECTED: "bg-red-50 text-red-700",
};

type DateMode = "all" | "today" | "yesterday" | "last7" | "last30" | "range";

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function useDateFilter() {
  const [mode, setMode] = useState<DateMode>("all");
  const [fromDate, setFromDate] = useState(() => toDateInput(new Date()));
  const [toDate, setToDate] = useState(() => toDateInput(new Date()));

  const params = useMemo(() => {
    const p: { from?: string; to?: string } = {};
    const now = new Date();
    if (mode === "today") {
      p.from = toDateInput(now);
      p.to = toDateInput(now);
    } else if (mode === "yesterday") {
      const y = toDateInput(new Date(Date.now() - 86400000));
      p.from = y;
      p.to = y;
    } else if (mode === "last7") {
      p.from = toDateInput(new Date(Date.now() - 6 * 86400000));
      p.to = toDateInput(now);
    } else if (mode === "last30") {
      p.from = toDateInput(new Date(Date.now() - 29 * 86400000));
      p.to = toDateInput(now);
    } else if (mode === "range") {
      p.from = fromDate;
      p.to = toDate;
    }
    return p;
  }, [mode, fromDate, toDate]);

  return { mode, setMode, fromDate, setFromDate, toDate, setToDate, params };
}

function DateFilterBar({ f }: { f: ReturnType<typeof useDateFilter> }) {
  const btn = (active: boolean) => `rounded-full border px-3 py-1 text-xs ${active ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-300 text-neutral-600"}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => f.setMode("all")} className={btn(f.mode === "all")}>All</button>
      <button onClick={() => f.setMode("today")} className={btn(f.mode === "today")}>Today</button>
      <button onClick={() => f.setMode("yesterday")} className={btn(f.mode === "yesterday")}>Yesterday</button>
      <button onClick={() => f.setMode("last7")} className={btn(f.mode === "last7")}>Last 7 Days</button>
      <button onClick={() => f.setMode("last30")} className={btn(f.mode === "last30")}>Last 30 Days</button>
      <button onClick={() => f.setMode("range")} className={btn(f.mode === "range")}>Custom Range</button>
      {f.mode === "range" && (
        <DateRangePopover from={f.fromDate} to={f.toDate} onChange={(from, to) => { f.setFromDate(from); f.setToDate(to); }} />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ComplaintsPage() {
  const { branchId } = useSelectedBranch();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const dateFilter = useDateFilter();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: complaints } = useQuery({
    queryKey: ["staff-complaints", branchId, search, category, status, dateFilter.params],
    queryFn: () => {
      const params = new URLSearchParams();
      if (branchId) params.set("branchId", branchId);
      if (search.trim()) params.set("search", search.trim());
      if (category) params.set("category", category);
      if (status) params.set("status", status);
      if (dateFilter.params.from) params.set("from", dateFilter.params.from);
      if (dateFilter.params.to) params.set("to", dateFilter.params.to);
      const qs = params.toString();
      return api.get<Complaint[]>(`/staff/complaints${qs ? `?${qs}` : ""}`);
    },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Complaints</h1>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          placeholder="Search Complaint ID, Order ID, name, phone, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-2">
        <DateFilterBar f={dateFilter} />
      </div>
      <p className="mt-1.5 text-xs text-neutral-400">Use the branch picker above to filter by branch.</p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Complaint ID</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Phone/Email</th>
              <th className="px-4 py-2.5 font-medium">City</th>
              <th className="px-4 py-2.5 font-medium">Branch</th>
              <th className="px-4 py-2.5 font-medium">Order Type</th>
              <th className="px-4 py-2.5 font-medium">Complaint Type</th>
              <th className="px-4 py-2.5 font-medium">Order ID</th>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {complaints?.map((c) => (
              <tr key={c.id} onClick={() => setSelectedId(c.id)} className="cursor-pointer hover:bg-neutral-50">
                <td className="px-4 py-2.5 font-medium text-brand-red">{c.complaintNumber}</td>
                <td className="px-4 py-2.5 text-neutral-700">{c.contactName ?? c.customer?.name ?? "Guest"}</td>
                <td className="px-4 py-2.5 text-neutral-600">{c.contactPhone ?? c.customer?.phone ?? c.contactEmail ?? c.customer?.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-neutral-600">{c.branch?.city ?? "—"}</td>
                <td className="px-4 py-2.5 text-neutral-600">{c.branch?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-neutral-600">{c.orderType ? ORDER_TYPE_LABEL[c.orderType] ?? c.orderType : "—"}</td>
                <td className="px-4 py-2.5 text-neutral-600">{CATEGORY_LABEL[c.category] ?? c.category}</td>
                <td className="px-4 py-2.5 text-neutral-600">{c.order?.orderNumber ?? c.orderNumberInput ?? "—"}</td>
                <td className="px-4 py-2.5 text-neutral-500">{formatDate(c.createdAt)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                    {c.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <button onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); }} className="text-xs font-medium text-brand-red hover:underline">View</button>
                </td>
              </tr>
            ))}
            {complaints?.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-neutral-400">No complaints match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedId && <ComplaintDetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
