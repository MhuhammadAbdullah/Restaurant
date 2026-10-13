"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { guideLines } from "@restaurant/validation";
import { api, ApiError } from "../../lib/api";
import { toast } from "../../store/useToastStore";
import { confirmDialog } from "../../store/useConfirmStore";
import { Field, INPUT, Modal } from "../inventory/shared";
import { EditIcon, TrashIcon } from "../icons";

type Row = { productId: string; name: string; category: string; active: boolean; hasRecipe: boolean; prepMinutes: number | null };
type Guide = { productId: string; name: string; category: string; prepMinutes: number | null; servings: string; ingredients: string; steps: string; notes: string };

/**
 * The kitchen's recipe book: how to make each product. Read-only for kitchen staff, editable for people who may edit.
 * It is plain instructions and has nothing to do with stock.
 */
export function RecipeBook({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["recipe-book"], queryFn: () => api.get<Row[]>("/recipes") });
  const rows = data ?? [];
  const written = rows.filter((r) => r.hasRecipe).length;

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      if (q && !r.name.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q)) continue;
      if (onlyMissing && r.hasRecipe) continue;
      m.set(r.category, [...(m.get(r.category) ?? []), r]);
    }
    return [...m.entries()];
  }, [rows, search, onlyMissing]);

  function close() {
    setOpenId(null);
    setEditing(false);
  }
  function saved() {
    setEditing(false);
    void queryClient.invalidateQueries({ queryKey: ["recipe-book"] });
    void queryClient.invalidateQueries({ queryKey: ["recipe-guide"] });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a dish" className={`${INPUT} !w-full sm:!w-72`} />
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="accent-[#ED2320]" /> Not written yet
        </label>
        <p className="ml-auto text-xs text-neutral-400">{written} of {rows.length} dishes have a recipe</p>
      </div>

      <div className="mt-4 space-y-5">
        {isLoading ? (
          <p className="text-sm text-neutral-400">Loading...</p>
        ) : groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">{rows.length === 0 ? "No products yet." : "Nothing to show."}</p>
        ) : (
          groups.map(([category, list]) => (
            <section key={category}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{category}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((r) => (
                  <button key={r.productId} type="button" onClick={() => { setOpenId(r.productId); setEditing(false); }} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-brand-red">
                    <span className="min-w-0">
                      <span className={`block truncate text-sm font-medium ${r.active ? "text-neutral-900" : "text-neutral-400"}`}>{r.name}</span>
                      {r.prepMinutes ? <span className="block text-[11px] text-neutral-400">{r.prepMinutes} min</span> : null}
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.hasRecipe ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{r.hasRecipe ? "Recipe" : canEdit ? "Write it" : "No recipe"}</span>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {openId && <RecipeModal productId={openId} canEdit={canEdit} editing={editing} setEditing={setEditing} onClose={close} onSaved={saved} />}
    </div>
  );
}

function RecipeModal({ productId, canEdit, editing, setEditing, onClose, onSaved }: { productId: string; canEdit: boolean; editing: boolean; setEditing: (v: boolean) => void; onClose: () => void; onSaved: () => void }) {
  const { data: guide, isLoading } = useQuery({ queryKey: ["recipe-guide", productId], queryFn: () => api.get<Guide>(`/recipes/${productId}`) });
  const empty = guide && !guide.ingredients.trim() && !guide.steps.trim() && !guide.notes.trim();
  // Someone who may edit starts straight in the editor for a dish that has no recipe yet.
  const showEditor = editing || (canEdit && !!empty);

  if (isLoading || !guide) {
    return (
      <Modal title="Recipe" onClose={onClose} wide>
        <p className="text-sm text-neutral-400">Loading...</p>
      </Modal>
    );
  }
  return showEditor ? (
    <Editor guide={guide} hasRecipe={!empty} onClose={onClose} onBack={() => setEditing(false)} onSaved={onSaved} />
  ) : (
    <Viewer guide={guide} canEdit={canEdit} onEdit={() => setEditing(true)} onClose={onClose} />
  );
}

function Viewer({ guide, canEdit, onEdit, onClose }: { guide: Guide; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const ingredients = guideLines(guide.ingredients);
  const steps = guideLines(guide.steps);
  return (
    <Modal title={guide.name} onClose={onClose} wide>
      <div className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span>{guide.category}</span>
        {guide.prepMinutes ? <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 font-medium text-neutral-700">{guide.prepMinutes} min</span> : null}
        {guide.servings ? <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 font-medium text-neutral-700">{guide.servings}</span> : null}
      </div>
      {ingredients.length === 0 && steps.length === 0 && !guide.notes.trim() ? (
        <p className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">No recipe has been written for this dish yet.</p>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          {ingredients.length > 0 && (
            <section>
              <p className="text-sm font-semibold text-neutral-900">Ingredients</p>
              <ul className="mt-2 space-y-1.5">
                {ingredients.map((l, i) => (
                  <li key={i} className="flex gap-2 text-sm text-neutral-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-red" />
                    {l}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {steps.length > 0 && (
            <section>
              <p className="text-sm font-semibold text-neutral-900">How to make it</p>
              <ol className="mt-2 space-y-2.5">
                {steps.map((l, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-6 text-neutral-800">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-bold text-white">{i + 1}</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
      {guide.notes.trim() && (
        <p className="mt-5 whitespace-pre-line rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Note: </b>
          {guide.notes}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Close</button>
        {canEdit && (
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-2 rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            <EditIcon size={13} /> Edit recipe
          </button>
        )}
      </div>
    </Modal>
  );
}

function Editor({ guide, hasRecipe, onClose, onBack, onSaved }: { guide: Guide; hasRecipe: boolean; onClose: () => void; onBack: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ prepMinutes: guide.prepMinutes == null ? "" : String(guide.prepMinutes), servings: guide.servings, ingredients: guide.ingredients, steps: guide.steps, notes: guide.notes });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setForm({ prepMinutes: guide.prepMinutes == null ? "" : String(guide.prepMinutes), servings: guide.servings, ingredients: guide.ingredients, steps: guide.steps, notes: guide.notes });
  }, [guide]);
  const stepCount = guideLines(form.steps).length;

  async function save() {
    setSaving(true);
    try {
      await api.put(`/recipes/${guide.productId}`, { prepMinutes: form.prepMinutes.trim() === "" ? null : Math.round(Number(form.prepMinutes)), servings: form.servings.trim(), ingredients: form.ingredients, steps: form.steps, notes: form.notes });
      toast.success("Recipe saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save the recipe");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirmDialog({ title: "Delete this recipe?", message: `The recipe for "${guide.name}" is removed. The dish itself and its stock are not touched.`, confirmLabel: "Delete", tone: "danger" }))) return;
    setSaving(true);
    try {
      await api.delete(`/recipes/${guide.productId}`);
      toast.success("Recipe deleted.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete the recipe");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Recipe: ${guide.name}`} onClose={onClose} wide busy={saving}>
      <p className="-mt-2 text-xs text-neutral-500">Write it the way the kitchen should read it. This is for cooking only and does not change stock.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Time to make (minutes)">
          <input type="number" min={0} max={1440} value={form.prepMinutes} onChange={(e) => setForm((f) => ({ ...f, prepMinutes: e.target.value }))} className={INPUT} placeholder="e.g. 12" />
        </Field>
        <Field label="Makes">
          <input value={form.servings} onChange={(e) => setForm((f) => ({ ...f, servings: e.target.value }))} className={INPUT} maxLength={60} placeholder="e.g. 1 burger" />
        </Field>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Field label="Ingredients" hint="One per line, with the amount, e.g. Chicken 150 g">
          <textarea value={form.ingredients} onChange={(e) => setForm((f) => ({ ...f, ingredients: e.target.value }))} rows={9} maxLength={4000} className={INPUT} placeholder={"Chicken 150 g\nBurger bun 1\nMayo 20 g"} autoFocus />
        </Field>
        <Field label={`Steps${stepCount ? ` (${stepCount})` : ""}`} hint="One step per line. They are numbered for you.">
          <textarea value={form.steps} onChange={(e) => setForm((f) => ({ ...f, steps: e.target.value }))} rows={9} maxLength={8000} className={INPUT} placeholder={"Marinate the chicken for 2 hours\nCoat and fry for 6 minutes\nToast the bun and assemble"} />
        </Field>
      </div>
      <Field label="Notes for the kitchen (optional)">
        <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} maxLength={2000} className={`${INPUT} mt-0`} placeholder="e.g. Serve hot. Do not stack more than 3 burgers." />
      </Field>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {hasRecipe ? (
          <button type="button" onClick={() => void remove()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 hover:bg-red-50 hover:text-red-600">
            <TrashIcon size={13} /> Delete recipe
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={hasRecipe ? onBack : onClose} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Saving..." : "Save recipe"}</button>
        </div>
      </div>
    </Modal>
  );
}
