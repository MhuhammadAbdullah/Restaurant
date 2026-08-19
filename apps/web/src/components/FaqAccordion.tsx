"use client";

import { useState } from "react";
import { ChevronDownIcon } from "./icons";
import { MarkdownContent } from "./MarkdownContent";

type FaqItem = { id: string; question: string; answer: string };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="divide-y divide-line">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id} className="py-1">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="flex w-full items-center justify-between gap-3 py-3 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-sm font-semibold text-ink sm:text-base">{item.question}</span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink">
                <ChevronDownIcon size={16} className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
              </span>
            </button>

            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div className="pb-4">
                  <MarkdownContent content={item.answer} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
