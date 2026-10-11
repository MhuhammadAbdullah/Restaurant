"use client";

import { SearchInput } from "../../../../components/SearchFilterBar";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { FaDownload, FaEye, FaFolderOpen, FaMagnifyingGlass, FaRotateRight, FaXmark } from "react-icons/fa6";
import { api, ApiError } from "../../../../lib/api";
import { downloadAuthed } from "../../../../lib/download";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { DateRangePopover } from "../../../../components/ui/date-range-popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";

type LogRow = { id: string; templateKey: string; toEmail: string; subject: string; status: string; error: string | null; attempts: number; orderId: string | null; complaintId: string | null; sentAt: string | null; createdAt: string };
type DayPage = {
  items: LogRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  facets: { statuses: { value: string; count: number }[]; kinds: { value: string; count: number }[] };
};

const KIND: Record<string, string> = {
  OTP: "Login code",
  ORDER_CONFIRMATION: "Order confirmation",
  ORDER_REVIEW: "Thank you & review",
  COMPLAINT_REPLY: "Complaint reply",
  CUSTOM: "Written by staff",
};
const STATUS_STYLE: Record<string, string> = {
  SENT: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-700",
  PENDING: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-neutral-100 text-neutral-500",
};
const STATUS_LABEL: Record<string, string> = { SENT: "Sent", FAILED: "Failed", PENDING: "Waiting", CANCELLED: "Cancelled" };
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const PAGE_SIZE = 25;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const tzOffset = () => new Date().getTimezoneOffset();
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });

