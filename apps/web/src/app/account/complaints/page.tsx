"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaChevronDown, FaCommentDots, FaPaperPlane, FaPlus } from "react-icons/fa6";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";

type Complaint = {
  id: string;
  complaintNumber: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  order: { orderNumber: string; orderCode?: string | null } | null;
};

type Detail = Complaint & {
  description: string;
  branch: { name: string; city: string } | null;
  attachments: { id: string; url: string }[];
  messages: { id: string; senderType: string; message: string; createdAt: string; senderStaff: { name: string } | null }[];
};

const CATEGORY_LABEL: Record<string, string> = {
  FOOD_QUALITY: "Food Quality",
  WRONG_ITEM: "Wrong Item",
  MISSING_ITEM: "Missing Item",
  LATE_DELIVERY: "Late Delivery",
  BRANCH_ISSUE: "Branch Issue",
  STAFF_BEHAVIOUR: "Staff Behaviour",
  PAYMENT_ISSUE: "Payment Issue",
  ORDER_ISSUE: "Order Issue",
  PACKAGING_ISSUE: "Packaging Issue",
  OTHER: "Other",
};

const STATUS: Record<string, { label: string; chip: string }> = {
  OPEN: { label: "Received", chip: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  UNDER_REVIEW: { label: "Under review", chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  IN_PROGRESS: { label: "In progress", chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  RESOLVED: { label: "Resolved", chip: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  CLOSED: { label: "Closed", chip: "bg-surface-alt text-muted" },
  REJECTED: { label: "Not accepted", chip: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};
const OPEN_STATES = new Set(["OPEN", "UNDER_REVIEW", "IN_PROGRESS"]);
type Tab = "all" | "open" | "done";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function ComplaintCard({ c }: { c: Complaint }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const st = STATUS[c.status] ?? { label: c.status, chip: "bg-surface-alt text-muted" };
  const canReply = c.status !== "CLOSED" && c.status !== "REJECTED";

  const { data: detail, isLoading } = useQuery({
    queryKey: ["my-complaint", c.id],
    queryFn: () => api.get<Detail>(`/complaints/me/${c.id}`),
    enabled: open,
  });

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/complaints/me/${c.id}/messages`, { message: reply.trim() });
      setReply("");
      await queryClient.invalidateQueries({ queryKey: ["my-complaint", c.id] });
      toast.success("Your message has been sent");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not send your message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`overflow-hidden rounded-2xl border bg-surface transition ${open ? "border-brand-red/50" : "border-line"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left sm:p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
          <FaCommentDots size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-ink">{c.complaintNumber}</span>
            <span className="text-xs text-muted">{CATEGORY_LABEL[c.category] ?? c.category}</span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-ink">{c.subject}</span>
          <span className="mt-0.5 block text-xs text-muted">
            Submitted {day(c.createdAt)}
            {c.order ? ` · Order ${c.order.orderCode ?? c.order.orderNumber}` : ""}
          </span>
        </span>
        <span className={`hidden shrink-0 rounded-full px-3 py-1 text-xs font-semibold sm:inline-block ${st.chip}`}>{st.label}</span>
        <FaChevronDown size={12} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className="px-4 pb-3 sm:hidden">
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${st.chip}`}>{st.label}</span>
      </div>

      {open && (
        <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5">
          {isLoading || !detail ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your complaint</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{detail.description}</p>
              {detail.branch && (
                <p className="mt-2 text-xs text-muted">
                  {detail.branch.name}, {detail.branch.city}
                </p>
              )}
              {detail.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {detail.attachments.map((a) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt="Attached photo" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}

              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Conversation</p>
              {detail.messages.length === 0 ? (
                <p className="mt-1.5 rounded-xl bg-surface-alt px-4 py-3 text-sm text-muted">We have received your complaint. Our team will reply here and by email or phone.</p>
              ) : (
                <div className="mt-2 space-y-2.5">
                  {detail.messages.map((m) => {
                    const team = m.senderType === "STAFF";
                    return (
                      <div key={m.id} className={`flex ${team ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm ${team ? "rounded-tl-sm bg-surface-alt text-ink" : "rounded-tr-sm bg-brand-red text-white"}`}>
                          <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>
                          <p className={`mt-1 text-[11px] ${team ? "text-muted" : "text-white/75"}`}>
                            {team ? "Our team" : "You"} · {when(m.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {canReply ? (
                <div className="mt-4">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Add a message or more details..."
                    className="input resize-y"
                  />
                  <div className="mt-2 flex justify-end">
                    <button type="button" onClick={send} disabled={!reply.trim() || sending} className="flex items-center gap-2 rounded-xl bg-brand-red px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
                      <FaPaperPlane size={12} /> {sending ? "Sending..." : "Send message"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted">This complaint is {st.label.toLowerCase()}. Please submit a new complaint if you need more help.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function MyComplaintsPage() {
  const { data: complaints, isLoading } = useQuery({ queryKey: ["my-complaints"], queryFn: () => api.get<Complaint[]>("/complaints/me") });
  const [tab, setTab] = useState<Tab>("all");

  const counts = useMemo(() => {
    const open = (complaints ?? []).filter((c) => OPEN_STATES.has(c.status)).length;
    return { all: complaints?.length ?? 0, open, done: (complaints?.length ?? 0) - open };
  }, [complaints]);
  const shown = useMemo(() => (complaints ?? []).filter((c) => (tab === "all" ? true : tab === "open" ? OPEN_STATES.has(c.status) : !OPEN_STATES.has(c.status))), [complaints, tab]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Complaints</h1>
          <p className="mt-0.5 text-sm text-muted">Follow your complaints and reply to our team.</p>
        </div>
        <Link href="/complaints" className="flex items-center gap-2 rounded-xl bg-brand-red px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
          <FaPlus size={12} /> New complaint
        </Link>
      </div>

      <div className="mt-4 flex gap-2">
        {(
          [
            ["all", "All"],
            ["open", "Open"],
            ["done", "Resolved & closed"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${tab === k ? "border-brand-red bg-brand-red text-white" : "border-line bg-surface text-ink hover:border-brand-red"}`}
          >
            {label}
            <span className={`rounded-full px-1.5 text-xs ${tab === k ? "bg-white/25" : "bg-surface-alt text-muted"}`}>{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {isLoading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl border border-line bg-surface-alt" />)}
        {!isLoading && shown.map((c) => <ComplaintCard key={c.id} c={c} />)}
        {!isLoading && shown.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
              <FaCommentDots size={22} />
            </span>
            <p className="mt-4 text-base font-semibold text-ink">{counts.all === 0 ? "No complaints yet" : tab === "open" ? "No open complaints" : "Nothing resolved yet"}</p>
            <p className="mt-1 text-sm text-muted">{counts.all === 0 ? "If something goes wrong with an order, tell us and we will make it right." : "Switch the filter above to see your other complaints."}</p>
            {counts.all === 0 && (
              <Link href="/complaints" className="mt-5 rounded-xl bg-brand-red px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                Submit a complaint
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
