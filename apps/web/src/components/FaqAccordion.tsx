"use client";

import { useMemo, useState } from "react";
import { FaChevronDown, FaMagnifyingGlass, FaXmark } from "react-icons/fa6";
import { MarkdownContent } from "./MarkdownContent";

type FaqItem = { id: string; question: string; answer: string };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? items.filter((i) => i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q)) : items), [items, q]);

  return (
    <div>
      {items.length > 4 && (
        <div className="relative">
          <FaMagnifyingGlass size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions..."
            aria-label="Search questions"
            className="input !pl-11 !pr-10"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:text-ink">
              <FaXmark size={13} />
            </button>
          )}
        </div>
      )}

      {items.length > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <span>
            {q ? `${shown.length} of ${items.length} questions` : `${items.length} questions`}
          </span>
          <button type="button" onClick={() => setOpenId(openId ? null : shown[0]?.id ?? null)} className="font-medium text-brand-red hover:underline">
            {openId ? "Collapse" : "Open first"}
          </button>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {shown.map((item) => {
          const isOpen = openId === item.id;
          return (
            <div key={item.id} className={`overflow-hidden rounded-xl border transition-colors ${isOpen ? "border-brand-red/50 bg-brand-red/[0.03]" : "border-line bg-surface"}`}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : item.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5"
                aria-expanded={isOpen}
              >
                <span className={`text-sm font-semibold sm:text-base ${isOpen ? "text-brand-red" : "text-ink"}`}>{item.question}</span>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${isOpen ? "bg-brand-red text-white" : "bg-surface-alt text-ink"}`}>
                  <FaChevronDown size={12} className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </span>
              </button>

              <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="border-t border-line/60 px-4 pb-4 pt-1 sm:px-5">
                    <MarkdownContent content={item.answer} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {shown.length === 0 && (
          <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink">{q ? `No questions match “${query}”` : "No questions yet"}</p>
            {q && (
              <button type="button" onClick={() => setQuery("")} className="mt-1 text-xs font-medium text-brand-red hover:underline">
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
