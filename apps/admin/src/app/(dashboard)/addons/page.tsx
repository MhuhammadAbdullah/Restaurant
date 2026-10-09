"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa, effectivePrice, discountPercent } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { toast } from "../../../store/useToastStore";
import { ImageUploadField } from "../../../components/ImageUploadField";
import { StatusToggle } from "../../../components/StatusToggle";
import { ReorderableList } from "../../../components/ReorderableList";
import { SearchInput, FilterBar, FilterSelect, ClearFiltersButton, ResultsSummary } from "../../../components/SearchFilterBar";
import { CloseIcon, EditIcon, TrashIcon } from "../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

type AddonGroup = { id: string; name: string; status?: "ACTIVE" | "INACTIVE" };
type CatalogProduct = { id: string; name: string; category: { name: string } };
type Addon = {
  id: string;
  addonGroupId: string;
  productId: string;
  product: { id: string; name: string };
  name: string;
  description: string | null;
  price: number;
  discountPrice: number | null;
  image: string | null;
  maxQuantity: number;
  status: "ACTIVE" | "INACTIVE";
  sortOrder: number;
};

const EMPTY_ADDON_FORM = {
  addonGroupId: "",
  productId: "",
  name: "",
  description: "",
  image: "",
  price: 0,
  discountPrice: "",
  maxQuantity: 1,
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
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

export default function AddonsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "addonGroups.create");
  const canEdit = hasPermission(me, "addonGroups.edit");
  const canDelete = hasPermission(me, "addonGroups.delete");

  const { data: groups } = useQuery({ queryKey: ["addon-groups"], queryFn: () => api.get<AddonGroup[]>("/catalog/addon-groups") });
  const [filterGroupId, setFilterGroupId] = useState<string>("");
  const { data: allAddons } = useQuery({ queryKey: ["addons", ""], queryFn: () => api.get<Addon[]>("/catalog/addons") });
  const addons = useMemo(() => (allAddons ?? []).filter((a) => !filterGroupId || a.addonGroupId === filterGroupId), [allAddons, filterGroupId]);
  const { data: products } = useQuery({ queryKey: ["admin-products-lite"], queryFn: () => api.get<CatalogProduct[]>("/catalog/products") });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [discountFilter, setDiscountFilter] = useState("");
  const isFiltering = search.trim() !== "" || statusFilter !== "" || discountFilter !== "";

  const filteredAddons = useMemo(() => {
    return addons.filter((a) => {
      const q = search.trim().toLowerCase();
      if (q && !a.name.toLowerCase().includes(q) && !a.product.name.toLowerCase().includes(q)) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      if (discountFilter === "yes" && a.discountPrice == null) return false;
      if (discountFilter === "no" && a.discountPrice != null) return false;
      return true;
    });
  }, [addons, search, statusFilter, discountFilter]);

  // Category (Addon Group) form
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  async function submitCategory(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingCategoryId) {
        await api.patch(`/catalog/addon-groups/${editingCategoryId}`, { name: categoryName });
      } else {
        await api.post("/catalog/addon-groups", { name: categoryName, addons: [] });
      }
      await queryClient.invalidateQueries({ queryKey: ["addon-groups"] });
      toast.success(editingCategoryId ? "Category updated." : "Category created.");
      setCategoryName("");
      setEditingCategoryId(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save category");
    }
  }

  function startEditCategory(g: AddonGroup) {
    setEditingCategoryId(g.id);
    setCategoryName(g.name);
  }

  async function deleteCategory(id: string) {
    await api.delete(`/catalog/addon-groups/${id}`);
    await queryClient.invalidateQueries({ queryKey: ["addon-groups"] });
    if (filterGroupId === id) setFilterGroupId("");
  }

  // Addon form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_ADDON_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Addon | null>(null);
  const [deleting, setDeleting] = useState(false);

  function startCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_ADDON_FORM, addonGroupId: filterGroupId || groups?.[0]?.id || "" });
    setShowForm(true);
  }

  function startEdit(a: Addon) {
    setEditingId(a.id);
    setForm({
      addonGroupId: a.addonGroupId,
      productId: a.productId,
      name: a.name,
      description: a.description ?? "",
      image: a.image ?? "",
      price: a.price / 100,
      discountPrice: a.discountPrice != null ? String(a.discountPrice / 100) : "",
      maxQuantity: a.maxQuantity,
      status: a.status,
    });
    setShowForm(true);
  }

  function selectProduct(productId: string) {
    const product = products?.find((p) => p.id === productId);
    setForm((f) => ({ ...f, productId, name: f.name.trim() ? f.name : (product?.name ?? f.name) }));
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.addonGroupId || !form.productId) {
      toast.error(!form.addonGroupId ? "Please select a category" : "Please select a product");
      return;
    }
    setSaving(true);
    try {
      const body = {
        addonGroupId: form.addonGroupId,
        productId: form.productId,
        name: form.name,
        description: form.description || undefined,
        image: form.image || undefined,
        price: Math.round(form.price * 100),
        discountPrice: form.discountPrice.trim() ? Math.round(Number(form.discountPrice) * 100) : null,
        maxQuantity: form.maxQuantity,
        status: form.status,
      };
      if (editingId) {
        await api.patch(`/catalog/addons/${editingId}`, body);
      } else {
        await api.post("/catalog/addons", body);
      }
      await queryClient.invalidateQueries({ queryKey: ["addons"] });
      toast.success(editingId ? "Add-on updated." : "Add-on created.");
      closeForm();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save add-on");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/catalog/addons/${deleteTarget.id}`);
      await queryClient.invalidateQueries({ queryKey: ["addons"] });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStatus(a: Addon) {
    await api.patch(`/catalog/addons/${a.id}`, { status: a.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    await queryClient.invalidateQueries({ queryKey: ["addons"] });
  }

  async function reorder(orderedIds: string[]) {
    await api.patch("/catalog/addons/reorder", { orderedIds });
    await queryClient.invalidateQueries({ queryKey: ["addons"] });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Add-ons</h1>
      <p className="mt-1 text-sm text-neutral-500">Extras customers can add to a product or deal (e.g. Extra Cheese, Jalapenos).</p>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-sm font-semibold text-neutral-900">Categories</p>
          <p className="mt-0.5 text-xs text-neutral-400">Organize add-ons for browsing. No behavior is tied to categories.</p>

          <div className="mt-3 space-y-1.5">
            <button
              onClick={() => setFilterGroupId("")}
              className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${filterGroupId === "" ? "bg-brand-red/10 font-medium text-brand-red" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              All Add-ons <span className="text-xs text-neutral-400">({allAddons?.length ?? 0})</span>
            </button>
            {groups?.map((g) => (
              <div key={g.id} className={`group flex items-center gap-1 rounded-lg px-1 ${filterGroupId === g.id ? "bg-brand-red/10" : "hover:bg-neutral-50"}`}>
                <button
                  onClick={() => setFilterGroupId(g.id)}
                  className={`flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm ${filterGroupId === g.id ? "font-medium text-brand-red" : "text-neutral-600"}`}
                >
                  {g.name} <span className="text-xs font-normal text-neutral-400">({(allAddons ?? []).filter((a) => a.addonGroupId === g.id).length})</span>
                </button>
                {canEdit && (
                  <button onClick={() => startEditCategory(g)} aria-label="Rename category" className="p-1 text-neutral-400 opacity-0 hover:text-brand-red group-hover:opacity-100">
                    <EditIcon size={13} />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => deleteCategory(g.id)} aria-label="Delete category" className="p-1 text-neutral-400 opacity-0 hover:text-red-600 group-hover:opacity-100">
                    <TrashIcon size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {canCreate && (
            <form onSubmit={submitCategory} className="mt-3 flex gap-1.5 border-t border-neutral-100 pt-3">
              <input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder={editingCategoryId ? "Rename..." : "New category"}
                className="input min-w-0 flex-1 text-xs"
                required
              />
              <button className="shrink-0 rounded-lg bg-brand-red px-2.5 text-xs font-medium text-white">{editingCategoryId ? "Save" : "Add"}</button>
              {editingCategoryId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategoryId(null);
                    setCategoryName("");
                  }}
                  className="shrink-0 text-neutral-400"
                >
                  <CloseIcon size={11} />
                </button>
              )}
            </form>
          )}
        </div>

        <div>
          <div className="mb-3 grid grid-cols-3 gap-3">
            {[
              ["Add-ons", addons.length],
              ["Active", addons.filter((a) => a.status === "ACTIVE").length],
              ["Discounted", addons.filter((a) => a.discountPrice != null).length],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
                <p className="text-xs text-neutral-500">{label}</p>
                <p className="text-xl font-semibold text-neutral-900">{n}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterBar>
              <SearchInput value={search} onChange={setSearch} placeholder="Search add-ons..." />
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
                value={discountFilter}
                onChange={setDiscountFilter}
                placeholder="Discount"
                options={[
                  { value: "yes", label: "Discounted only" },
                  { value: "no", label: "Full price only" },
                ]}
              />
              {isFiltering && (
                <ClearFiltersButton
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setDiscountFilter("");
                  }}
                />
              )}
            </FilterBar>
            {canCreate && (
              <button onClick={startCreate} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
                + New Add-on
              </button>
            )}
          </div>
          <div className="mt-2">
            <ResultsSummary count={filteredAddons.length} total={addons.length} itemLabel="add-on" />
          </div>

          {isFiltering && <p className="mt-1 text-xs text-amber-600">Clear search/filters to drag-reorder add-ons.</p>}

          <div className="mt-3">
            <ReorderableList
              items={filteredAddons}
              onReorder={reorder}
              disabled={!canEdit || isFiltering}
              renderItem={(a) => {
                const pct = a.discountPrice != null && a.price > 0 ? Math.round((1 - a.discountPrice / a.price) * 100) : 0;
                const groupName = groups?.find((g) => g.id === a.addonGroupId)?.name;
                return (
                  <div className={`flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${a.status === "INACTIVE" ? "opacity-70" : ""}`}>
                    {a.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.image} alt="" draggable={false} className="h-14 w-14 shrink-0 rounded-lg border border-neutral-200 object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-[10px] text-neutral-400">No image</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-neutral-900">{a.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                          {a.status === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                        {pct > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-brand-red">{pct}% off</span>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {groupName && <span className="font-medium text-neutral-600">{groupName}</span>}
                        {groupName && " · "}Product: {a.product.name} · Max {a.maxQuantity}
                      </p>
                      {a.description && <p className="truncate text-xs text-neutral-400">{a.description}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      {a.discountPrice != null && <span className="block text-xs text-neutral-400 line-through">{formatPaisa(a.price)}</span>}
                      <span className="text-base font-bold text-brand-red">{formatPaisa(a.discountPrice ?? a.price)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 border-l border-neutral-100 pl-3">
                      <StatusToggle active={a.status === "ACTIVE"} onClick={() => toggleStatus(a)} disabled={!canEdit} />
                      {canEdit && (
                        <button onClick={() => startEdit(a)} aria-label="Edit add-on" className="text-neutral-500 hover:text-brand-red">
                          <EditIcon size={17} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setDeleteTarget(a)} aria-label="Delete add-on" className="text-neutral-500 hover:text-red-600">
                          <TrashIcon size={17} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              }}
            />
            {addons.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No add-ons yet.</p>}
            {addons.length > 0 && filteredAddons.length === 0 && (
              <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No add-ons match your search/filters.</p>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">{editingId ? "Edit Add-on" : "New Add-on"}</p>
              <button type="button" onClick={closeForm} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={1} title="Add-on details" hint="Which product this extra is, and where it is listed." />
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Category *</p>
                  <Select value={form.addonGroupId || undefined} onValueChange={(v) => setForm({ ...form, addonGroupId: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select Category" /></SelectTrigger>
                    <SelectContent>
                      {groups?.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Product *</p>
                  <Select value={form.productId || undefined} onValueChange={selectProduct}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select an existing product" /></SelectTrigger>
                    <SelectContent>
                      {products?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.category.name})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-neutral-400">Add-ons are always for an existing product. Create it under Products first if needed.</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Display name *</p>
                  <input placeholder="Name customers see" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" required />
                  <p className="mt-1 text-xs text-neutral-400">Defaults to the product name. Editing it won&apos;t rename the product.</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Description</p>
                  <input placeholder="Optional" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" />
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={2} title="Pricing & limits" hint="What the customer pays and how many they can add." />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Price (Rs.) *</p>
                    <input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="input w-full" required />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Discount price</p>
                    <input type="number" min={0} value={form.discountPrice} onChange={(e) => setForm({ ...form, discountPrice: e.target.value })} className="input w-full" placeholder="Optional" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Max quantity</p>
                    <input type="number" min={1} value={form.maxQuantity} onChange={(e) => setForm({ ...form, maxQuantity: Number(e.target.value) })} className="input w-full" />
                  </div>
                </div>
                {form.price > 0 && form.discountPrice.trim() && !isNaN(Number(form.discountPrice)) && (
                  <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                    Preview:{" "}
                    <span className="text-neutral-400 line-through">{formatPaisa(Math.round(form.price * 100))}</span>{" "}
                    <span className="font-medium text-brand-red">{formatPaisa(effectivePrice(Math.round(form.price * 100), Math.round(Number(form.discountPrice) * 100)))}</span>{" "}
                    <span className="text-green-700">({discountPercent(Math.round(form.price * 100), Math.round(Number(form.discountPrice) * 100))}% OFF)</span>
                  </p>
                )}
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={3} title="Image & status" hint="Optional picture, and whether customers can see it." />
                <ImageUploadField label="Image (optional)" folder="addons" value={form.image} onChange={(url) => setForm({ ...form, image: url })} />
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${form.status === "ACTIVE" ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}>
                  <input type="checkbox" checked={form.status === "ACTIVE"} onChange={(e) => setForm({ ...form, status: e.target.checked ? "ACTIVE" : "INACTIVE" })} className="mt-0.5 h-4 w-4 accent-[#ED2320]" />
                  <span>
                    <span className="block text-sm font-medium text-neutral-900">Active</span>
                    <span className="block text-xs text-neutral-500">Inactive add-ons are hidden from customers.</span>
                  </span>
                </label>
              </section>

              <div className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 flex items-center gap-3 border-t border-neutral-200 bg-white px-5 py-3">
                <button type="submit" className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Add-on"}
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
              <p className="text-base font-semibold text-neutral-900">Delete Add-on</p>
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
