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
}) {
  return (
    <label
      className={`relative flex gap-2.5 rounded-xl border p-3 transition ${unavailable ? "cursor-not-allowed border-line bg-surface-alt opacity-60" : "cursor-pointer"} ${
        checked && !unavailable ? "border-green-600 bg-green-100" : "border-line bg-surface hover:border-green-600/50"
      }`}
    >
      <input type={type} name={groupName} checked={checked && !unavailable} disabled={unavailable} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
          checked ? "border-green-600 bg-green-600 text-white" : "border-line bg-surface"
        }`}
      >
        {checked && <FaCheck size={9} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-poppins text-[14px] font-semibold leading-[18px] ${checked ? "text-green-700" : "text-ink"}`}>{name}</span>
        {priceLabel && (
          <span className="mt-0.5 block font-poppins text-[12px] font-bold leading-[16px] text-ink">
            {oldPriceLabel && <span className="mr-1 font-normal text-muted line-through">{oldPriceLabel}</span>}
            {priceLabel}
          </span>
        )}
        {description && <span className="mt-1 line-clamp-2 block text-[10px] leading-[14px] text-muted">{description}</span>}
        {unavailable && (
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-brand-red/40 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-red">
            Not available <span className="font-medium normal-case tracking-normal text-muted">· Out of stock right now</span>
          </span>
        )}
      </span>
    </label>
  );
}
