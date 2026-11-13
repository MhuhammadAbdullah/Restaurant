"use client";

import { ChevronDownIcon } from "./icons";
import { RequiredChip } from "./RequiredChip";

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
    <div className={`overflow-hidden rounded-2xl border border-line border-l-4 bg-white transition-colors duration-300 dark:bg-zinc-900 ${satisfied ? "border-l-emerald-500" : "border-l-emerald-400"}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left sm:gap-3 sm:px-4 sm:py-3.5">
        <span className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className="line-clamp-2 min-w-0 text-sm font-semibold text-ink sm:text-base">{title}</span>
          {requiredBadge && !satisfied && <RequiredChip />}
        </span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-white text-neutral-700 shadow-sm dark:bg-zinc-800 dark:text-neutral-200">
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
