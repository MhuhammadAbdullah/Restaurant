"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FaqItem } from "@restaurant/validation";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { RichTextEditor } from "../../../../components/RichTextEditor";
import { CloseIcon } from "../../../../components/icons";

type StaticPageContent = { title: string; content: string };
type FaqPageContent = { title: string; items: FaqItem[] };
type RestaurantInfo = {
  pages: { terms: StaticPageContent; privacy: StaticPageContent; faqs: FaqPageContent };
};

const SLUGS = [
  { key: "terms" as const, label: "Terms & Conditions" },
  { key: "privacy" as const, label: "Privacy Policy" },
  { key: "faqs" as const, label: "FAQs" },
];
type Slug = (typeof SLUGS)[number]["key"];

function newFaqId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `faq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function LegalPagesSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });

  const [activeTab, setActiveTab] = useState<Slug>("terms");
  const [textForm, setTextForm] = useState<Record<"terms" | "privacy", StaticPageContent>>({
    terms: { title: "", content: "" },
    privacy: { title: "", content: "" },
  });
  const [faqForm, setFaqForm] = useState<FaqPageContent>({ title: "", items: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurant?.pages) return;
    setTextForm({ terms: restaurant.pages.terms, privacy: restaurant.pages.privacy });
    setFaqForm(restaurant.pages.faqs);
  }, [restaurant]);

  function addFaqItem() {
    setFaqForm((f) => ({ ...f, items: [...f.items, { id: newFaqId(), question: "", answer: "" }] }));
  }
  function updateFaqItem(id: string, patch: Partial<FaqItem>) {
    setFaqForm((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  }
  function removeFaqItem(id: string) {
    setFaqForm((f) => ({ ...f, items: f.items.filter((it) => it.id !== id) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const items = faqForm.items.filter((it) => it.question.trim() && it.answer.trim());
      await api.patch("/cms/restaurant", {
        pages: { terms: textForm.terms, privacy: textForm.privacy, faqs: { ...faqForm, items } },
      });
      await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
      toast.success("Legal pages saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save page content");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Legal Pages</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Edit the Terms &amp; Conditions, Privacy Policy, and FAQs pages shown on the customer website.
      </p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <div className="mt-5 flex gap-1 border-b border-neutral-200">
        {SLUGS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              activeTab === key ? "border-brand-red text-brand-red" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 max-w-3xl">
        <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-70">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-neutral-900">{SLUGS.find((s) => s.key === activeTab)?.label}</p>

            {activeTab === "faqs" ? (
              <>
                <div className="mt-4">
                  <p className="mb-1 text-xs font-medium text-neutral-500">Page Title</p>
                  <input
                    value={faqForm.title}
                    onChange={(e) => setFaqForm({ ...faqForm, title: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium text-neutral-500">
                    Questions &amp; Answers: each shows as its own expandable item on the website.
                  </p>
                  <div className="space-y-3">
                    {faqForm.items.map((item, i) => (
                      <div key={item.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                        <div className="flex items-start gap-2">
                          <span className="mt-2 shrink-0 text-xs font-semibold text-neutral-400">{i + 1}.</span>
                          <div className="flex-1 space-y-2">
                            <input
                              value={item.question}
                              onChange={(e) => updateFaqItem(item.id, { question: e.target.value })}
                              placeholder="Question"
                              className="input w-full bg-white font-medium"
                              required
                            />
                            <textarea
                              value={item.answer}
                              onChange={(e) => updateFaqItem(item.id, { answer: e.target.value })}
                              placeholder="Answer"
                              rows={2}
                              className="input w-full bg-white"
                              required
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFaqItem(item.id)}
                            aria-label="Remove question"
                            className="mt-2 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-1 text-neutral-500 hover:border-red-400 hover:text-red-600"
                          >
                            <CloseIcon size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addFaqItem} className="mt-3 text-sm font-medium text-brand-red hover:opacity-80">
                    + Add Question
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4">
                  <p className="mb-1 text-xs font-medium text-neutral-500">Page Title</p>
                  <input
                    value={textForm[activeTab].title}
                    onChange={(e) => setTextForm({ ...textForm, [activeTab]: { ...textForm[activeTab], title: e.target.value } })}
                    className="input w-full"
                    required
                  />
                </div>

                <div className="mt-4">
                  <p className="mb-1 text-xs font-medium text-neutral-500">Content</p>
                  {restaurant ? (
                    <RichTextEditor
                      key={activeTab}
                      value={textForm[activeTab].content}
                      onChange={(content) => setTextForm({ ...textForm, [activeTab]: { ...textForm[activeTab], content } })}
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center rounded-lg border border-neutral-200 text-sm text-neutral-400">
                      Loading...
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
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
