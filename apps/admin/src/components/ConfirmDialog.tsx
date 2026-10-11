"use client";

import { useEffect, useRef } from "react";
import { FaCircleInfo, FaTriangleExclamation } from "react-icons/fa6";
import { useConfirmStore } from "../store/useConfirmStore";

const TONES = {
  danger: { icon: "bg-red-100 text-red-600", button: "bg-red-600 hover:bg-red-700" },
  warning: { icon: "bg-amber-100 text-amber-600", button: "bg-brand-red hover:opacity-90" },
  info: { icon: "bg-blue-100 text-blue-600", button: "bg-brand-red hover:opacity-90" },
} as const;

/** Mounted once in the root layout; opened from anywhere with confirmDialog(). */
export function ConfirmDialog() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const answer = useConfirmStore((s) => s.answer);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, answer]);

  if (!open || !options) return null;
  const tone = TONES[options.tone ?? "warning"];
  const Icon = options.tone === "info" ? FaCircleInfo : FaTriangleExclamation;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => answer(false)} role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex gap-4 p-6">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-neutral-900">{options.title}</h2>
            <p id="confirm-message" className="mt-1.5 text-sm leading-relaxed text-neutral-600">{options.message}</p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 bg-neutral-50 px-6 py-3.5 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => answer(false)} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
            {options.cancelLabel ?? "Cancel"}
          </button>
          <button ref={confirmRef} type="button" onClick={() => answer(true)} className={`rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm ${tone.button}`}>
            {options.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
