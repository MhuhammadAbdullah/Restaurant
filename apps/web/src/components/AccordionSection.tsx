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
    <div className={`overflow-hidden rounded-2xl border-l-4 bg-emerald-50 transition-colors duration-300 dark:bg-emerald-950/40 ${satisfied ? "border-emerald-600 dark:border-emerald-700" : "border-emerald-500 dark:border-emerald-800"}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left sm:gap-3 sm:px-4 sm:py-3.5">
        <span className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className="line-clamp-2 min-w-0 text-sm font-semibold text-emerald-900 dark:text-emerald-200 sm:text-base">{title}</span>
          {requiredBadge && !satisfied && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">Required</span>
          )}
        </span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-300 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
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
