"use client";

import { FaCheck } from "react-icons/fa6";

/**
 * One option of a choice section, drawn as a selectable card: name, extra price and a short description,
 * with a round tick when picked. Works as a radio (pick one) or a checkbox (pick several).
 */
export function ChoiceOptionCard({
  name,
  groupName,
  type,
  checked,
  onChange,
  priceLabel,
  oldPriceLabel,
  description,
  unavailable,
  image,
  className = "",
}: {
  name: string;
  groupName: string;
  type: "radio" | "checkbox";
  checked: boolean;
  onChange: () => void;
  priceLabel?: string;
  oldPriceLabel?: string;
  description?: string | null;
  /** Out of stock at this branch: shown faded with a "Not available" tag and cannot be picked. */
  unavailable?: boolean;
  image?: string | null;
  className?: string;
}) {
  const selectedStyle = checked && !unavailable
    ? "border-brand-red bg-[#f8eee9] dark:bg-brand-red/10"
    : "border-line bg-surface hover:border-neutral-300 dark:hover:border-neutral-600";

  if (image) {
    return (
      <label className={`relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border shadow-sm transition hover:shadow-md ${selectedStyle} ${unavailable ? "cursor-not-allowed opacity-60" : ""} ${className}`}>
        <input type={type} name={groupName} checked={checked && !unavailable} disabled={unavailable} onChange={onChange} className="sr-only" />
        <div className="relative aspect-square w-full overflow-hidden bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={name} className="h-full w-full object-cover" />
          <span aria-hidden="true" className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm ${checked && !unavailable ? "border-brand-red !bg-brand-red text-white" : "border-slate-400 bg-surface/95 text-transparent"}`}>
            {checked && !unavailable && <FaCheck size={11} className="text-white" />}
          </span>
          {unavailable && <span className="absolute inset-x-0 bottom-0 bg-surface/90 px-2 py-1 text-center text-[10px] font-bold uppercase text-brand-red">Not available</span>}
        </div>
        <span className="min-w-0 flex-1 p-2.5 sm:p-3">
          <span className="block truncate font-poppins text-[13px] font-semibold leading-5 text-ink sm:text-sm">{name}</span>
          {priceLabel && <span className="mt-0.5 block text-xs font-bold text-ink">{oldPriceLabel && <span className="mr-1 font-normal text-muted line-through">{oldPriceLabel}</span>}{priceLabel}</span>}
          {description && <span className="mt-1 line-clamp-2 block text-[10px] leading-[14px] text-muted">{description}</span>}
        </span>
      </label>
    );
  }

  return (
    <label
      className={`relative flex gap-2.5 rounded-xl border p-3 transition ${unavailable ? "cursor-not-allowed bg-surface-alt opacity-60" : "cursor-pointer"} ${selectedStyle} ${className}`}
    >
      <input type={type} name={groupName} checked={checked && !unavailable} disabled={unavailable} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
          checked ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 bg-surface text-muted"
        }`}
      >
        {checked && <FaCheck size={9} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-poppins text-[14px] font-semibold leading-[18px] text-ink">{name}</span>
        {priceLabel && (
          <span className="mt-0.5 block font-poppins text-[12px] font-bold leading-[16px] text-ink">
            {oldPriceLabel && <span className="mr-1 font-normal text-muted line-through">{oldPriceLabel}</span>}
            {priceLabel}
          </span>
        )}
        {description && <span className="mt-1 line-clamp-2 block text-[10px] leading-[14px] text-muted">{description}</span>}
        {unavailable && (
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-brand-red/40 bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-red">
            Not available <span className="font-medium normal-case tracking-normal text-muted">· Out of stock right now</span>
          </span>
        )}
      </span>
    </label>
  );
}
