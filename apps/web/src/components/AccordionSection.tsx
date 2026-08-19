"use client";

import { ChevronDownIcon } from "./icons";

/** Collapsible section — red/left-border until satisfied, green once something's selected. */
export function AccordionSection({
  title,
  satisfied,
  requiredBadge,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  satisfied: boolean;
  requiredBadge: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border-l-4 transition-colors duration-300 ${satisfied ? "border-green-600 bg-green-50" : "border-brand-red bg-red-50"}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span className="flex items-center gap-2.5">
          <span className="font-semibold text-ink">{title}</span>
          {requiredBadge && !satisfied && (
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-brand-red">Required</span>
          )}
        </span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/70 text-ink">
          <ChevronDownIcon size={16} className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
