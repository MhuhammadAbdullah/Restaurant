"use client";

import { useEffect, useMemo, useState } from "react";
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

type Category = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  banner: string | null;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
  mainPageLimit: number | null;
};
type CategoryProduct = { id: string; name: string; showOnMainPage: boolean; mainPageSortOrder: number };

const EMPTY_FORM = {
  name: "",
  description: "",
  image: "",
  banner: "",
  mainPageLimit: "",
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
};

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "categories.create");
  const canEdit = hasPermission(me, "categories.edit");
  const canDelete = hasPermission(me, "categories.delete");

  const { data: categories } = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.get<Category[]>("/catalog/categories") });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mainPageFilter, setMainPageFilter] = useState("");
  const isFiltering = search.trim() !== "" || statusFilter !== "" || mainPageFilter !== "";

  const filteredCategories = useMemo(() => {
    return (categories ?? []).filter((c) => {
      if (search.trim() && !c.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (mainPageFilter === "yes" && c.mainPageLimit == null) return false;
      if (mainPageFilter === "no" && c.mainPageLimit != null) return false;
      return true;
    });
  }, [categories, search, statusFilter, mainPageFilter]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mainPageTarget, setMainPageTarget] = useState<Category | null>(null);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description ?? "",
      image: c.image ?? "",
      banner: c.banner ?? "",
      mainPageLimit: c.mainPageLimit != null ? String(c.mainPageLimit) : "",
      status: c.status,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        image: form.image || undefined,
        banner: form.banner || undefined,
        mainPageLimit: form.mainPageLimit.trim() ? Number(form.mainPageLimit) : null,
        status: form.status,
        ...(editingId ? {} : { sortOrder: categories?.length ?? 0 }),
      };
      if (editingId) {
        await api.patch(`/catalog/categories/${editingId}`, body);
      } else {
        await api.post("/catalog/categories", body);
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast.success(editingId ? "Category updated." : "Category created.");
      closeForm();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save category");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/catalog/categories/${deleteTarget.id}`);
      await queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStatus(c: Category) {
    await api.patch(`/catalog/categories/${c.id}`, { status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    await queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
  }

  async function reorder(orderedIds: string[]) {
    await api.patch("/catalog/categories/reorder", { orderedIds });
    await queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Categories</h1>
          <p className="mt-1 text-sm text-neutral-500">Drag to reorder how categories appear on the website.</p>
        </div>
        {canCreate && (
          <button onClick={startCreate} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
            + New Category
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Total", categories?.length ?? 0],
          ["Active", (categories ?? []).filter((c) => c.status === "ACTIVE").length],
          ["Inactive", (categories ?? []).filter((c) => c.status === "INACTIVE").length],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-xl font-semibold text-neutral-900">{n}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search categories..." />
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
            value={mainPageFilter}
            onChange={setMainPageFilter}
            placeholder="Main page limit"
            options={[
              { value: "yes", label: "Has limit" },
              { value: "no", label: "No limit" },
            ]}
          />
          {isFiltering && (
            <ClearFiltersButton
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setMainPageFilter("");
              }}
            />
          )}
        </FilterBar>
        <ResultsSummary count={filteredCategories.length} total={categories?.length ?? 0} itemLabel="category" />
      </div>

      {isFiltering && (
        <p className="mt-2 text-xs text-amber-600">Clear search/filters to drag-reorder categories.</p>
      )}

      <div className="mt-3">
        <ReorderableList
          items={filteredCategories}
          onReorder={reorder}
          disabled={!canEdit || isFiltering}
          renderItem={(c) => (
            <div className={`flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${c.status === "INACTIVE" ? "border-neutral-200 opacity-70" : "border-neutral-200"}`}>
              <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500 sm:flex">
                {(categories ?? []).findIndex((x) => x.id === c.id) + 1}
              </span>
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image} alt="" draggable={false} className="h-14 w-14 shrink-0 rounded-lg border border-neutral-200 object-cover" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-[10px] text-neutral-400">No image</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-neutral-900">{c.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                    {c.status === "ACTIVE" ? "Active" : "Inactive"}
                  </span>
                  {c.banner && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">Banner</span>}
                </div>
                {c.description && <p className="mt-0.5 truncate text-xs text-neutral-500">{c.description}</p>}
                <p className="mt-0.5 text-xs text-neutral-400">
                  {c.mainPageLimit != null ? `Main page limit: ${c.mainPageLimit}` : "No main page limit"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button onClick={() => setMainPageTarget(c)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-brand-red hover:bg-red-100">
                  Main page products
                </button>
                <StatusToggle active={c.status === "ACTIVE"} onClick={() => toggleStatus(c)} disabled={!canEdit} />
                {canEdit && (
                  <button onClick={() => startEdit(c)} aria-label="Edit category" className="text-neutral-500 hover:text-brand-red">
                    <EditIcon size={17} />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => setDeleteTarget(c)} aria-label="Delete category" className="text-neutral-500 hover:text-red-600">
                    <TrashIcon size={17} />
                  </button>
                )}
              </div>
            </div>
          )}
        />
        {categories?.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No categories yet.</p>}
        {(categories?.length ?? 0) > 0 && filteredCategories.length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No categories match your search/filters.</p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">{editingId ? "Edit Category" : "New Category"}</p>
              <button type="button" onClick={closeForm} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Category name *</p>
                <input placeholder="e.g. Burgers" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" required />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Description</p>
                <input placeholder="Optional short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" />
              </div>

              <ImageUploadField label="Category Image (square, 1:1)" folder="categories" shape="square" hint="Square 1:1 · e.g. 600×600" value={form.image} onChange={(url) => setForm({ ...form, image: url })} />
              <ImageUploadField label="Banner Image (landscape)" folder="categories" shape="landscape" hint="Landscape · e.g. 1680×600" value={form.banner} onChange={(url) => setForm({ ...form, banner: url })} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Main Page Product Limit</p>
                  <input
                    type="number"
                    min={0}
                    placeholder="No limit"
                    value={form.mainPageLimit}
                    onChange={(e) => setForm({ ...form, mainPageLimit: e.target.value })}
                    className="input w-full"
                  />
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

              <div className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 flex items-center gap-3 border-t border-neutral-200 bg-white px-5 py-3">
                <button type="submit" className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Category"}
                </button>
                <button type="button" onClick={closeForm} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mainPageTarget && <MainPageProductsPanel category={mainPageTarget} canEdit={canEdit} onClose={() => setMainPageTarget(null)} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">Delete Category</p>
              <button type="button" onClick={() => setDeleteTarget(null)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-600">
                Delete <span className="font-medium text-neutral-900">{deleteTarget.name}</span>? Products in this category won&apos;t be deleted, but you&apos;ll need to move them to another category first if this delete fails. This cannot be undone.
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

function MainPageProductsPanel({ category, canEdit, onClose }: { category: Category; canEdit: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: products } = useQuery({
    queryKey: ["category-products", category.id],
    queryFn: () => api.get<CategoryProduct[]>(`/catalog/categories/${category.id}/products`),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!products) return;
    setSelected(
      products
        .filter((p) => p.showOnMainPage)
        .sort((a, b) => a.mainPageSortOrder - b.mainPageSortOrder)
        .map((p) => p.id),
    );
  }, [products]);

  function toggle(id: string) {
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/catalog/categories/${category.id}/main-page-products`, { productIds: selected });
      await queryClient.invalidateQueries({ queryKey: ["category-products", category.id] });
      toast.success("Main page products saved.");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save main page products");
    } finally {
      setSaving(false);
    }
  }

  const selectedProducts = selected.map((id) => products?.find((p) => p.id === id)).filter((p): p is CategoryProduct => !!p);
  const unselectedProducts = (products ?? []).filter((p) => !selected.includes(p.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">{category.name}: Main Page Products</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {category.mainPageLimit != null && (
            <p className="mb-3 text-xs text-neutral-400">
              Limit is {category.mainPageLimit}, so the website will only show the first {category.mainPageLimit} in this order.
            </p>
          )}

          {selectedProducts.length > 0 && (
            <>
              <p className="mb-2 text-xs font-medium text-neutral-500">On Main Page (drag to reorder)</p>
              <ReorderableList
                items={selectedProducts}
                onReorder={setSelected}
                disabled={!canEdit}
                renderItem={(p) => (
                  <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                    <input type="checkbox" checked readOnly onClick={() => toggle(p.id)} className="h-4 w-4 accent-brand-red" />
                    {p.name}
                  </label>
                )}
              />
            </>
          )}

          {unselectedProducts.length > 0 && (
            <>
              <p className="mb-2 mt-4 text-xs font-medium text-neutral-500">Other Products</p>
              <div className="space-y-1.5">
                {unselectedProducts.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neutral-50">
                    <input type="checkbox" checked={false} onChange={() => toggle(p.id)} className="h-4 w-4 accent-brand-red" />
                    {p.name}
                  </label>
                ))}
              </div>
            </>
          )}

          {products?.length === 0 && <p className="text-sm text-neutral-400">No products in this category yet.</p>}
        </div>

        <div className="shrink-0 border-t border-neutral-200 px-5 py-3">
          <button type="button" onClick={save} disabled={saving || !canEdit} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
