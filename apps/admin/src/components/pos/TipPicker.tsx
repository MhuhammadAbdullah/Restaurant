"use client";

import { useState } from "react";
import { formatPaisa } from "@restaurant/utils";

const PRESETS = [50, 100, 200, 500];

/**
 * Optional tip for POS. A quick amount applies the moment it is tapped; a custom amount is only applied
 * when "Add" is pressed (or Enter), so half-typed numbers never change the bill.
 * `value` is the applied tip in rupees as a string ("" = no tip).
 */
export function TipPicker({ value, onChange }: { value: string; onChange: (rupees: string) => void }) {
  const [draft, setDraft] = useState("");
  const applied = value.trim() && Number(value) > 0 ? Number(value) : 0;
  const customApplied = applied > 0 && !PRESETS.includes(applied);
  const draftValid = draft.trim() !== "" && Number(draft) > 0;

  function addCustom() {
    if (!draftValid) return;
    onChange(String(Math.round(Number(draft))));
    setDraft("");
  }

  return (
    <div className="rounded-xl bg-white p-2.5 ring-1 ring-neutral-200">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-neutral-700">Tip <span className="font-normal text-neutral-400">(optional)</span></p>
        {applied > 0 && (
          <button type="button" onClick={() => { onChange(""); setDraft(""); }} className="text-[11px] text-neutral-400 underline hover:text-red-600">
            Remove
          </button>
        )}
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {PRESETS.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => {
              onChange(applied === amt ? "" : String(amt));
              setDraft("");
            }}
            className={`rounded-md border py-2 text-xs font-semibold transition ${applied === amt ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-brand-red hover:text-brand-red"}`}
          >
            {amt}
          </button>
        ))}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400">Rs.</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Other amount"
            aria-label="Custom tip amount in rupees"
            className="w-full rounded-md border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm font-medium placeholder:font-normal focus:border-brand-red focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
        <button
          type="button"
          onClick={addCustom}
          disabled={!draftValid}
          className="shrink-0 rounded-md bg-neutral-900 px-4 text-xs font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {customApplied && <p className="mt-1.5 text-[11px] font-medium text-green-700">Tip of {formatPaisa(applied * 100)} added</p>}
    </div>
  );
}
