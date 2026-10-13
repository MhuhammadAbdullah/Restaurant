"use client";

import { LoadingDots } from "../LoadingDots";
import { useMe, hasPermission } from "../../lib/useMe";

export function SeoHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  const { data: me } = useMe();
  const canManage = (hasPermission(me, "seo.manage") || hasPermission(me, "settings.manage"));
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">{description}</p>
        </div>
        {children}
      </div>
      {!canManage && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">You have view-only access. Ask an admin for the &quot;settings.manage&quot; permission to make changes.</p>}
    </div>
  );
}

export function useCanManageSeo() {
  const { data: me } = useMe();
  return (hasPermission(me, "seo.manage") || hasPermission(me, "settings.manage"));
}

export function Card({ title, description, children, right }: { title: string; description?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">{title}</p>
          {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, right }: { label: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-neutral-700">{label}</span>
        {right}
      </span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-[11px] text-neutral-400">{hint}</span>}
    </label>
  );
}

/** Live length counter: green inside the range Google shows in full, amber when too short, red when it will be cut off. */
export function Counter({ value, min, max }: { value: string; min: number; max: number }) {
  const n = value.length;
  const tone = n === 0 ? "text-neutral-400" : n > max ? "text-red-600" : n < min ? "text-amber-600" : "text-green-600";
  return (
    <span className={`text-[11px] font-medium tabular-nums ${tone}`}>
      {n}/{max}
    </span>
  );
}

export function SaveBar({ dirty, saving, onSave, onReset, canManage }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void; canManage: boolean }) {
  if (!canManage || !dirty) return null;
  return (
    <div className="sticky bottom-[-1.25rem] z-10 -mx-5 mt-6 flex items-center justify-between gap-3 border-t border-neutral-200 bg-white/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <p className="text-sm text-neutral-600">You have unsaved changes.</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onReset} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
          Discard
        </button>
        <button type="button" onClick={onSave} disabled={saving} className="rounded-lg bg-brand-red px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {saving ? <LoadingDots>Saving</LoadingDots> : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/** How the page looks in Google search results. */
export function SerpPreview({ url, title, description }: { url: string; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Google preview</p>
      <p className="mt-2 truncate text-xs text-neutral-600">{url || "your-website.com"}</p>
      <p className="mt-0.5 line-clamp-2 text-lg leading-snug text-[#1a0dab]">{title || "Page title appears here"}</p>
      <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{description || "The description you write below is shown here. Google may rewrite it, but a good one gets more clicks."}</p>
    </div>
  );
}
