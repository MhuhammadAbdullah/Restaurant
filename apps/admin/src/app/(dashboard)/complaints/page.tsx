"use client";

import { SearchInput } from "../../../components/SearchFilterBar";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FaCircleCheck, FaClock, FaCommentDots, FaHourglassHalf, FaMagnifyingGlass, FaXmark } from "react-icons/fa6";
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
  order: { orderNumber: string; orderCode?: string | null } | null;
};

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700",
  UNDER_REVIEW: "bg-amber-50 text-amber-700",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  RESOLVED: "bg-green-50 text-green-700",
  CLOSED: "bg-neutral-100 text-neutral-600",
  REJECTED: "bg-red-50 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REJECTED: "Rejected",
};
const OPEN_STATES = new Set(["OPEN", "UNDER_REVIEW", "IN_PROGRESS"]);

type DateMode = "all" | "today" | "yesterday" | "last7" | "last30" | "range";
type SortKey = "number" | "customer" | "branch" | "type" | "date" | "status";

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
  const options: [DateMode, string][] = [
    ["all", "All time"],
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["last7", "Last 7 days"],
    ["last30", "Last 30 days"],
    ["range", "Custom range"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map(([mode, label]) => (
        <button
          key={mode}
          onClick={() => f.setMode(mode)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            f.mode === mode ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 bg-white text-neutral-600 hover:border-brand-red hover:text-brand-red"
          }`}
        >
          {label}
        </button>
      ))}
      {f.mode === "range" && (
        <DateRangePopover
          from={f.fromDate}
          to={f.toDate}
          onChange={(from, to) => {
            f.setFromDate(from);
            f.setToDate(to);
          }}
        />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const daysOld = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "G";

function StatTile({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3.5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <div>
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-xl font-bold leading-tight text-neutral-900">{value}</p>
      </div>
    </div>
  );
}

export default function ComplaintsPage() {
  const { branchId } = useSelectedBranch();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const dateFilter = useDateFilter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  // Search waits for a short pause in typing instead of asking the server on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Status is filtered here (not on the server) so every status tab can show its own count at once.
  const { data: all, isLoading, isError } = useQuery({
    queryKey: ["staff-complaints", branchId, search, category, dateFilter.params],
    queryFn: () => {
      const params = new URLSearchParams();
      if (branchId) params.set("branchId", branchId);
      if (search.trim()) params.set("search", search.trim());
      if (category) params.set("category", category);
      if (dateFilter.params.from) params.set("from", dateFilter.params.from);
      if (dateFilter.params.to) params.set("to", dateFilter.params.to);
      const qs = params.toString();
      return api.get<Complaint[]>(`/staff/complaints${qs ? `?${qs}` : ""}`);
    },
    refetchInterval: 30000,
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all?.length ?? 0 };
    for (const x of all ?? []) c[x.status] = (c[x.status] ?? 0) + 1;
    return c;
  }, [all]);
  const openCount = (all ?? []).filter((c) => OPEN_STATES.has(c.status)).length;
  const waitingCount = (all ?? []).filter((c) => OPEN_STATES.has(c.status) && daysOld(c.createdAt) >= 3).length;

  const rows = useMemo(() => {
    const list = (all ?? []).filter((c) => !status || c.status === status);
    if (!sort) return list;
    const m = sort.dir === "asc" ? 1 : -1;
    const val = (c: Complaint): string | number => {
      switch (sort.key) {
        case "number": return c.complaintNumber;
        case "customer": return (c.contactName ?? c.customer?.name ?? "Guest").toLowerCase();
        case "branch": return (c.branch?.name ?? "").toLowerCase();
        case "type": return (CATEGORY_LABEL[c.category] ?? c.category).toLowerCase();
        case "status": return c.status;
        case "date": return new Date(c.createdAt).getTime();
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * m;
    });
  }, [all, status, sort]);

  function toggleSort(key: SortKey) {
    // first click ascending, second descending, third back to the default order
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  const filtering = !!search || !!category || !!status || dateFilter.mode !== "all";
  function clearAll() {
    setSearchInput("");
    setSearch("");
    setCategory("");
    setStatus("");
    dateFilter.setMode("all");
  }

  function renderTh(k: SortKey, label: string) {
    const active = sort?.key === k;
    return (
      <th key={k} className="px-4 py-2.5 font-medium" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1.5 ${active ? "text-neutral-900" : "hover:text-neutral-800"}`}>
          {label}
          <span className="flex flex-col leading-none">
            <span className={`text-[8px] ${active && sort!.dir === "asc" ? "text-brand-red" : "text-neutral-300"}`}>▲</span>
            <span className={`text-[8px] ${active && sort!.dir === "desc" ? "text-brand-red" : "text-neutral-300"}`}>▼</span>
          </span>
        </button>
      </th>
    );
  }

  const TABS: [string, string][] = [["", "All"], ...(["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"] as const).map((k) => [k, STATUS_LABEL[k]!] as [string, string])];

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Complaints</h1>
      <p className="mt-1 text-sm text-neutral-500">Customer feedback and issues. Open a complaint to reply, change its status or link it to an order.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total complaints" value={counts.all ?? 0} tone="bg-neutral-100 text-neutral-600" icon={<FaCommentDots size={16} />} />
        <StatTile label="Needs attention" value={openCount} tone="bg-amber-50 text-amber-600" icon={<FaHourglassHalf size={16} />} />
        <StatTile label="Waiting 3+ days" value={waitingCount} tone="bg-red-50 text-brand-red" icon={<FaClock size={16} />} />
        <StatTile label="Resolved" value={(counts.RESOLVED ?? 0) + (counts.CLOSED ?? 0)} tone="bg-green-50 text-green-600" icon={<FaCircleCheck size={16} />} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search ID, order, name, phone, email..." widthClass="w-full sm:w-96" />
        <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtering && (
          <button type="button" onClick={clearAll} className="text-xs font-medium text-brand-red hover:underline">Clear filters</button>
        )}
      </div>
      <div className="mt-2">
        <DateFilterBar f={dateFilter} />
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-neutral-200">
        {TABS.map(([k, label]) => (
          <button
            key={k || "all"}
            onClick={() => setStatus(k)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition ${status === k ? "border-brand-red text-brand-red" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}
          >
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-xs ${status === k ? "bg-brand-red/10 text-brand-red" : "bg-neutral-100 text-neutral-500"}`}>{k ? (counts[k] ?? 0) : (counts.all ?? 0)}</span>
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-neutral-400">
        {branchId ? "Showing the selected branch. " : "Showing all branches you can access. "}
        Use the branch picker above to change it.
      </p>

      <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              {renderTh("number", "Complaint")}
              {renderTh("customer", "Customer")}
              {renderTh("branch", "Branch")}
              {renderTh("type", "Type")}
              <th className="px-4 py-2.5 font-medium">Order</th>
              {renderTh("date", "Date")}
              {renderTh("status", "Status")}
              <th className="px-4 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((c) => {
              const name = c.contactName ?? c.customer?.name ?? "Guest";
              const contact = c.contactPhone ?? c.customer?.phone ?? c.contactEmail ?? c.customer?.email ?? "";
              const age = daysOld(c.createdAt);
              const waiting = OPEN_STATES.has(c.status) && age >= 3;
              return (
                <tr key={c.id} onClick={() => setSelectedId(c.id)} className="cursor-pointer align-middle hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-brand-red">{c.complaintNumber}</p>
                    <p className="mt-0.5 max-w-[220px] truncate text-xs text-neutral-500" title={c.subject}>{c.subject}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-600">{initials(name)}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-800">{name}</p>
                        <p className="truncate text-xs text-neutral-500">{contact || "No contact"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-neutral-800">{c.branch?.name ?? "—"}</p>
                    {c.branch?.city && <p className="text-xs text-neutral-400">{c.branch.city}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-neutral-800">{CATEGORY_LABEL[c.category] ?? c.category}</p>
                    {c.orderType && <p className="text-xs text-neutral-400">{ORDER_TYPE_LABEL[c.orderType] ?? c.orderType}</p>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{c.order?.orderCode ?? c.order?.orderNumber ?? c.orderNumberInput ?? <span className="text-neutral-300">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-neutral-700">{formatDate(c.createdAt)}</p>
                    {waiting && <p className="text-xs font-medium text-amber-600">Waiting {age} days</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[c.status] ?? "bg-neutral-100 text-neutral-600"}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); }} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-brand-red hover:text-brand-red">View</button>
                  </td>
                </tr>
              );
            })}
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-neutral-400">Loading complaints...</td></tr>
            )}
            {isError && !all && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-red-600">Could not load complaints. Please refresh.</td></tr>
            )}
            {all && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400"><FaCommentDots size={18} /></span>
                  <p className="mt-3 text-sm font-medium text-neutral-600">{filtering ? "No complaints match these filters" : "No complaints yet"}</p>
                  {filtering && <button onClick={clearAll} className="mt-1 text-xs font-medium text-brand-red hover:underline">Clear filters</button>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && <p className="mt-2 text-xs text-neutral-400">Showing {rows.length} complaint{rows.length === 1 ? "" : "s"}</p>}

      {selectedId && <ComplaintDetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
