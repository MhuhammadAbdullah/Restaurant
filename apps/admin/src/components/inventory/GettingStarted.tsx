"use client";

import Link from "next/link";

type Step = { done: boolean; title: string; text: string; action?: { label: string; href?: string; onClick?: () => void } };

/** A short checklist that shows what is left to set up, and disappears once everything is done. */
export function GettingStarted({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const current = steps.findIndex((s) => !s.done);
  return (
    <section className="mt-4 rounded-xl border border-brand-red/20 bg-red-50/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Set up your inventory in {steps.length} steps</p>
          <p className="text-xs text-neutral-500">{done} of {steps.length} done</p>
        </div>
        <div className="h-2 w-28 overflow-hidden rounded-full bg-white sm:w-40">
          <div className="h-full rounded-full bg-brand-red transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="mt-3 grid gap-2 md:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className={`rounded-lg border p-3 ${s.done ? "border-green-200 bg-green-50" : i === current ? "border-brand-red bg-white shadow-sm" : "border-neutral-200 bg-white opacity-70"}`}>
            <div className="flex items-center gap-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? "bg-green-600 text-white" : "bg-neutral-200 text-neutral-600"}`}>{s.done ? "✓" : i + 1}</span>
              <p className="text-sm font-semibold text-neutral-900">{s.title}</p>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{s.text}</p>
            {!s.done && i === current && s.action &&
              (s.action.href ? (
                <Link href={s.action.href} className="mt-2 inline-block rounded-lg bg-brand-red px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">{s.action.label}</Link>
              ) : (
                <button type="button" onClick={s.action.onClick} className="mt-2 rounded-lg bg-brand-red px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">{s.action.label}</button>
              ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
