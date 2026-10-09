"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_PAGES_CONFIG, type FaqItem } from "@restaurant/validation";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { RichTextEditor } from "../../../../components/RichTextEditor";
import { TrashIcon } from "../../../../components/icons";

type StaticPageContent = { title: string; content: string };
type FaqPageContent = { title: string; items: FaqItem[] };
type PagesState = { terms: StaticPageContent; privacy: StaticPageContent; faqs: FaqPageContent };
type RestaurantInfo = { pages: PagesState };

const SLUGS = [
  { key: "terms" as const, label: "Terms & Conditions", path: "/terms", hint: "Cancellation, refund, delivery and ordering rules." },
  { key: "privacy" as const, label: "Privacy Policy", path: "/privacy-policy", hint: "How customer data is collected and used." },
  { key: "faqs" as const, label: "FAQs", path: "/faqs", hint: "Questions customers often ask, as expandable items." },
];
type Slug = (typeof SLUGS)[number]["key"];

const TITLE_MAX = 150;
const CONTENT_MAX = 20000;
const QUESTION_MAX = 200;
const ANSWER_MAX = 3000;
const FAQ_MAX = 50;

function newFaqId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `faq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const wordCount = (md: string) => md.replace(/[#*_>`~\-\[\]()]/g, " ").split(/\s+/).filter(Boolean).length;

