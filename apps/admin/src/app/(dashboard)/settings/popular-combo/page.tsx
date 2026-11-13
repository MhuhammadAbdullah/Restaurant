"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PopularComboConfig } from "@restaurant/validation";
import { PopularComboIcon } from "@restaurant/ui";
import { api, ApiError } from "../../../../lib/api";
import { hasPermission, useMe } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { LoadingDots } from "../../../../components/LoadingDots";

const defaults: Required<PopularComboConfig> = {
  heading: "Try these quick selections!",
  description: "You can edit your choices from the list",
  title: "Most Popular Combo",
};
type RestaurantInfo = { popularCombo: Required<PopularComboConfig> };

export default function PopularComboSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");
  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });
  const [form, setForm] = useState(defaults);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const snapshot = useMemo(() => JSON.stringify(form), [form]);
  const dirty = saved !== "" && snapshot !== saved;

  useEffect(() => {
    if (!restaurant?.popularCombo) return;
    setForm({ ...defaults, ...restaurant.popularCombo });
    setSaved(JSON.stringify({ ...defaults, ...restaurant.popularCombo }));
  }, [restaurant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", { popularCombo: form });
      await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
      setSaved(snapshot);
      toast.success("Popular Combo settings saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save Popular Combo settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-neutral-900">Popular Combo</h1>
      <p className="mt-1 text-sm text-neutral-500">Manage the quick selection shown in product and deal pop-ups. Choose the options themselves in Choice Sections.</p>
      {!canManage && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">You have view-only access. Ask an admin for the settings.manage permission to make changes.</p>}

      <form onSubmit={submit} className="mt-5 space-y-4">
        <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-70">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-neutral-500">This panel appears whenever a product or deal has an available option marked as Popular Combo.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Panel heading</span>
                <input maxLength={100} value={form.heading} onChange={(e) => setForm((v) => ({ ...v, heading: e.target.value }))} className="input w-full" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Combo title</span>
                <input maxLength={80} value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} className="input w-full" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Supporting text</span>
                <input maxLength={160} value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} className="input w-full" />
              </label>
            </div>
            <p className="mt-3 text-xs text-neutral-500">The sparkle icon and selection control use the same fixed design throughout the website.</p>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-900">Preview</h2>
            <div className="mt-3 rounded-2xl bg-[#fde6e6] p-4">
              <p className="text-sm font-bold text-slate-900">{form.heading || defaults.heading}</p>
              <p className="mt-0.5 text-xs text-slate-500">{form.description || defaults.description}</p>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-brand-red/40 bg-white p-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-900"><PopularComboIcon className="text-brand-red" /> <span className="truncate">{form.title || defaults.title}</span><span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-brand-red">1 item</span></span>
                <span className="h-5 w-5 shrink-0 rounded-full border-2 border-slate-400" />
              </div>
            </div>
          </section>

          <div className="sticky bottom-0 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
            <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving || !dirty || !form.heading.trim() || !form.title.trim()}>{saving ? <LoadingDots>Saving</LoadingDots> : "Save Changes"}</button>
            <button type="button" onClick={() => saved && setForm(JSON.parse(saved) as typeof defaults)} disabled={!dirty || saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 disabled:opacity-50">Reset</button>
            <span className="text-xs text-neutral-500">{dirty ? "Unsaved changes" : "All changes saved"}</span>
          </div>
        </fieldset>
      </form>
      <style jsx global>{`.input { border-radius: .5rem; border: 1px solid #d4d4d4; padding: .5rem .75rem; font-size: .875rem; }`}</style>
    </div>
  );
}
