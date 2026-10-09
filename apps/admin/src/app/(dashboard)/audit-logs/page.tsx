"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getAccessToken } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { SearchInput } from "../../../components/SearchFilterBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  staffUser: { id: string; name: string; email: string } | null;
};
type DayPage = {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  facets: {
    entityTypes: { value: string; count: number }[];
    actions: { value: string; count: number }[];
    staff: { value: string; label: string; count: number }[];
  };
};

const PAGE_SIZE = 50;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const fromYmd = (s: string) => new Date(`${s}T00:00:00`);
const tzOffset = () => new Date().getTimezoneOffset();

function actionStyle(action: string): string {
  const a = action.toLowerCase();
  if (/(delete|cancel|remove|block|void|deactivate)/.test(a)) return "bg-red-50 text-red-700";
  if (/(refund|reset|adjust|revoke)/.test(a)) return "bg-amber-50 text-amber-700";
  if (/(create|add|register|settle|received)/.test(a)) return "bg-green-50 text-green-700";
  if (/(login|logout|signin)/.test(a)) return "bg-purple-50 text-purple-700";
  if (/(update|change|edit|status|assign|transfer)/.test(a)) return "bg-blue-50 text-blue-700";
  return "bg-neutral-100 text-neutral-600";
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-neutral-900 p-3 font-mono text-[11px] leading-relaxed text-neutral-100">
      {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function summary(l: AuditLog): string {
  const v = l.newValue ?? l.oldValue;
  if (v === null || v === undefined) return "—";
  if (typeof v !== "object") return String(v);
  const entries = Object.entries(v as Record<string, unknown>).slice(0, 4);
  return entries.map(([k, val]) => `${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`).join(" · ");
}

export default function AuditLogsPage() {
  const today = useMemo(() => ymd(new Date()), []);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [day, setDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [staffUserId, setStaffUserId] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // 1) Archive calendar: only counts per day, no log rows.
  const { data: dayCounts, isFetching: loadingMonth } = useQuery({
    queryKey: ["audit-days", month],
    queryFn: () => api.get<{ day: string; count: number }[]>(`/audit-logs/days?month=${month}&tzOffset=${tzOffset()}`),
    staleTime: 30_000,
  });
  const countOf = useMemo(() => new Map((dayCounts ?? []).map((d) => [d.day, d.count])), [dayCounts]);
  const monthTotal = (dayCounts ?? []).reduce((n, d) => n + d.count, 0);

  // 2) One day's entries: fetched from the database only once a day is opened.
  const filterQs = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("search", search.trim());
    if (entityType) p.set("entityType", entityType);
    if (action) p.set("action", action);
    if (staffUserId) p.set("staffUserId", staffUserId);
    return p.toString();
  }, [search, entityType, action, staffUserId]);

  const { data: dayData, isFetching: loadingDay } = useQuery({
    queryKey: ["audit-day", day, filterQs, page],
    queryFn: () => api.get<DayPage>(`/audit-logs/day?date=${day}&tzOffset=${tzOffset()}&page=${page}&pageSize=${PAGE_SIZE}${filterQs ? `&${filterQs}` : ""}`),
    enabled: !!day,
    // Keep the previous page on screen while paging/filtering the same day, but never show another day's rows.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === day ? prev : undefined),
  });

  // Facet lists describe the whole day, so keep the last unfiltered set while filtering.
  const [facets, setFacets] = useState<DayPage["facets"] | null>(null);
  useEffect(() => {
    if (dayData && !filterQs) setFacets(dayData.facets);
  }, [dayData, filterQs]);

  useEffect(() => {
    setPage(1);
    setExpanded(null);
  }, [day, filterQs]);

  function openDay(d: string) {
    setDay(d);
    setSearch("");
    setEntityType("");
    setAction("");
    setStaffUserId("");
    setFacets(null);
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y!, m! - 1 + delta, 1);
    setMonth(monthKey(d));
  }

  // calendar cells (Monday first)
  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y!, m! - 1, 1);
    const lead = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y!, m!, 0).getDate();
    return [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${pad(i + 1)}`)];
  }, [month]);
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const atCurrentMonth = month >= monthKey(new Date());

  async function exportCsv() {
    if (!day) return;
    setExporting(true);
    try {
      const token = getAccessToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";
      const res = await fetch(`${apiUrl}/audit-logs/day/export.csv?date=${day}&tzOffset=${tzOffset()}${filterQs ? `&${filterQs}` : ""}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Export failed");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${day}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not export this day");
    } finally {
      setExporting(false);
    }
  }

  const isFiltering = filterQs !== "";
  const items = dayData?.items ?? [];
  const dayLabel = day ? fromYmd(day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Audit Logs</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every important action is recorded and archived by day. Entries are not loaded until you open a day; they are read straight from the database for that day only.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Archive calendar */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="rounded-lg border border-neutral-200 px-2.5 py-1 text-sm hover:bg-neutral-50">‹</button>
              <div className="text-center">
                <p className="text-sm font-semibold text-neutral-900">{monthLabel}</p>
                <p className="text-[11px] text-neutral-400">{loadingMonth ? "Loading..." : `${monthTotal.toLocaleString()} entries this month`}</p>
              </div>
              <button type="button" onClick={() => shiftMonth(1)} disabled={atCurrentMonth} aria-label="Next month" className="rounded-lg border border-neutral-200 px-2.5 py-1 text-sm hover:bg-neutral-50 disabled:opacity-30">›</button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-neutral-400">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <span key={`b${i}`} />;
                const n = countOf.get(d) ?? 0;
                const future = d > today;
                const selected = d === day;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={future || n === 0}
                    onClick={() => openDay(d)}
                    title={future ? "" : `${n} entr${n === 1 ? "y" : "ies"}`}
                    className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition ${
                      selected ? "bg-brand-red font-semibold text-white" : n > 0 ? "bg-red-50 font-medium text-neutral-900 hover:bg-red-100" : "text-neutral-300"
                    } ${d === today && !selected ? "ring-1 ring-brand-red" : ""} disabled:cursor-default`}
                  >
                    <span>{Number(d.slice(8))}</span>
                    {n > 0 && <span className={`text-[9px] ${selected ? "text-white/80" : "text-neutral-400"}`}>{n > 999 ? "999+" : n}</span>}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => { setMonth(monthKey(new Date())); openDay(today); }} className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Today</button>
              <button
                type="button"
                onClick={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  setMonth(monthKey(y));
                  openDay(ymd(y));
                }}
                className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Yesterday
              </button>
            </div>
            <p className="mt-3 text-[11px] text-neutral-400">Shaded days have entries. Click a day to load it.</p>
          </div>
        </aside>

        {/* Selected day */}
        <section className="min-w-0">
          {!day ? (
            <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-xl">🗂️</span>
              <p className="mt-3 text-sm font-semibold text-neutral-800">Pick a day from the archive</p>
              <p className="mt-1 max-w-sm text-xs text-neutral-500">Audit entries are stored day by day and only loaded when you open one, so this page stays fast however much history there is.</p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => openDay(today)} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">Open today</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">{dayLabel}</h2>
                  <p className="text-xs text-neutral-500">
                    {dayData ? `${dayData.total.toLocaleString()} ${isFiltering ? "matching " : ""}entr${dayData.total === 1 ? "y" : "ies"}` : "Loading..."}
                    {loadingDay && dayData ? " · refreshing..." : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={exportCsv} disabled={exporting || !dayData || dayData.total === 0} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-brand-red hover:text-brand-red disabled:opacity-50">
                    {exporting ? "Exporting..." : "Download CSV"}
                  </button>
                  <button type="button" onClick={() => setDay(null)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50">Close day</button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Search action, entity, staff..." />
                <Select value={entityType || "all"} onValueChange={(v) => setEntityType(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All entities</SelectItem>
                    {facets?.entityTypes.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.value} ({e.count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={action || "all"} onValueChange={(v) => setAction(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    {facets?.actions.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.value} ({a.count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={staffUserId || "all"} onValueChange={(v) => setStaffUserId(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    {facets?.staff.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label} ({s.count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isFiltering && <button onClick={() => { setSearch(""); setEntityType(""); setAction(""); setStaffUserId(""); }} className="text-sm font-medium text-brand-red hover:underline">Clear filters</button>}
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                    <tr>
                      <th className="w-8 px-3 py-2.5"></th>
                      <th className="px-3 py-2.5">Time</th>
                      <th className="px-3 py-2.5">Staff</th>
                      <th className="px-3 py-2.5">Action</th>
                      <th className="px-3 py-2.5">Entity</th>
                      <th className="px-3 py-2.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((l) => {
                      const open = expanded === l.id;
                      return (
                        <Fragment key={l.id}>
                          <tr onClick={() => setExpanded(open ? null : l.id)} className={`cursor-pointer hover:bg-neutral-50 ${open ? "bg-neutral-50" : ""}`}>
                            <td className="px-3 py-2.5 text-neutral-400">{open ? "▾" : "▸"}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-neutral-600">{new Date(l.createdAt).toLocaleTimeString()}</td>
                            <td className="px-3 py-2.5">{l.staffUser ? <span className="font-medium text-neutral-800">{l.staffUser.name}</span> : <span className="text-neutral-400">System</span>}</td>
                            <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${actionStyle(l.action)}`}>{l.action}</span></td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-500">{l.entityType} <span className="font-mono text-neutral-400">· {l.entityId.slice(0, 8)}</span></td>
                            <td className="max-w-xs truncate px-3 py-2.5 text-xs text-neutral-500" title={summary(l)}>{summary(l)}</td>
                          </tr>
                          {open && (
                            <tr className="bg-neutral-50">
                              <td colSpan={6} className="px-4 pb-4 pt-1">
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div><p className="mb-1 text-[11px] font-semibold uppercase text-neutral-500">Before</p><Json value={l.oldValue} /></div>
                                  <div><p className="mb-1 text-[11px] font-semibold uppercase text-neutral-500">After</p><Json value={l.newValue} /></div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
                                  <span>Full time: {new Date(l.createdAt).toLocaleString()}</span>
                                  {l.staffUser && <span>Email: {l.staffUser.email}</span>}
                                  <span>Entity ID: <span className="font-mono">{l.entityId}</span></span>
                                  <span>IP: {l.ipAddress ?? "—"}</span>
                                  {l.userAgent && <span className="max-w-full truncate" title={l.userAgent}>Browser: {l.userAgent}</span>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {!dayData && loadingDay && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-400">Loading this day from the database...</td></tr>
                    )}
                    {dayData && items.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-400">{isFiltering ? "No entries match these filters." : "No entries on this day."}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {dayData && dayData.pageCount > 1 && (
                <div className="mt-3 flex items-center justify-between text-sm text-neutral-600">
                  <span>
                    Showing <b>{(dayData.page - 1) * dayData.pageSize + 1}–{Math.min(dayData.page * dayData.pageSize, dayData.total)}</b> of <b>{dayData.total.toLocaleString()}</b>
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:border-brand-red hover:text-brand-red disabled:opacity-40">Previous</button>
                    <span className="text-xs text-neutral-500">Page {dayData.page} of {dayData.pageCount}</span>
                    <button onClick={() => setPage((p) => Math.min(dayData.pageCount, p + 1))} disabled={page >= dayData.pageCount} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:border-brand-red hover:text-brand-red disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
