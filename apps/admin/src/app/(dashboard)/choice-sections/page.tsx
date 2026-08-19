"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
          renderItem={(g) => (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900">{g.name}</p>
                {g.description && <p className="text-xs text-neutral-500">{g.description}</p>}
                <p className="mt-0.5 text-xs text-neutral-400">
                  {g.isRequired ? "Required" : "Optional"} · {g.selectionType === "SINGLE" ? "Single" : "Multiple"} selection · {g.options.length} option
                  {g.options.length === 1 ? "" : "s"}
                  {g.options.length > 0 && g.options.every((o) => o.status === "INACTIVE") && (
                    <span className="ml-2 text-amber-600">· no active options, won&apos;t be usable</span>
                  )}
                </p>
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
          )}
        />
        {groups?.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No choice sections yet.</p>}
        {(groups?.length ?? 0) > 0 && filteredGroups.length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No sections match your search/filters.</p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">{editingId ? "Edit Choice Section" : "New Choice Section"}</p>
              <button type="button" onClick={closeForm} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Section Name</p>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" required />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Description (optional)</p>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} /> Required
                </label>
                <Select value={form.selectionType} onValueChange={(v) => setForm({ ...form, selectionType: v as "SINGLE" | "MULTIPLE" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE">Single selection</SelectItem>
                    <SelectItem value="MULTIPLE">Multiple selection</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "ACTIVE" | "INACTIVE" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Minimum Selection</p>
                  <input type="number" min={0} value={form.minSelect} onChange={(e) => setForm({ ...form, minSelect: Number(e.target.value) })} className="input w-full" />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Maximum Selection</p>
                  <input type="number" min={1} value={form.maxSelect} onChange={(e) => setForm({ ...form, maxSelect: Number(e.target.value) })} className="input w-full" />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-neutral-500">Options</p>
                <div className="space-y-3">
                  {form.options.map((o, i) => (
                    <div key={i} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                      <div className="flex gap-3">
                        <div className="w-24 shrink-0">
                          <ImageUploadField label="Image" folder="choices" value={o.image} onChange={(url) => updateOption(i, { image: url })} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <input placeholder="Option name" value={o.name} onChange={(e) => updateOption(i, { name: e.target.value })} className="input w-full bg-white" />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              placeholder="Additional price (Rs.)"
                              value={o.priceAdjustment}
                              onChange={(e) => updateOption(i, { priceAdjustment: Number(e.target.value) })}
                              className="input w-full bg-white"
                            />
                            <input
                              type="number"
                              placeholder="Discount price (optional)"
                              value={o.discountPriceAdjustment}
                              onChange={(e) => updateOption(i, { discountPriceAdjustment: e.target.value })}
                              className="input w-full bg-white"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Select value={o.status} onValueChange={(v) => updateOption(i, { status: v as "ACTIVE" | "INACTIVE" })}>
                              <SelectTrigger className="h-auto bg-white py-1.5 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ACTIVE">Active</SelectItem>
                                <SelectItem value="INACTIVE">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                            <button type="button" onClick={() => removeOption(i)} className="text-xs text-red-600 hover:underline">
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addOption} className="mt-2 text-sm font-medium text-brand-red hover:opacity-80">
                  + Add Option
                </button>
              </div>

              <div className="flex items-center gap-3 pt-1">
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