export default function LegalPagesSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });

  const [activeTab, setActiveTab] = useState<Slug>("terms");
  const [pages, setPages] = useState<PagesState | null>(null);
  const [saved, setSaved] = useState<PagesState | null>(null);
  const [editorVersion, setEditorVersion] = useState(0); // bump to remount the rich-text editor after a reset
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [webUrl, setWebUrl] = useState("");

  useEffect(() => {
    setWebUrl(process.env.NEXT_PUBLIC_WEB_URL ?? (window.location.hostname === "localhost" ? "http://localhost:3000" : ""));
  }, []);

  useEffect(() => {
    if (!restaurant?.pages) return;
    setPages(restaurant.pages);
    setSaved(restaurant.pages);
    setEditorVersion((v) => v + 1);
  }, [restaurant]);

  const dirtyBy = useMemo(() => {
    const d: Record<Slug, boolean> = { terms: false, privacy: false, faqs: false };
    if (pages && saved) for (const { key } of SLUGS) d[key] = JSON.stringify(pages[key]) !== JSON.stringify(saved[key]);
    return d;
  }, [pages, saved]);
  const dirty = dirtyBy.terms || dirtyBy.privacy || dirtyBy.faqs;

  function setText(slug: "terms" | "privacy", patch: Partial<StaticPageContent>) {
    setPages((p) => (p ? { ...p, [slug]: { ...p[slug], ...patch } } : p));
  }
  function setFaq(patch: Partial<FaqPageContent>) {
    setPages((p) => (p ? { ...p, faqs: { ...p.faqs, ...patch } } : p));
  }
  function addFaqItem() {
    if (!pages || pages.faqs.items.length >= FAQ_MAX) return;
    const id = newFaqId();
    setFaq({ items: [...pages.faqs.items, { id, question: "", answer: "" }] });
    setOpenFaq(id);
  }
  function updateFaqItem(id: string, patch: Partial<FaqItem>) {
    setPages((p) => (p ? { ...p, faqs: { ...p.faqs, items: p.faqs.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } } : p));
  }
  function removeFaqItem(id: string) {
    setPages((p) => (p ? { ...p, faqs: { ...p.faqs, items: p.faqs.items.filter((it) => it.id !== id) } } : p));
  }
  function moveFaqItem(index: number, dir: -1 | 1) {
    setPages((p) => {
      if (!p) return p;
      const items = [...p.faqs.items];
      const j = index + dir;
      if (j < 0 || j >= items.length) return p;
      [items[index], items[j]] = [items[j]!, items[index]!];
      return { ...p, faqs: { ...p.faqs, items } };
    });
  }

  function discardTab(slug: Slug) {
    if (!saved) return;
    setPages((p) => (p ? { ...p, [slug]: saved[slug] } : p));
    setEditorVersion((v) => v + 1);
  }
  function restoreDefault(slug: Slug) {
    if (!confirm(`Replace the current ${SLUGS.find((s) => s.key === slug)!.label} text with the default template? You can still discard before saving.`)) return;
    setPages((p) => (p ? { ...p, [slug]: DEFAULT_PAGES_CONFIG[slug] as never } : p));
    setEditorVersion((v) => v + 1);
  }

  function problems(): { tab: Slug; message: string }[] {
    if (!pages) return [];
    const out: { tab: Slug; message: string }[] = [];
    for (const slug of ["terms", "privacy"] as const) {
      const label = SLUGS.find((s) => s.key === slug)!.label;
      if (!pages[slug].title.trim()) out.push({ tab: slug, message: `${label}: add a page title` });
      if (!pages[slug].content.trim()) out.push({ tab: slug, message: `${label}: content can't be empty` });
    }
    if (!pages.faqs.title.trim()) out.push({ tab: "faqs", message: "FAQs: add a page title" });
    pages.faqs.items.forEach((it, i) => {
      if (!it.question.trim() || !it.answer.trim()) out.push({ tab: "faqs", message: `FAQs: question ${i + 1} needs both a question and an answer` });
    });
    return out;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pages) return;
    const issues = problems();
    if (issues.length > 0) {
      setActiveTab(issues[0]!.tab);
      toast.error(issues[0]!.message);
      return;
    }
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", { pages });
      await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
      toast.success("Legal pages saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save page content");
    } finally {
      setSaving(false);
    }
  }

  const current = SLUGS.find((s) => s.key === activeTab)!;
  const faqIncomplete = (it: FaqItem) => !it.question.trim() || !it.answer.trim();

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Legal Pages</h1>
      <p className="mt-1 text-sm text-neutral-500">The Terms &amp; Conditions, Privacy Policy and FAQs pages linked from your website footer.</p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SLUGS.map(({ key, label, hint }) => {
          const active = activeTab === key;
          const stat = !pages
            ? ""
            : key === "faqs"
              ? `${pages.faqs.items.length} question${pages.faqs.items.length === 1 ? "" : "s"}`
              : `${wordCount(pages[key].content).toLocaleString()} words`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`rounded-xl border p-4 text-left transition ${active ? "border-brand-red bg-red-50 shadow-sm" : "border-neutral-200 bg-white hover:bg-neutral-50"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${active ? "text-brand-red" : "text-neutral-900"}`}>{label}</span>
                {dirtyBy[key] && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Unsaved</span>}
              </span>
              <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span>
              <span className="mt-2 block text-[11px] font-medium text-neutral-400">{stat}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-70">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-neutral-900">{current.label}</p>
                <p className="text-xs text-neutral-500">Shown on your website at <span className="font-mono">{current.path}</span></p>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium">
                {webUrl && (
                  <a href={`${webUrl}${current.path}`} target="_blank" rel="noreferrer" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50">
                    View on website ↗
                  </a>
                )}
                {canManage && (
                  <button type="button" onClick={() => restoreDefault(activeTab)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50">
                    Restore default text
                  </button>
                )}
                {dirtyBy[activeTab] && (
                  <button type="button" onClick={() => discardTab(activeTab)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-brand-red hover:bg-red-100">
                    Discard changes
                  </button>
                )}
              </div>
            </div>

            {!pages ? (
              <div className="mt-4 flex h-64 items-center justify-center rounded-lg border border-neutral-200 text-sm text-neutral-400">Loading...</div>
            ) : activeTab === "faqs" ? (
              <>
                <div className="mt-4">
                  <p className="mb-1 text-xs font-medium text-neutral-500">Page title *</p>
                  <input value={pages.faqs.title} onChange={(e) => setFaq({ title: e.target.value.slice(0, TITLE_MAX) })} className="input w-full" required />
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-500">
                      Questions &amp; answers ({pages.faqs.items.length}/{FAQ_MAX})
                    </p>
                    {pages.faqs.items.length > 1 && (
                      <button type="button" onClick={() => setOpenFaq(openFaq ? null : pages.faqs.items[0]!.id)} className="text-xs font-medium text-neutral-500 hover:text-neutral-800">
                        {openFaq ? "Collapse all" : "Expand first"}
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {pages.faqs.items.map((item, i) => {
                      const open = openFaq === item.id;
                      const bad = faqIncomplete(item);
                      return (
                        <div key={item.id} className={`rounded-lg border bg-neutral-50 ${bad && !open ? "border-amber-300" : "border-neutral-200"}`}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">{i + 1}</span>
                            <button type="button" onClick={() => setOpenFaq(open ? null : item.id)} className="min-w-0 flex-1 text-left">
                              <span className={`block truncate text-sm font-medium ${item.question.trim() ? "text-neutral-900" : "text-neutral-400"}`}>{item.question.trim() || "New question"}</span>
                              {!open && bad && <span className="block text-[11px] text-amber-700">Needs a question and an answer</span>}
                            </button>
                            <div className="flex shrink-0 items-center gap-1 text-neutral-400">
                              <button type="button" disabled={i === 0} onClick={() => moveFaqItem(i, -1)} aria-label="Move up" className="rounded px-1.5 py-0.5 hover:bg-neutral-200 disabled:opacity-30">▲</button>
                              <button type="button" disabled={i === pages.faqs.items.length - 1} onClick={() => moveFaqItem(i, 1)} aria-label="Move down" className="rounded px-1.5 py-0.5 hover:bg-neutral-200 disabled:opacity-30">▼</button>
                              <button type="button" onClick={() => removeFaqItem(item.id)} aria-label="Remove question" className="ml-1 hover:text-red-600"><TrashIcon size={15} /></button>
                            </div>
                          </div>
                          {open && (
                            <div className="space-y-2 border-t border-neutral-200 px-3 pb-3 pt-3">
                              <input
                                autoFocus={!item.question}
                                value={item.question}
                                onChange={(e) => updateFaqItem(item.id, { question: e.target.value.slice(0, QUESTION_MAX) })}
                                placeholder="Question, e.g. How long does delivery take?"
                                className="input w-full bg-white font-medium"
                              />
                              <textarea
                                value={item.answer}
                                onChange={(e) => updateFaqItem(item.id, { answer: e.target.value.slice(0, ANSWER_MAX) })}
                                placeholder="Answer"
                                rows={4}
                                className="input w-full bg-white"
                              />
                              <p className="text-right text-[11px] text-neutral-400">Question {item.question.length}/{QUESTION_MAX} · Answer {item.answer.length}/{ANSWER_MAX}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {pages.faqs.items.length === 0 && <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No questions yet.</p>}
                  </div>
                  <button
                    type="button"
                    onClick={addFaqItem}
                    disabled={pages.faqs.items.length >= FAQ_MAX}
                    className="mt-3 w-full rounded-lg border border-dashed border-brand-red py-2 text-sm font-medium text-brand-red hover:bg-red-50 disabled:opacity-50"
                  >
                    + Add question
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4">
                  <p className="mb-1 text-xs font-medium text-neutral-500">Page title *</p>
                  <input value={pages[activeTab].title} onChange={(e) => setText(activeTab, { title: e.target.value.slice(0, TITLE_MAX) })} className="input w-full" required />
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-500">Content *</p>
                    <p className={`text-[11px] ${pages[activeTab].content.length > CONTENT_MAX * 0.9 ? "text-amber-600" : "text-neutral-400"}`}>
                      {pages[activeTab].content.length.toLocaleString()}/{CONTENT_MAX.toLocaleString()} characters
                    </p>
                  </div>
                  <RichTextEditor key={`${activeTab}-${editorVersion}`} value={pages[activeTab].content} onChange={(content) => setText(activeTab, { content })} />
                  <p className="mt-1.5 text-[11px] text-neutral-400">Use the toolbar for headings, bold, lists and links. What you see here is how it will be formatted.</p>
                </div>
              </>
            )}
          </div>

          <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
            <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving || !dirty}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!saved) return;
                setPages(saved);
                setEditorVersion((v) => v + 1);
              }}
              disabled={!dirty || saving}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Reset all
            </button>
            <span className={`text-xs ${dirty ? "font-medium text-amber-600" : "text-neutral-400"}`}>
              {dirty ? `Unsaved changes in ${SLUGS.filter((s) => dirtyBy[s.key]).map((s) => s.label).join(", ")}` : "All changes saved"}
            </span>
          </div>
        </fieldset>
      </form>

      <style jsx global>{`
        .input {
          border-radius: 0.5rem;
          border: 1px solid #d4d4d4;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
