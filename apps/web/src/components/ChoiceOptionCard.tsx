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
}: {
  name: string;
  groupName: string;
  type: "radio" | "checkbox";
  checked: boolean;
  onChange: () => void;
  priceLabel?: string;
  oldPriceLabel?: string;
  description?: string | null;
}) {
  return (
    <label
      className={`relative flex cursor-pointer gap-2.5 rounded-xl border p-3 transition ${
        checked ? "border-brand-red bg-brand-red/10" : "border-line bg-surface hover:border-brand-red/40"
      }`}
    >
      <input type={type} name={groupName} checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
          checked ? "border-brand-red bg-brand-red text-white" : "border-line bg-surface"
        }`}
      >
        {checked && <FaCheck size={9} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-poppins text-[14px] font-semibold leading-[18px] ${checked ? "text-brand-red" : "text-ink"}`}>{name}</span>
        {priceLabel && (
          <span className="mt-0.5 block font-poppins text-[12px] font-bold leading-[16px] text-ink">
            {oldPriceLabel && <span className="mr-1 font-normal text-muted line-through">{oldPriceLabel}</span>}
            {priceLabel}
          </span>
        )}
        {description && <span className="mt-1 line-clamp-2 block text-[10px] leading-[14px] text-muted">{description}</span>}
      </span>
    </label>
  );
}