export default function EmailLogPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canSend = hasPermission(me, "emails.send");
  const today = useMemo(() => ymd(new Date()), []);

  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [day, setDay] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ subject: string; toEmail: string; html: string | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(today);
  const [exportingRange, setExportingRange] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // 1) archive calendar: counts per day only
  const { data: dayCounts, isFetching: loadingMonth } = useQuery({
    queryKey: ["email-log-days", month],
    queryFn: () => api.get<{ day: string; count: number }[]>(`/emails/logs/days?month=${month}&tzOffset=${tzOffset()}`),
    staleTime: 30_000,
  });
  const countOf = useMemo(() => new Map((dayCounts ?? []).map((d) => [d.day, d.count])), [dayCounts]);
  const monthTotal = (dayCounts ?? []).reduce((n, d) => n + d.count, 0);

  // 2) one day's emails: read from the database only when the day is opened
  const filterQs = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (kind) p.set("kind", kind);
    if (search.trim()) p.set("search", search.trim());
    return p.toString();
  }, [status, kind, search]);

  const { data: dayData, isFetching: loadingDay } = useQuery({
    queryKey: ["email-log-day", day, filterQs, page],
    queryFn: () => api.get<DayPage>(`/emails/logs/day?date=${day}&tzOffset=${tzOffset()}&page=${page}&pageSize=${PAGE_SIZE}${filterQs ? `&${filterQs}` : ""}`),
    enabled: !!day,
    placeholderData: keepPreviousData,
    refetchInterval: 20000,
  });

  const [facets, setFacets] = useState<DayPage["facets"] | null>(null);
  useEffect(() => {
    if (dayData && !filterQs) setFacets(dayData.facets);
  }, [dayData, filterQs]);
  useEffect(() => {
    setPage(1);
  }, [day, filterQs]);

  function openDay(d: string) {
    setDay(d);
    setStatus("");
    setKind("");
    setSearchInput("");
    setFacets(null);
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    setMonth(monthKey(new Date(y!, m! - 1 + delta, 1)));
  }

  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const lead = (new Date(y!, m! - 1, 1).getDay() + 6) % 7;
    const n = new Date(y!, m!, 0).getDate();
    return [...Array.from({ length: lead }, () => null), ...Array.from({ length: n }, (_, i) => `${month}-${pad(i + 1)}`)];
  }, [month]);
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const atCurrentMonth = month >= monthKey(new Date());
  const dayLabel = day ? new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

  async function exportDay() {
    if (!day) return;
    setExporting(true);
    try {
      await downloadAuthed(`/emails/logs/export.csv?from=${day}&to=${day}&tzOffset=${tzOffset()}${filterQs ? `&${filterQs}` : ""}`, `email-log-${day}.csv`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not download this day");
    } finally {
      setExporting(false);
    }
  }

  async function exportRange() {
    setExportingRange(true);
    try {
      await downloadAuthed(`/emails/logs/export.csv?from=${rangeFrom}&to=${rangeTo || rangeFrom}&tzOffset=${tzOffset()}`, `email-log-${rangeFrom}${rangeTo && rangeTo !== rangeFrom ? `_to_${rangeTo}` : ""}.csv`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not download these dates");
    } finally {
      setExportingRange(false);
    }
  }

  async function resend(id: string) {
    setBusyId(id);
    try {
      await api.post(`/emails/logs/${id}/resend`);
      toast.success("Email sent");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not send the email");
    } finally {
      setBusyId(null);
      await queryClient.invalidateQueries({ queryKey: ["email-log-day"] });
    }
  }

  async function view(id: string) {
    try {
      setViewing(await api.get<{ subject: string; toEmail: string; html: string | null }>(`/emails/logs/${id}`));
    } catch {
      toast.error("Could not open the email");
    }
  }

  const items = dayData?.items ?? [];
  const isFiltering = filterQs !== "";
  const statusTabs: [string, string, number][] = [
    ["", "All", (facets?.statuses ?? []).reduce((n, s) => n + s.count, 0)],
    ...(facets?.statuses ?? []).map((s) => [s.value, STATUS_LABEL[s.value] ?? s.value, s.count] as [string, string, number]),
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Email Log</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-500">Every email is saved by day. Pick a day to see what was sent that day and whether it arrived. You can also download any day, or any range of dates, as a spreadsheet.</p>
      <p className="mt-2 max-w-3xl rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Email records are deleted automatically after <b>14 days</b>. Download a day or a range first if you want to keep it.</p>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {/* archive calendar */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="rounded-lg border border-neutral-200 px-2.5 py-1 text-sm hover:bg-neutral-50">‹</button>
              <div className="text-center">
                <p className="text-sm font-semibold text-neutral-900">{monthLabel}</p>
                <p className="text-[11px] text-neutral-400">{loadingMonth ? "Loading..." : `${monthTotal.toLocaleString()} emails this month`}</p>
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
                    title={future ? "" : `${n} email${n === 1 ? "" : "s"}`}
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
            <p className="mt-3 text-[11px] text-neutral-400">Shaded days have emails. Click a day to open it.</p>
          </div>

          {/* download any dates */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-neutral-900">Download by date</p>
            <p className="mt-0.5 text-xs text-neutral-500">Choose one day or a range of days and download them as a spreadsheet (CSV).</p>
            <div className="mt-3">
              <DateRangePopover from={rangeFrom} to={rangeTo} onChange={(f, t) => { setRangeFrom(f); setRangeTo(t || f); }} />
            </div>
            <button type="button" onClick={exportRange} disabled={exportingRange || !rangeFrom} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-red py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              <FaDownload size={12} /> {exportingRange ? "Preparing..." : "Download CSV"}
            </button>
          </div>
        </aside>

        <section className="min-w-0">
          {!day ? (
            <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400"><FaFolderOpen size={20} /></span>
              <p className="mt-3 text-sm font-semibold text-neutral-800">Pick a day from the archive</p>
              <p className="mt-1 max-w-sm text-xs text-neutral-500">Emails are stored day by day and only loaded when you open a day, so this page stays fast however many emails there are.</p>
              <button type="button" onClick={() => openDay(today)} className="mt-4 rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">Open today</button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">{dayLabel}</h2>
                  <p className="text-xs text-neutral-500">
                    {dayData ? `${dayData.total.toLocaleString()} ${isFiltering ? "matching " : ""}email${dayData.total === 1 ? "" : "s"}` : "Loading..."}
                    {loadingDay && dayData ? " · refreshing..." : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={exportDay} disabled={exporting || !dayData || dayData.total === 0} className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-brand-red hover:text-brand-red disabled:opacity-50">
                    <FaDownload size={11} /> {exporting ? "Exporting..." : "Download this day"}
                  </button>
                  <button type="button" onClick={() => setDay(null)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50">Close day</button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search email address or subject..." widthClass="w-full sm:w-80" />
                <Select value={kind || "all"} onValueChange={(v) => setKind(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All email types</SelectItem>
                    {facets?.kinds.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{KIND[k.value] ?? k.value} ({k.count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isFiltering && <button onClick={() => { setStatus(""); setKind(""); setSearchInput(""); }} className="text-sm font-medium text-brand-red hover:underline">Clear filters</button>}
              </div>

              <div className="mt-3 flex gap-1 overflow-x-auto border-b border-neutral-200">
                {statusTabs.map(([k, label, count]) => (
                  <button key={k || "all"} onClick={() => setStatus(k)} className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm font-medium transition ${status === k ? "border-brand-red text-brand-red" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}>
                    {label}
                    <span className={`rounded-full px-1.5 py-0.5 text-xs ${status === k ? "bg-brand-red/10 text-brand-red" : "bg-neutral-100 text-neutral-500"}`}>{count}</span>
                  </button>
                ))}
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-xs text-neutral-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Time</th>
                      <th className="px-4 py-2.5 font-medium">To</th>
                      <th className="px-4 py-2.5 font-medium">Email</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {items.map((l) => (
                      <tr key={l.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{time(l.sentAt ?? l.createdAt)}</td>
                        <td className="px-4 py-3 text-neutral-800">{l.toEmail}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-neutral-800">{KIND[l.templateKey] ?? l.templateKey}</p>
                          <p className="max-w-[320px] truncate text-xs text-neutral-500" title={l.subject}>{l.subject}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[l.status] ?? "bg-neutral-100 text-neutral-600"}`}>{STATUS_LABEL[l.status] ?? l.status}</span>
                          {l.error && <p className="mt-1 max-w-[260px] text-xs text-red-600" title={l.error}>{l.error.length > 90 ? `${l.error.slice(0, 90)}...` : l.error}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {l.templateKey !== "OTP" && (
                              <button onClick={() => view(l.id)} className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-brand-red hover:text-brand-red">
                                <FaEye size={11} /> View
                              </button>
                            )}
                            {canSend && l.status !== "PENDING" && l.templateKey !== "OTP" && (
                              <button onClick={() => resend(l.id)} disabled={busyId === l.id} className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-brand-red hover:text-brand-red disabled:opacity-50">
                                <FaRotateRight size={11} /> {busyId === l.id ? "Sending..." : l.status === "FAILED" ? "Retry" : "Send again"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!dayData && loadingDay && (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-400">Loading this day from the database...</td></tr>
                    )}
                    {dayData && items.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-400">{isFiltering ? "No emails match these filters." : "No emails on this day."}</td></tr>
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

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewing(null)}>
          <div className="flex h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">{viewing.subject}</p>
                <p className="text-xs text-neutral-500">To: {viewing.toEmail}</p>
              </div>
              <button onClick={() => setViewing(null)} aria-label="Close" className="text-neutral-400 hover:text-neutral-700"><FaXmark size={16} /></button>
            </div>
            {viewing.html ? (
              <iframe title="Email" sandbox="" srcDoc={viewing.html} className="min-h-0 flex-1 rounded-b-2xl border-0" />
            ) : (
              <p className="p-6 text-sm text-neutral-400">The content of this email was not saved.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
