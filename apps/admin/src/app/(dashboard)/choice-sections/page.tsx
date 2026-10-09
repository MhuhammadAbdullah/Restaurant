"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { toast } from "../../../store/useToastStore";
import { ImageUploadField } from "../../../components/ImageUploadField";
import { StatusToggle } from "../../../components/StatusToggle";
import { ReorderableList } from "../../../components/ReorderableList";
import { SearchInput, FilterBar, FilterSelect, ClearFiltersButton, ResultsSummary } from "../../../components/SearchFilterBar";
import { CloseIcon, EditIcon, TrashIcon } from "../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

type ChoiceOption = {
  id: string;
  name: string;
  image: string | null;
  priceAdjustment: number;
  discountPriceAdjustment: number | null;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
};

type ChoiceGroup = {
  id: string;
  name: string;
  description: string | null;
  isRequired: boolean;
  selectionType: "SINGLE" | "MULTIPLE";
  minSelect: number;
  maxSelect: number;
  status: "ACTIVE" | "INACTIVE";
  sortOrder: number;
  options: ChoiceOption[];
};

type OptionForm = {
  id?: string;
  name: string;
  image: string;
  priceAdjustment: number;
  discountPriceAdjustment: string;
  status: "ACTIVE" | "INACTIVE";
};

const EMPTY_OPTION: OptionForm = { name: "", image: "", priceAdjustment: 0, discountPriceAdjustment: "", status: "ACTIVE" };

const EMPTY_FORM = {
  name: "",
  description: "",
  isRequired: true,
  selectionType: "SINGLE" as "SINGLE" | "MULTIPLE",
  minSelect: 1,
  maxSelect: 1,
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
  options: [{ ...EMPTY_OPTION }],
};

function SectionTitle({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white">{n}</span>
      <div>
        <p className="text-sm font-semibold text-neutral-900">{title}</p>
        <p className="text-xs text-neutral-500">{hint}</p>
      </div>
    </div>
  );
}

