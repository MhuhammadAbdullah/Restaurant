"use client";

import { FaCircleExclamation } from "react-icons/fa6";

/** Consistent required marker for product and deal choice groups. */
export function RequiredChip({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-[10px] font-semibold leading-none text-brand-red dark:border-brand-red/30 dark:bg-brand-red/20 dark:text-red-300 sm:text-xs ${className}`}>
      <FaCircleExclamation aria-hidden="true" className="h-3 w-3" />
      Required
    </span>
  );
}
