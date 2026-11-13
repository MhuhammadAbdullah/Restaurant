"use client";

import Link from "next/link";
import { GiPartyPopper } from "react-icons/gi";

export function FreeDeliveryUnlocked({ className = "", floating = false }: { className?: string; floating?: boolean }) {
  return (
    <div className={`flex min-h-12 items-center justify-center gap-2 border px-4 text-sm font-bold ${floating ? "rounded-full border-white/80 bg-white/85 text-neutral-900 shadow-[0_8px_24px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-neutral-700/90 dark:bg-neutral-900/90 dark:text-white" : "rounded-2xl border-[#c8f1dd] bg-[#eefbf4] text-[#079447] dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"} ${className}`}>
      <GiPartyPopper aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>Hurray!! You get FREE Delivery</span>
    </div>
  );
}

/** Shared free-delivery message and progress bar for the cart drawer and checkout summary. */
export function FreeDeliveryBanner({
  subtotal,
  minimum,
  onAddMore,
  className = "",
}: {
  /** Item subtotal in paisa. */
  subtotal: number;
  /** Free-delivery minimum in paisa. */
  minimum: number;
  onAddMore?: () => void;
  className?: string;
}) {
  if (minimum <= 0) return null;

  const remaining = Math.max(0, minimum - subtotal);
  const progress = Math.min(100, (subtotal / minimum) * 100);
  if (remaining === 0) return <FreeDeliveryUnlocked className={className} />;

  return (
    <div className={`rounded-2xl border border-[#c8f1dd] bg-[#eafaf2]/95 px-4 py-2.5 text-xs text-[#087b58] shadow-sm backdrop-blur-xl dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <>Add items worth <b className="text-[#087b58] dark:text-emerald-200">Rs. {Math.ceil(remaining / 100)}</b> to get <b className="text-[#087b58] dark:text-emerald-200">FREE Delivery</b></>
        </span>
        <Link href="/" onClick={onAddMore} className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-red">
          Add More <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div className="h-full rounded-full bg-gradient-to-r from-[#00d39a] to-[#009f70] transition-[width] duration-500 ease-in-out motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