export default function ChoiceSectionsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "choiceGroups.create");
  const canEdit = hasPermission(me, "choiceGroups.edit");
  const canDelete = hasPermission(me, "choiceGroups.delete");

  const { data: groups } = useQuery({ queryKey: ["choice-groups"], queryFn: () => api.get<ChoiceGroup[]>("/catalog/choice-groups") });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [requiredFilter, setRequiredFilter] = useState("");
  const isFiltering = [search, statusFilter, typeFilter, requiredFilter].some((v) => v !== "");

  const filteredGroups = useMemo(() => {
    return (groups ?? []).filter((g) => {
      if (search.trim() && !g.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (statusFilter && g.status !== statusFilter) return false;
      if (typeFilter && g.selectionType !== typeFilter) return false;
      if (requiredFilter === "yes" && !g.isRequired) return false;
      if (requiredFilter === "no" && g.isRequired) return false;
      return true;
    });
  }, [groups, search, statusFilter, typeFilter, requiredFilter]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChoiceGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(g: ChoiceGroup) {
    setEditingId(g.id);
    setForm({
      name: g.name,
      description: g.description ?? "",
      isRequired: g.isRequired,
      selectionType: g.selectionType,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      status: g.status,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        image: o.image ?? "",
        priceAdjustment: o.priceAdjustment / 100,
        discountPriceAdjustment: o.discountPriceAdjustment != null ? String(o.discountPriceAdjustment / 100) : "",
        status: o.status,
      })),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function updateOption(index: number, patch: Partial<OptionForm>) {
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) }));
  }
  function addOption() {
    setForm((f) => ({ ...f, options: [...f.options, { ...EMPTY_OPTION }] }));
  }
  function removeOption(index: number) {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== index) }));
  }

  function moveOption(index: number, dir: -1 | 1) {
    setForm((f) => {
      const next = [...f.options];
      const j = index + dir;
      if (j < 0 || j >= next.length) return f;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return { ...f, options: next };
    });
  }
  function setSelectionType(t: "SINGLE" | "MULTIPLE") {
    setForm((f) => (t === "SINGLE" ? { ...f, selectionType: t, minSelect: f.isRequired ? 1 : 0, maxSelect: 1 } : { ...f, selectionType: t, maxSelect: Math.max(f.maxSelect, 2) }));
  }
  function setRequired(req: boolean) {
    setForm((f) => ({ ...f, isRequired: req, minSelect: req ? Math.max(1, f.minSelect) : f.selectionType === "SINGLE" ? 0 : f.minSelect }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const named = form.options.filter((o) => o.name.trim());
    if (named.length === 0) {
      toast.error("Add at least one option with a name");
      return;
    }
    if (form.selectionType === "MULTIPLE") {
      if (form.minSelect > form.maxSelect) {
        toast.error("Minimum selection can't be more than maximum");
        return;
      }
      if (form.maxSelect > named.length) {
        toast.error(`Maximum selection (${form.maxSelect}) is more than the number of options (${named.length})`);
        return;
      }
    }
    setSaving(true);
    try {
      const options = form.options
        .filter((o) => o.name.trim())
        .map((o, i) => ({
          id: o.id,
          name: o.name,
          image: o.image || undefined,
          priceAdjustment: Math.round(o.priceAdjustment * 100),
          discountPriceAdjustment: o.discountPriceAdjustment.trim() ? Math.round(Number(o.discountPriceAdjustment) * 100) : null,
          sortOrder: i,
        }));
      const body = {
        name: form.name,
        description: form.description || undefined,
        isRequired: form.isRequired,
        selectionType: form.selectionType,
        minSelect: form.minSelect,
        maxSelect: form.maxSelect,
        status: form.status,
        options,
      };
      if (editingId) {
        await api.patch(`/catalog/choice-groups/${editingId}`, body);
      } else {
        await api.post("/catalog/choice-groups", body);
      }
      await queryClient.invalidateQueries({ queryKey: ["choice-groups"] });
      toast.success(editingId ? "Choice section updated." : "Choice section created.");
      closeForm();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save choice section");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/catalog/choice-groups/${deleteTarget.id}`);
      await queryClient.invalidateQueries({ queryKey: ["choice-groups"] });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStatus(g: ChoiceGroup) {
    await api.patch(`/catalog/choice-groups/${g.id}`, { status: g.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    await queryClient.invalidateQueries({ queryKey: ["choice-groups"] });
  }

  async function reorder(orderedIds: string[]) {
    await api.patch("/catalog/choice-groups/reorder", { orderedIds });
    await queryClient.invalidateQueries({ queryKey: ["choice-groups"] });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Choice Sections</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Reusable option sets (e.g. &quot;Burger Choices&quot;, &quot;Soft Drink&quot;) attached to products and deals.
          </p>
        </div>
        {canCreate && (
          <button onClick={startCreate} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
            + New Section
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search choice sections..." />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="All statuses"
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ]}
          />
          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="Selection type"
            options={[
              { value: "SINGLE", label: "Single" },
              { value: "MULTIPLE", label: "Multiple" },
            ]}
          />
          <FilterSelect
            value={requiredFilter}
            onChange={setRequiredFilter}
            placeholder="Required"
            options={[
              { value: "yes", label: "Required only" },
              { value: "no", label: "Optional only" },
            ]}
          />
          {isFiltering && (
            <ClearFiltersButton
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setTypeFilter("");
                setRequiredFilter("");
              }}
            />
          )}
        </FilterBar>
        <ResultsSummary count={filteredGroups.length} total={groups?.length ?? 0} itemLabel="section" />
      </div>

      {isFiltering && <p className="mt-2 text-xs text-amber-600">Clear search/filters to drag-reorder sections.</p>}

      <div className="mt-3">
        <ReorderableList
          items={filteredGroups}
          onReorder={reorder}
          disabled={!canEdit || isFiltering}
          renderItem={(g) => {
            const active = g.options.filter((o) => o.status === "ACTIVE");
            return (
              <div className={`rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${g.status === "INACTIVE" ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-neutral-900">{g.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                        {g.status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.isRequired ? "bg-red-50 text-brand-red" : "bg-neutral-100 text-neutral-500"}`}>
                        {g.isRequired ? "Required" : "Optional"}
                      </span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {g.selectionType === "SINGLE" ? "Pick one" : `Pick ${g.minSelect === g.maxSelect ? g.maxSelect : `${g.minSelect}-${g.maxSelect}`}`}
                      </span>
                    </div>
                    {g.description && <p className="mt-0.5 text-xs text-neutral-500">{g.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusToggle active={g.status === "ACTIVE"} onClick={() => toggleStatus(g)} disabled={!canEdit} />
                    {canEdit && (
                      <button onClick={() => startEdit(g)} aria-label="Edit section" className="text-neutral-500 hover:text-brand-red">
                        <EditIcon size={17} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setDeleteTarget(g)} aria-label="Delete section" className="text-neutral-500 hover:text-red-600">
                        <TrashIcon size={17} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {g.options.map((o) => (
                    <span key={o.id} className={`flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-1 pr-3 text-xs ${o.status === "INACTIVE" ? "opacity-50 line-through" : ""}`}>
                      {o.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.image} alt="" draggable={false} className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-500">{o.name.charAt(0).toUpperCase()}</span>
                      )}
                      <span className="font-medium text-neutral-800">{o.name}</span>
                      {o.priceAdjustment > 0 && <span className="text-neutral-400">+{formatPaisa(o.discountPriceAdjustment ?? o.priceAdjustment)}</span>}
                    </span>
                  ))}
                  {g.options.length === 0 && <span className="text-xs text-amber-600">No options yet</span>}
                </div>
                <p className="mt-2 text-xs text-neutral-400">
                  {active.length} of {g.options.length} option{g.options.length === 1 ? "" : "s"} available
                  {g.options.length > 0 && active.length === 0 && <span className="ml-2 text-amber-600">· no active options, won&apos;t be usable</span>}
                </p>
              </div>
            );
          }}
        />
        {groups?.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No choice sections yet.</p>}
        {(groups?.length ?? 0) > 0 && filteredGroups.length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No sections match your search/filters.</p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">{editingId ? "Edit Choice Section" : "New Choice Section"}</p>
              <button type="button" onClick={closeForm} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={1} title="Section details" hint="A reusable set of options, e.g. 'Burger Choices' or 'Soft Drink'." />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Section name *</p>
                    <input placeholder="e.g. Choose your drink" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" required />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Status</p>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "ACTIVE" | "INACTIVE" })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Description</p>
                  <input placeholder="Optional hint shown to customers" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" />
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={2} title="Selection rules" hint="How many options the customer can pick." />
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["SINGLE", "Pick one", "Customer chooses exactly one option (radio)."],
                      ["MULTIPLE", "Pick many", "Customer can choose several options (checkboxes)."],
                    ] as ["SINGLE" | "MULTIPLE", string, string][]
                  ).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelectionType(value)}
                      className={`rounded-lg border p-3 text-left ${form.selectionType === value ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}
                    >
                      <span className="block text-sm font-medium text-neutral-900">{label}</span>
                      <span className="block text-xs text-neutral-500">{hint}</span>
                    </button>
                  ))}
                </div>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${form.isRequired ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}>
                  <input type="checkbox" checked={form.isRequired} onChange={(e) => setRequired(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#ED2320]" />
                  <span>
                    <span className="block text-sm font-medium text-neutral-900">Required</span>
                    <span className="block text-xs text-neutral-500">Customer must choose before adding to cart.</span>
                  </span>
                </label>
                {form.selectionType === "MULTIPLE" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 text-xs font-medium text-neutral-500">Minimum selection</p>
                      <input type="number" min={form.isRequired ? 1 : 0} value={form.minSelect} onChange={(e) => setForm({ ...form, minSelect: Number(e.target.value) })} className="input w-full" />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-neutral-500">Maximum selection</p>
                      <input type="number" min={1} value={form.maxSelect} onChange={(e) => setForm({ ...form, maxSelect: Number(e.target.value) })} className="input w-full" />
                    </div>
                  </div>
                )}
                <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                  {form.selectionType === "SINGLE"
                    ? form.isRequired
                      ? "Customer must pick 1 option."
                      : "Customer may pick 1 option or skip."
                    : `Customer picks ${form.minSelect === form.maxSelect ? form.maxSelect : `${form.minSelect} to ${form.maxSelect}`} option${form.maxSelect === 1 ? "" : "s"}${form.minSelect === 0 ? " (can skip)" : ""}.`}
                </p>
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={3} title="Options" hint="Extra price is added to the product price when this option is picked." />
                <div className="space-y-3">
                  {form.options.map((o, i) => (
                    <div key={i} className={`rounded-lg border bg-neutral-50 p-3 ${o.status === "INACTIVE" ? "border-neutral-200 opacity-70" : "border-neutral-200"}`}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">Option {i + 1}</span>
                        <div className="flex items-center gap-1 text-neutral-400">
                          <button type="button" disabled={i === 0} onClick={() => moveOption(i, -1)} aria-label="Move up" className="rounded px-1.5 py-0.5 hover:bg-neutral-200 disabled:opacity-30">▲</button>
                          <button type="button" disabled={i === form.options.length - 1} onClick={() => moveOption(i, 1)} aria-label="Move down" className="rounded px-1.5 py-0.5 hover:bg-neutral-200 disabled:opacity-30">▼</button>
                          <button type="button" onClick={() => removeOption(i)} aria-label="Remove option" className="ml-1 hover:text-red-600">
                            <TrashIcon size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-32 shrink-0">
                          <ImageUploadField label="Image" folder="choices" compact value={o.image} onChange={(url) => updateOption(i, { image: url })} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <input placeholder="Option name *" value={o.name} onChange={(e) => updateOption(i, { name: e.target.value })} className="input w-full bg-white" />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="mb-0.5 text-[11px] text-neutral-500">Extra price (Rs.)</p>
                              <input type="number" min={0} value={o.priceAdjustment} onChange={(e) => updateOption(i, { priceAdjustment: Number(e.target.value) })} className="input w-full bg-white" />
                            </div>
                            <div>
                              <p className="mb-0.5 text-[11px] text-neutral-500">Discounted extra (optional)</p>
                              <input type="number" min={0} value={o.discountPriceAdjustment} onChange={(e) => updateOption(i, { discountPriceAdjustment: e.target.value })} className="input w-full bg-white" />
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-neutral-600">
                            <StatusToggle active={o.status === "ACTIVE"} onClick={() => updateOption(i, { status: o.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })} />
                            {o.status === "ACTIVE" ? "Available" : "Hidden from customers"}
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addOption} className="w-full rounded-lg border border-dashed border-brand-red py-2 text-sm font-medium text-brand-red hover:bg-red-50">
                  + Add option
                </button>
              </section>

              <div className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 flex items-center gap-3 border-t border-neutral-200 bg-white px-5 py-3">
                <button type="submit" className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Section"}
                </button>
                <button type="button" onClick={closeForm} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">Delete Choice Section</p>
              <button type="button" onClick={() => setDeleteTarget(null)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-600">
                Delete <span className="font-medium text-neutral-900">{deleteTarget.name}</span>? Products and deals using it will lose this section. This cannot be undone.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button type="button" onClick={confirmDelete} disabled={deleting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                  {deleting ? "Deleting..." : "Delete"}
                </button>
                <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .input {
          border-radius: 0.5rem;
          border: 1px solid #d4d4d4;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
