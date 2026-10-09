"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { toast } from "../../../store/useToastStore";
import { ImageUploadField } from "../../../components/ImageUploadField";
import { StatusToggle } from "../../../components/StatusToggle";
import { EntityPickerModal, type PickableEntity } from "../../../components/EntityPickerModal";
import { SearchInput, FilterBar, FilterSelect, ClearFiltersButton, ResultsSummary } from "../../../components/SearchFilterBar";
import { CloseIcon, EditIcon, TrashIcon } from "../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

type Category = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  basePrice: number;
  discountPrice: number | null;
  images: { url: string; isPrimary: boolean }[];
};
type ChoiceGroup = { id: string; name: string };
type Addon = { id: string; name: string; price: number };
type Deal = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  categoryId: string | null;
  dealPrice: number;
  originalPrice: number | null;
  isFeatured: boolean;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
  slots: {
    id: string;
    label: string;
    quantity: number;
    sortOrder: number;
    productOptions: { product: { id: string; name: string } }[];
    choiceGroups: { choiceGroupId: string }[];
    addons: { addonId: string }[];
  }[];
};

type SlotForm = { label: string; quantity: number; productIds: string[]; choiceGroupIds: string[]; addonIds: string[] };

const EMPTY_SLOT: SlotForm = { label: "", quantity: 1, productIds: [], choiceGroupIds: [], addonIds: [] };
const EMPTY_FORM = {
  name: "",
  description: "",
  image: "",
  categoryId: "",
  dealPrice: 0,
  originalPrice: "",
  isFeatured: false,
  slots: [{ ...EMPTY_SLOT }] as SlotForm[],
};

/** Compact "+ Select" trigger (opens a searchable EntityPickerModal) + removable pills for what's already selected — used for all three per-slot pickers so none of them dump the full catalog inline. */
function SlotPickerField({
  label,
  selectedIds,
  lookup,
  emptyText,
  onOpenPicker,
  onRemove,
}: {
  label: string;
  selectedIds: string[];
  lookup: { id: string; name: string }[] | undefined;
  emptyText: string;
  onOpenPicker: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-neutral-500">{label}</p>
        <button type="button" onClick={onOpenPicker} className="text-xs font-medium text-brand-red">
          + Select
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {selectedIds.map((id) => {
          const entity = lookup?.find((x) => x.id === id);
          if (!entity) return null;
          return (
            <span key={id} className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs">
              {entity.name}
              <button type="button" onClick={() => onRemove(id)} className="text-neutral-400 hover:text-red-600">
                <CloseIcon size={11} />
              </button>
            </span>
          );
        })}
        {selectedIds.length === 0 && <p className="text-xs text-neutral-400">{emptyText}</p>}
      </div>
    </div>
  );
}

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

