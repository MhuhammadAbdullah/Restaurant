"use client";

import { useEffect, useState } from "react";
import { FaFileInvoiceDollar, FaKitchenSet, FaListCheck, FaPlus, FaPrint, FaReceipt } from "react-icons/fa6";
import type { PrintOption } from "@restaurant/utils";
import { CloseIcon } from "../icons";

const ICON: Record<string, React.ReactElement> = {
  customer: <FaReceipt size={17} />,
  pre: <FaFileInvoiceDollar size={17} />,
  kitchen: <FaKitchenSet size={17} />,
  full: <FaListCheck size={17} />,
};

/**
 * "What do you want to print?" for an existing order. Tick any mix of slips and print them together in one go, or press
 * "Print" on a row to print just that one. (The list comes from printOptionsFor, so only what makes sense for the order is shown.)
 */
export function PrintMenuDialog({ title, options, onPrint, onClose }: { title: string; options: PrintOption[]; onPrint: (keys: string[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  // printed in the order they are listed, whatever order they were ticked in
  const ordered = options.map((o) => o.key).filter((k) => picked.includes(k));
  const allOn = picked.length === options.length;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Print" className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-neutral-900">Print</p>
            <p className="truncate text-xs text-neutral-500">{title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
        </div>

        <div className="flex items-center justify-between px-5 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Tick one or more to print together</p>
          <button type="button" onClick={() => setPicked(allOn ? [] : options.map((o) => o.key))} className="text-xs font-medium text-brand-red hover:underline">{allOn ? "Clear" : "Select all"}</button>
        </div>

        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {options.map((o) => {
            const on = picked.includes(o.key);
            return (
              <li key={o.key}>
                <div className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 transition ${on ? "border-brand-red bg-brand-red/5" : "border-neutral-200 bg-white hover:border-neutral-300"}`}>
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={on} onChange={() => toggle(o.key)} className="h-4 w-4 shrink-0 accent-[#ED2320]" aria-label={o.label} />
                    <span className="shrink-0 text-brand-red">{ICON[o.key] ?? <FaPlus size={15} />}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-neutral-900">{o.label}</span>
                      <span className="block text-xs text-neutral-500">{o.hint}</span>
                    </span>
                  </label>
                  <button type="button" onClick={() => onPrint([o.key])} className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-brand-red hover:text-brand-red">Print</button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-neutral-200 p-4">
          <button
            type="button"
            onClick={() => onPrint(ordered)}
            disabled={ordered.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-red py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            <FaPrint size={14} /> {ordered.length === 0 ? "Tick what to print" : `Print selected (${ordered.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