export default function DealsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "deals.create");
  const canEdit = hasPermission(me, "deals.edit");
  const canDelete = hasPermission(me, "deals.delete");

  const { data: deals } = useQuery({ queryKey: ["admin-deals"], queryFn: () => api.get<Deal[]>("/deals") });
  const { data: categories } = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.get<Category[]>("/catalog/categories") });
  const { data: products } = useQuery({ queryKey: ["admin-products-lite"], queryFn: () => api.get<Product[]>("/catalog/products") });
  const { data: choiceGroups } = useQuery({ queryKey: ["choice-groups"], queryFn: () => api.get<ChoiceGroup[]>("/catalog/choice-groups") });
  const { data: addons } = useQuery({ queryKey: ["addons", ""], queryFn: () => api.get<Addon[]>("/catalog/addons") });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [picker, setPicker] = useState<{ slot: number; field: "productIds" | "choiceGroupIds" | "addonIds" } | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [featuredFilter, setFeaturedFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const isFiltering = [search, statusFilter, featuredFilter, categoryFilter].some((v) => v !== "");

  const filteredDeals = useMemo(() => {
    return (deals ?? []).filter((d) => {
      if (search.trim() && !d.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (statusFilter && d.status !== statusFilter) return false;
      if (featuredFilter === "yes" && !d.isFeatured) return false;
      if (featuredFilter === "no" && d.isFeatured) return false;
      if (categoryFilter && d.categoryId !== categoryFilter) return false;
      return true;
    });
  }, [deals, search, statusFilter, featuredFilter, categoryFilter]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(d: Deal) {
    setEditingId(d.id);
    setForm({
      name: d.name,
      description: d.description ?? "",
      image: d.image ?? "",
      categoryId: d.categoryId ?? "",
      dealPrice: d.dealPrice / 100,
      originalPrice: d.originalPrice != null ? String(d.originalPrice / 100) : "",
      isFeatured: d.isFeatured,
      slots: d.slots.map((s) => ({
        label: s.label,
        quantity: s.quantity,
        productIds: s.productOptions.map((po) => po.product.id),
        choiceGroupIds: s.choiceGroups.map((c) => c.choiceGroupId),
        addonIds: s.addons.map((a) => a.addonId),
      })),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function updateSlot(i: number, update: Partial<SlotForm>) {
    setForm((f) => ({ ...f, slots: f.slots.map((slot, j) => (i === j ? { ...slot, ...update } : slot)) }));
  }
  function toggleInSlot(i: number, field: "productIds" | "choiceGroupIds" | "addonIds", id: string) {
    setForm((f) => ({
      ...f,
      slots: f.slots.map((slot, j) => {
        if (j !== i) return slot;
        const current = slot[field];
        return { ...slot, [field]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] };
      }),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const emptySlot = form.slots.findIndex((sl) => sl.productIds.length === 0);
    if (emptySlot >= 0) {
      toast.error(`Slot ${emptySlot + 1} needs at least one allowed product`);
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        image: form.image || undefined,
        categoryId: form.categoryId || undefined,
        dealPrice: Math.round(form.dealPrice * 100),
        originalPrice: form.originalPrice.trim() ? Math.round(Number(form.originalPrice) * 100) : null,
        isFeatured: form.isFeatured,
        slots: form.slots.map((s, i) => ({
          label: s.label,
          quantity: s.quantity,
          sortOrder: i,
          productIds: s.productIds,
          choiceGroupIds: s.choiceGroupIds,
          addonIds: s.addonIds,
        })),
      };
      if (editingId) {
        await api.patch(`/deals/${editingId}`, body);
      } else {
        await api.post("/deals", body);
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
      toast.success(editingId ? "Deal updated." : "Deal created.");
      closeForm();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save deal");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/deals/${deleteTarget.id}`);
      await queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStatus(d: Deal) {
    await api.patch(`/deals/${d.id}`, { status: d.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    await queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
  }

  async function duplicate(d: Deal) {
    await api.post(`/deals/${d.id}/duplicate`, {});
    await queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
  }

  const productPickerItems: PickableEntity[] = (products ?? []).map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: p.discountPrice != null ? `${formatPaisa(p.discountPrice)} (was ${formatPaisa(p.basePrice)})` : formatPaisa(p.basePrice),
    image: p.images.find((i) => i.isPrimary)?.url ?? p.images[0]?.url ?? null,
  }));
  const choiceGroupPickerItems: PickableEntity[] = (choiceGroups ?? []).map((g) => ({ id: g.id, label: g.name }));
  const addonPickerItems: PickableEntity[] = (addons ?? []).map((a) => ({ id: a.id, label: a.name, sublabel: formatPaisa(a.price) }));

  const pickerTitles: Record<"productIds" | "choiceGroupIds" | "addonIds", string> = {
    productIds: "Select Allowed Products",
    choiceGroupIds: "Select Choice Sections",
    addonIds: "Select Add-ons for this slot",
  };
  const pickerItemsByField: Record<"productIds" | "choiceGroupIds" | "addonIds", PickableEntity[]> = {
    productIds: productPickerItems,
    choiceGroupIds: choiceGroupPickerItems,
    addonIds: addonPickerItems,
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Deals</h1>
        {canCreate && (
          <button onClick={startCreate} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
            + New Deal
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search deals..." />
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
            value={featuredFilter}
            onChange={setFeaturedFilter}
            placeholder="Featured"
            options={[
              { value: "yes", label: "Featured only" },
              { value: "no", label: "Not featured" },
            ]}
          />
          <FilterSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder="All categories"
            options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          {isFiltering && (
            <ClearFiltersButton
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setFeaturedFilter("");
                setCategoryFilter("");
              }}
            />
          )}
        </FilterBar>
        <ResultsSummary count={filteredDeals.length} total={deals?.length ?? 0} itemLabel="deal" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Total deals", deals?.length ?? 0],
          ["Active", (deals ?? []).filter((d) => d.status === "ACTIVE").length],
          ["Featured", (deals ?? []).filter((d) => d.isFeatured).length],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-xl font-semibold text-neutral-900">{n}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredDeals.map((d) => {
          const saving = d.originalPrice != null && d.originalPrice > d.dealPrice ? d.originalPrice - d.dealPrice : 0;
          const catName = categories?.find((c) => c.id === d.categoryId)?.name;
          return (
            <div key={d.id} className={`flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md ${d.status === "INACTIVE" ? "opacity-70" : ""}`}>
              <div className="relative h-48 bg-neutral-50">
                {d.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.image} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-400">No image</div>
                )}
                <div className="absolute left-2 top-2 flex gap-1.5">
                  {d.isFeatured && <span className="rounded-full bg-brand-red px-2 py-0.5 text-[10px] font-semibold text-white">Featured</span>}
                  {saving > 0 && <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white">Save {formatPaisa(saving)}</span>}
                </div>
                <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${d.status === "ACTIVE" ? "bg-white text-green-700" : "bg-neutral-800 text-white"}`}>
                  {d.status === "ACTIVE" ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{d.name}</p>
                    {catName && <p className="text-xs text-neutral-400">{catName}</p>}
                  </div>
                  <p className="shrink-0 text-right">
                    {d.originalPrice != null && <span className="block text-xs text-neutral-400 line-through">{formatPaisa(d.originalPrice)}</span>}
                    <span className="text-base font-bold text-brand-red">{formatPaisa(d.dealPrice)}</span>
                  </p>
                </div>
                {d.description && <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{d.description}</p>}

                <ul className="mb-4 mt-3 space-y-1.5">
                  {d.slots.map((s) => {
                    const names = s.productOptions.map((po) => po.product.name);
                    return (
                      <li key={s.id} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-semibold text-neutral-600">{s.quantity}×</span>
                        <span className="min-w-0 text-neutral-600">
                          <span className="font-medium text-neutral-800">{s.label}</span>
                          {names.length > 0 && <span className="text-neutral-400"> · {names.slice(0, 3).join(", ")}{names.length > 3 ? ` +${names.length - 3} more` : ""}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-neutral-100 pt-3 text-xs">
                  <StatusToggle active={d.status === "ACTIVE"} onClick={() => toggleStatus(d)} disabled={!canEdit} />
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <button onClick={() => startEdit(d)} aria-label="Edit deal" className="flex items-center gap-1 text-neutral-500 hover:text-brand-red">
                        <EditIcon size={14} /> Edit
                      </button>
                    )}
                    {canCreate && (
                      <button onClick={() => duplicate(d)} className="text-neutral-500 hover:text-brand-red">
                        Duplicate
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setDeleteTarget(d)} aria-label="Delete deal" className="flex items-center gap-1 text-neutral-500 hover:text-red-600">
                        <TrashIcon size={14} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {deals?.length === 0 && <p className="col-span-full rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No deals yet.</p>}
        {(deals?.length ?? 0) > 0 && filteredDeals.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No deals match your search/filters.</p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">{editingId ? "Edit Deal" : "New Deal"}</p>
              <button type="button" onClick={closeForm} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={1} title="Deal details" hint="Name, category and description shown to customers." />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Deal name *</p>
                    <input placeholder="e.g. 2 Pizza + 2 Drinks" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" required />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Category</p>
                    <Select value={form.categoryId || "none"} onValueChange={(v) => setForm({ ...form, categoryId: v === "none" ? "" : v })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Description</p>
                  <textarea placeholder="What's included, who it's for..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" rows={2} />
                </div>
                <ImageUploadField label="Deal Image" folder="deals" value={form.image} onChange={(url) => setForm({ ...form, image: url })} compact />
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={2} title="Pricing" hint="Add a regular price to show the saving." />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Deal Price (Rs.) *</p>
                    <input type="number" min={0} value={form.dealPrice} onChange={(e) => setForm({ ...form, dealPrice: Number(e.target.value) })} className="input w-full" required />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Regular Price (optional)</p>
                    <input type="number" min={0} value={form.originalPrice} onChange={(e) => setForm({ ...form, originalPrice: e.target.value })} className="input w-full" />
                    {form.originalPrice.trim() && Number(form.originalPrice) > form.dealPrice && form.dealPrice > 0 && (
                      <p className="mt-1 text-xs text-green-600">
                        Customers save Rs. {Number(form.originalPrice) - form.dealPrice} ({Math.round((1 - form.dealPrice / Number(form.originalPrice)) * 100)}% off)
                      </p>
                    )}
                  </div>
                </div>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${form.isFeatured ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}>
                  <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#ED2320]" />
                  <span>
                    <span className="block text-sm font-medium text-neutral-900">Featured deal</span>
                    <span className="block text-xs text-neutral-500">Highlight this deal on the storefront.</span>
                  </span>
                </label>
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={3} title="What's in the deal" hint="Each slot is one item the customer picks, e.g. 'Pizza' x2 from a list of allowed products." />
                <div className="space-y-3">
                  {form.slots.map((slot, i) => (
                    <div key={i} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">Slot {i + 1}</span>
                        <input
                          placeholder={`Slot label (e.g. Pizza ${i + 1})`}
                          value={slot.label}
                          onChange={(e) => updateSlot(i, { label: e.target.value })}
                          className="input min-w-0 flex-1 bg-white"
                          required
                        />
                        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                          Qty
                          <input
                            type="number"
                            min={1}
                            value={slot.quantity}
                            onChange={(e) => updateSlot(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                            className="input w-16 bg-white"
                          />
                        </label>
                        {form.slots.length > 1 && (
                          <button type="button" onClick={() => setForm((f) => ({ ...f, slots: f.slots.filter((_, j) => j !== i) }))} aria-label="Remove slot" className="text-neutral-400 hover:text-red-600">
                            <TrashIcon size={15} />
                          </button>
                        )}
                      </div>

                      <SlotPickerField
                        label="Allowed products *"
                        selectedIds={slot.productIds}
                        lookup={products}
                        emptyText="No products selected - pick at least one."
                        onOpenPicker={() => setPicker({ slot: i, field: "productIds" })}
                        onRemove={(id) => toggleInSlot(i, "productIds", id)}
                      />

                      <SlotPickerField
                        label="Choice sections for this slot"
                        selectedIds={slot.choiceGroupIds}
                        lookup={choiceGroups}
                        emptyText="None"
                        onOpenPicker={() => setPicker({ slot: i, field: "choiceGroupIds" })}
                        onRemove={(id) => toggleInSlot(i, "choiceGroupIds", id)}
                      />

                      <SlotPickerField
                        label="Add-ons for this slot"
                        selectedIds={slot.addonIds}
                        lookup={addons}
                        emptyText="None"
                        onOpenPicker={() => setPicker({ slot: i, field: "addonIds" })}
                        onRemove={(id) => toggleInSlot(i, "addonIds", id)}
                      />
                    </div>
                  ))}
                </div>

                <button type="button" onClick={() => setForm((f) => ({ ...f, slots: [...f.slots, { ...EMPTY_SLOT }] }))} className="w-full rounded-lg border border-dashed border-brand-red py-2 text-sm font-medium text-brand-red hover:bg-red-50">
                  + Add another slot
                </button>
              </section>

              <div className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 flex items-center gap-3 border-t border-neutral-200 bg-white px-5 py-3">
                <button type="submit" className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Deal"}
                </button>
                <button type="button" onClick={closeForm} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {picker && (
        <EntityPickerModal
          title={pickerTitles[picker.field]}
          items={pickerItemsByField[picker.field]}
          selectedIds={form.slots[picker.slot]?.[picker.field] ?? []}
          onToggle={(id) => toggleInSlot(picker.slot, picker.field, id)}
          onClose={() => setPicker(null)}
          variant={picker.field === "productIds" ? "table" : "list"}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">Delete Deal</p>
              <button type="button" onClick={() => setDeleteTarget(null)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-600">
                Delete <span className="font-medium text-neutral-900">{deleteTarget.name}</span>? This cannot be undone.
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
