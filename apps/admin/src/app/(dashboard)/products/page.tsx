"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { toast } from "../../../store/useToastStore";
import { ImageUploadField } from "../../../components/ImageUploadField";
import { StatusToggle } from "../../../components/StatusToggle";
import { EntityPickerModal, type PickableEntity } from "../../../components/EntityPickerModal";
import { SearchInput, FilterBar, FilterSelect, ClearFiltersButton, ResultsSummary, Pagination } from "../../../components/SearchFilterBar";
import { CloseIcon, EditIcon, TrashIcon } from "../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

const PAGE_SIZE = 20;

type SortKey = "name" | "category" | "price" | "main" | "cart" | "status";

type ProductTag = "HOUSE_FAVORITE" | "NEW_ARRIVAL" | "BEST_SELLER";
const PRODUCT_TAG_LABELS: Record<ProductTag, string> = {
  HOUSE_FAVORITE: "House Favorite",
  NEW_ARRIVAL: "New Arrival",
  BEST_SELLER: "Best Seller",
};
type Category = { id: string; name: string; mainPageLimit: number | null };
type ChoiceOption = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };
type ChoiceGroup = { id: string; name: string; isRequired: boolean; minSelect: number; maxSelect: number; options: ChoiceOption[] };
type Addon = { id: string; addonGroupId: string; name: string; price: number; status: "ACTIVE" | "INACTIVE" };
type Product = {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  discountPrice: number | null;
  status: "ACTIVE" | "INACTIVE";
  isFeatured: boolean;
  isPopular: boolean;
  tag: ProductTag | null;
  isCartRecommendable: boolean;
  showOnMainPage: boolean;
  mainPageSortOrder: number;
  category: { id: string; name: string };
  images: { url: string }[];
};
type ProductChoiceGroupAssignment = {
  choiceGroupId: string;
  sortOrder: number;
  isRequiredOverride: boolean | null;
  minSelectOverride: number | null;
  maxSelectOverride: number | null;
  defaultChoiceOptionId: string | null;
};
type ProductDetail = Product & {
  choiceGroups: { choiceGroupId: string; sortOrder: number; isRequiredOverride: boolean | null; minSelectOverride: number | null; maxSelectOverride: number | null; defaultChoiceOptionId: string | null }[];
  addons: { addonId: string }[];
};

const EMPTY_FORM = {
  categoryId: "",
  name: "",
  description: "",
  basePrice: 0,
  discountPrice: "",
  images: [] as string[],
  isFeatured: false,
  isPopular: false,
  tag: "NONE" as ProductTag | "NONE",
  isCartRecommendable: false,
  showOnMainPage: false,
  mainPageSortOrder: 0,
  choiceGroups: [] as ProductChoiceGroupAssignment[],
  addonIds: [] as string[],
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

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "products.create");
  const canEdit = hasPermission(me, "products.edit");
  const canDelete = hasPermission(me, "products.delete");

  const { data: products } = useQuery({ queryKey: ["admin-products"], queryFn: () => api.get<Product[]>("/catalog/products") });
  const { data: categories } = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.get<Category[]>("/catalog/categories") });
  const { data: choiceGroups } = useQuery({ queryKey: ["choice-groups"], queryFn: () => api.get<ChoiceGroup[]>("/catalog/choice-groups") });
  const { data: addons } = useQuery({ queryKey: ["addons", ""], queryFn: () => api.get<Addon[]>("/catalog/addons") });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<"choices" | "addons" | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [featuredFilter, setFeaturedFilter] = useState("");
  const [popularFilter, setPopularFilter] = useState("");
  const [discountFilter, setDiscountFilter] = useState("");
  const [page, setPage] = useState(1);
  const isFiltering = [search, categoryFilter, statusFilter, featuredFilter, popularFilter, discountFilter].some((v) => v !== "");

  const filteredProducts = useMemo(() => {
    return (products ?? []).filter((p) => {
      if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (categoryFilter && p.category.id !== categoryFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (featuredFilter === "yes" && !p.isFeatured) return false;
      if (featuredFilter === "no" && p.isFeatured) return false;
      if (popularFilter === "yes" && !p.isPopular) return false;
      if (popularFilter === "no" && p.isPopular) return false;
      if (discountFilter === "yes" && p.discountPrice == null) return false;
      if (discountFilter === "no" && p.discountPrice != null) return false;
      return true;
    });
  }, [products, search, categoryFilter, statusFilter, featuredFilter, popularFilter, discountFilter]);

  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const sortedProducts = useMemo(() => {
    if (!sort) return filteredProducts;
    const val = (p: Product): string | number => {
      switch (sort.key) {
        case "name": return p.name.toLowerCase();
        case "category": return p.category.name.toLowerCase();
        case "price": return p.discountPrice ?? p.basePrice;
        case "main": return p.showOnMainPage ? 1 : 0;
        case "cart": return p.isCartRecommendable ? 1 : 0;
        case "status": return p.status === "ACTIVE" ? 1 : 0;
      }
    };
    const m = sort.dir === "asc" ? 1 : -1;
    return [...filteredProducts].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name)) * m;
    });
  }, [filteredProducts, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search, categoryFilter, statusFilter, featuredFilter, popularFilter, discountFilter]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));
  const pagedProducts = sortedProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allPageSelected = pagedProducts.length > 0 && pagedProducts.every((p) => selected.has(p.id));
  const somePageSelected = pagedProducts.some((p) => selected.has(p.id));

  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAllPage() {
    setSelected((s) => {
      const n = new Set(s);
      if (allPageSelected) pagedProducts.forEach((p) => n.delete(p.id));
      else pagedProducts.forEach((p) => n.add(p.id));
      return n;
    });
  }

  async function runBulk(label: string, fn: (id: string) => Promise<unknown>) {
    const ids = [...selected];
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(ids.map(fn));
      const failed = results.filter((r) => r.status === "rejected").length;
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      if (failed === 0) toast.success(`${label}: ${ids.length} product${ids.length === 1 ? "" : "s"}.`);
      else toast.error(`${label}: ${ids.length - failed} done, ${failed} failed.`);
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
      setBulkDeleteOpen(false);
    }
  }
  const bulkStatus = (status: "ACTIVE" | "INACTIVE") =>
    runBulk(status === "ACTIVE" ? "Activated" : "Deactivated", (id) => api.patch(`/catalog/products/${id}`, { status }));
  const bulkCart = (on: boolean) =>
    runBulk(on ? "Added to cart recommendations" : "Removed from cart recommendations", (id) => api.patch(`/catalog/products/${id}`, { isCartRecommendable: on }));
  const bulkDelete = () => runBulk("Deleted", (id) => api.delete(`/catalog/products/${id}`));

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  async function startEdit(p: Product) {
    const detail = await api.get<ProductDetail>(`/catalog/products/${p.id}`);
    setEditingId(p.id);
    setForm({
      categoryId: p.category.id,
      name: p.name,
      description: p.description ?? "",
      basePrice: p.basePrice / 100,
      discountPrice: p.discountPrice != null ? String(p.discountPrice / 100) : "",
      images: detail.images.map((i) => i.url),
      isFeatured: p.isFeatured,
      isPopular: p.isPopular,
      tag: p.tag ?? "NONE",
      isCartRecommendable: p.isCartRecommendable,
      showOnMainPage: p.showOnMainPage,
      mainPageSortOrder: p.mainPageSortOrder,
      choiceGroups: detail.choiceGroups.map((c) => ({
        choiceGroupId: c.choiceGroupId,
        sortOrder: c.sortOrder,
        isRequiredOverride: c.isRequiredOverride,
        minSelectOverride: c.minSelectOverride,
        maxSelectOverride: c.maxSelectOverride,
        defaultChoiceOptionId: c.defaultChoiceOptionId,
      })),
      addonIds: detail.addons.map((a) => a.addonId),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.categoryId) {
      toast.error("Please select a category");
      return;
    }
    setSaving(true);
    try {
      const body = {
        categoryId: form.categoryId,
        name: form.name,
        description: form.description || undefined,
        basePrice: Math.round(form.basePrice * 100),
        discountPrice: form.discountPrice.trim() ? Math.round(Number(form.discountPrice) * 100) : null,
        images: form.images,
        isFeatured: form.isFeatured,
        isPopular: form.isPopular,
        tag: form.tag === "NONE" ? null : form.tag,
        isCartRecommendable: form.isCartRecommendable,
        showOnMainPage: form.showOnMainPage,
        mainPageSortOrder: form.mainPageSortOrder,
        choiceGroups: form.choiceGroups,
        addonIds: form.addonIds,
      };
      if (editingId) {
        await api.patch(`/catalog/products/${editingId}`, body);
      } else {
        await api.post("/catalog/products", body);
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success(editingId ? "Product updated." : "Product created.");
      closeForm();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save product");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/catalog/products/${deleteTarget.id}`);
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStatus(p: Product) {
    await api.patch(`/catalog/products/${p.id}`, { status: p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  }

  async function toggleCartRecommendable(p: Product) {
    await api.patch(`/catalog/products/${p.id}`, { isCartRecommendable: !p.isCartRecommendable });
    await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  }

  function toggleChoiceGroup(id: string) {
    setForm((f) => {
      const exists = f.choiceGroups.some((c) => c.choiceGroupId === id);
      if (exists) return { ...f, choiceGroups: f.choiceGroups.filter((c) => c.choiceGroupId !== id) };
      return {
        ...f,
        choiceGroups: [
          ...f.choiceGroups,
          { choiceGroupId: id, sortOrder: f.choiceGroups.length, isRequiredOverride: null, minSelectOverride: null, maxSelectOverride: null, defaultChoiceOptionId: null },
        ],
      };
    });
  }
  function updateChoiceGroupOverride(id: string, patch: Partial<ProductChoiceGroupAssignment>) {
    setForm((f) => ({ ...f, choiceGroups: f.choiceGroups.map((c) => (c.choiceGroupId === id ? { ...c, ...patch } : c)) }));
  }
  function toggleAddon(id: string) {
    setForm((f) => ({ ...f, addonIds: f.addonIds.includes(id) ? f.addonIds.filter((x) => x !== id) : [...f.addonIds, id] }));
  }

  const selectedCategory = categories?.find((c) => c.id === form.categoryId);
  const choiceGroupPickerItems: PickableEntity[] = (choiceGroups ?? []).map((g) => {
    const activeCount = g.options.filter((o) => o.status === "ACTIVE").length;
    return { id: g.id, label: g.name, sublabel: `${activeCount} active option${activeCount === 1 ? "" : "s"}`, warning: activeCount === 0 ? "No active options; won't show to customers" : undefined };
  });
  const addonPickerItems: PickableEntity[] = (addons ?? []).map((a) => ({ id: a.id, label: a.name, sublabel: formatPaisa(a.price) }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Products</h1>
        {canCreate && (
          <button onClick={startCreate} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
            + New Product
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search products..." />
          <FilterSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder="All categories"
            options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
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
            value={popularFilter}
            onChange={setPopularFilter}
            placeholder="Popular"
            options={[
              { value: "yes", label: "Popular only" },
              { value: "no", label: "Not popular" },
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
                setCategoryFilter("");
                setStatusFilter("");
                setFeaturedFilter("");
                setPopularFilter("");
                setDiscountFilter("");
              }}
            />
          )}
        </FilterBar>
        <ResultsSummary count={filteredProducts.length} total={products?.length ?? 0} itemLabel="product" />
      </div>

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-neutral-900">{selected.size} selected</span>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-neutral-500 underline">
            Clear
          </button>
          <span className="mx-1 hidden h-5 w-px bg-red-200 sm:block" />
          {canEdit && (
            <>
              <button disabled={bulkBusy} onClick={() => bulkStatus("ACTIVE")} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-60">
                Set Active
              </button>
              <button disabled={bulkBusy} onClick={() => bulkStatus("INACTIVE")} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-60">
                Set Inactive
              </button>
              <button disabled={bulkBusy} onClick={() => bulkCart(true)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-60">
                Add to Cart Rec.
              </button>
              <button disabled={bulkBusy} onClick={() => bulkCart(false)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-60">
                Remove from Cart Rec.
              </button>
            </>
          )}
          {canDelete && (
            <button disabled={bulkBusy} onClick={() => setBulkDeleteOpen(true)} className="ml-auto rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
              Delete
            </button>
          )}
          {bulkBusy && <span className="text-xs text-neutral-500">Working...</span>}
        </div>
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allPageSelected && somePageSelected;
                  }}
                  onChange={toggleAllPage}
                  disabled={pagedProducts.length === 0}
                  className="h-4 w-4 accent-[#ED2320]"
                />
              </th>
              {(
                [
                  ["name", "Name"],
                  ["category", "Category"],
                  ["price", "Price"],
                  ["main", "Main Page"],
                  ["cart", "Cart Rec."],
                  ["status", "Status"],
                ] as [SortKey, string][]
              ).map(([key, label]) => {
                const active = sort?.key === key;
                return (
                  <th key={key} className="px-4 py-2" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggleSort(key)} className={`inline-flex items-center gap-1.5 uppercase ${active ? "text-neutral-900" : "hover:text-neutral-800"}`}>
                      {label}
                      <span className="flex flex-col leading-none">
                        <span className={`text-[8px] ${active && sort!.dir === "asc" ? "text-brand-red" : "text-neutral-300"}`}>▲</span>
                        <span className={`text-[8px] ${active && sort!.dir === "desc" ? "text-brand-red" : "text-neutral-300"}`}>▼</span>
                      </span>
                    </button>
                  </th>
                );
              })}
              <th className="px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pagedProducts.map((p) => (
              <tr key={p.id} className={selected.has(p.id) ? "bg-red-50/60" : undefined}>
                <td className="px-4 py-2">
                  <input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="h-4 w-4 accent-[#ED2320]" />
                </td>
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2">{p.category.name}</td>
                <td className="px-4 py-2">
                  {p.discountPrice != null ? (
                    <>
                      <span className="text-neutral-400 line-through">{formatPaisa(p.basePrice)}</span> <span className="font-medium text-brand-red">{formatPaisa(p.discountPrice)}</span>
                    </>
                  ) : (
                    formatPaisa(p.basePrice)
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-neutral-500">{p.showOnMainPage ? "Shown" : "—"}</td>
                <td className="px-4 py-2">
                  <StatusToggle
                    active={p.isCartRecommendable}
                    onClick={() => toggleCartRecommendable(p)}
                    disabled={!canEdit}
                    onLabel="Shown in cart recommendations: click to remove"
                    offLabel="Not in cart recommendations: click to add"
                  />
                </td>
                <td className="px-4 py-2">
                  <StatusToggle active={p.status === "ACTIVE"} onClick={() => toggleStatus(p)} disabled={!canEdit} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <button onClick={() => startEdit(p)} aria-label="Edit product" className="text-neutral-500 hover:text-brand-red">
                        <EditIcon size={17} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setDeleteTarget(p)} aria-label="Delete product" className="text-neutral-500 hover:text-red-600">
                        <TrashIcon size={17} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {products?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  No products yet.
                </td>
              </tr>
            )}
            {(products?.length ?? 0) > 0 && filteredProducts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  No products match your search/filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">{editingId ? "Edit Product" : "New Product"}</p>
              <button type="button" onClick={closeForm} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={1} title="Basic details" hint="Name, category and description customers will see." />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Product name *</p>
                    <input placeholder="e.g. Zinger Burger" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" required />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Category *</p>
                    <Select value={form.categoryId || undefined} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select Category" /></SelectTrigger>
                      <SelectContent>
                        {categories?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Description</p>
                  <textarea placeholder="Short description shown on the product card" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" rows={3} />
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={2} title="Pricing" hint="Leave the discount empty if there is no offer." />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Regular Price (Rs.) *</p>
                    <input type="number" min={0} value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })} className="input w-full" required />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Discount Price (optional)</p>
                    <input type="number" min={0} value={form.discountPrice} onChange={(e) => setForm({ ...form, discountPrice: e.target.value })} className="input w-full" />
                    {form.discountPrice.trim() && Number(form.discountPrice) < form.basePrice && form.basePrice > 0 && (
                      <p className="mt-1 text-xs text-green-600">{Math.round((1 - Number(form.discountPrice) / form.basePrice) * 100)}% off</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={3} title="Images" hint="The first image is the main one." />
                {form.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.images.map((url, i) => (
                      <div key={url + i} className="relative h-20 w-20 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full rounded-lg border border-neutral-200 object-cover" />
                        {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] font-medium text-white">Main</span>}
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, images: form.images.filter((_, j) => j !== i) })}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white"
                        >
                          <CloseIcon size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <ImageUploadField
                  label="Add Image"
                  folder="products"
                  value=""
                  onChange={(url) => url && setForm((f) => ({ ...f, images: [...f.images, url] }))}
                />
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={4} title="Visibility & badges" hint="Where this product is promoted." />
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Card Tag (badge shown on the product card)</p>
                <Select value={form.tag} onValueChange={(v) => setForm({ ...form, tag: v as ProductTag | "NONE" })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="No tag" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No tag</SelectItem>
                    {(Object.keys(PRODUCT_TAG_LABELS) as ProductTag[]).map((t) => (
                      <SelectItem key={t} value={t}>{PRODUCT_TAG_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["isFeatured", "Featured", "Highlight on the storefront"],
                    ["isPopular", "Popular", "Show in Popular Items"],
                    ["isCartRecommendable", "Cart Recommendations", "Suggest to customers in the cart"],
                    ["showOnMainPage", "Main Page", "Show on the storefront main page"],
                  ] as ["isFeatured" | "isPopular" | "isCartRecommendable" | "showOnMainPage", string, string][]
                ).map(([key, label, hint]) => (
                  <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${form[key] ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}>
                    <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#ED2320]" />
                    <span>
                      <span className="block text-sm font-medium text-neutral-900">{label}</span>
                      <span className="block text-xs text-neutral-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {form.showOnMainPage && (
                <p className="text-xs text-neutral-500">
                  {selectedCategory?.mainPageLimit != null ? `This category shows up to ${selectedCategory.mainPageLimit} main-page products.` : "No main-page limit set for this category."}
                </p>
              )}
              </section>

              <section className="space-y-4 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={5} title="Options & add-ons" hint="Sizes, flavours and extras customers can pick." />
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-neutral-500">Choice Sections</p>
                  <button type="button" onClick={() => setPickerOpen("choices")} className="text-xs font-medium text-brand-red">
                    + Attach Section
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {form.choiceGroups.map((assignment) => {
                    const group = choiceGroups?.find((g) => g.id === assignment.choiceGroupId);
                    if (!group) return null;
                    return (
                      <div key={assignment.choiceGroupId} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-neutral-900">{group.name}</p>
                          <button type="button" onClick={() => toggleChoiceGroup(assignment.choiceGroupId)} className="text-xs text-red-600 hover:underline">
                            Remove
                          </button>
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-400">
                          Section default: {group.isRequired ? "Required" : "Optional"}, min {group.minSelect} / max {group.maxSelect}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Select
                            value={assignment.isRequiredOverride === null ? "inherit" : assignment.isRequiredOverride ? "required" : "optional"}
                            onValueChange={(v) =>
                              updateChoiceGroupOverride(assignment.choiceGroupId, {
                                isRequiredOverride: v === "inherit" ? null : v === "required",
                              })
                            }
                          >
                            <SelectTrigger className="h-auto bg-white py-1.5 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inherit">Inherit required</SelectItem>
                              <SelectItem value="required">Required</SelectItem>
                              <SelectItem value="optional">Optional</SelectItem>
                            </SelectContent>
                          </Select>
                          <input
                            type="number"
                            placeholder="Inherit min"
                            value={assignment.minSelectOverride ?? ""}
                            onChange={(e) => updateChoiceGroupOverride(assignment.choiceGroupId, { minSelectOverride: e.target.value === "" ? null : Number(e.target.value) })}
                            className="input bg-white text-xs"
                          />
                          <input
                            type="number"
                            placeholder="Inherit max"
                            value={assignment.maxSelectOverride ?? ""}
                            onChange={(e) => updateChoiceGroupOverride(assignment.choiceGroupId, { maxSelectOverride: e.target.value === "" ? null : Number(e.target.value) })}
                            className="input bg-white text-xs"
                          />
                          <Select
                            value={assignment.defaultChoiceOptionId ?? "none"}
                            onValueChange={(v) => updateChoiceGroupOverride(assignment.choiceGroupId, { defaultChoiceOptionId: v === "none" ? null : v })}
                          >
                            <SelectTrigger className="h-auto bg-white py-1.5 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No default</SelectItem>
                              {group.options.map((o) => (
                                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                  {form.choiceGroups.length === 0 && <p className="text-xs text-neutral-400">No choice sections attached.</p>}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-neutral-500">Add-ons</p>
                  <button type="button" onClick={() => setPickerOpen("addons")} className="text-xs font-medium text-brand-red">
                    + Select Add-ons
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.addonIds.map((id) => {
                    const addon = addons?.find((a) => a.id === id);
                    if (!addon) return null;
                    return (
                      <span key={id} className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs">
                        {addon.name}
                        <button type="button" onClick={() => toggleAddon(id)} className="text-neutral-400 hover:text-red-600">
                          <CloseIcon size={11} />
                        </button>
                      </span>
                    );
                  })}
                  {form.addonIds.length === 0 && <p className="text-xs text-neutral-400">No add-ons selected.</p>}
                </div>
              </div>

              </section>

              <div className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 flex items-center gap-3 border-t border-neutral-200 bg-white px-5 py-3">
                <button type="submit" className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Product"}
                </button>
                <button type="button" onClick={closeForm} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pickerOpen === "choices" && (
        <EntityPickerModal
          title="Attach Choice Sections"
          items={choiceGroupPickerItems}
          selectedIds={form.choiceGroups.map((c) => c.choiceGroupId)}
          onToggle={toggleChoiceGroup}
          onClose={() => setPickerOpen(null)}
        />
      )}
      {pickerOpen === "addons" && (
        <EntityPickerModal title="Select Add-ons" items={addonPickerItems} selectedIds={form.addonIds} onToggle={toggleAddon} onClose={() => setPickerOpen(null)} />
      )}

      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">Delete {selected.size} products</p>
              <button type="button" onClick={() => setBulkDeleteOpen(false)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-600">
                Delete the <span className="font-medium text-neutral-900">{selected.size}</span> selected product{selected.size === 1 ? "" : "s"}? This cannot be undone.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button type="button" onClick={bulkDelete} disabled={bulkBusy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                  {bulkBusy ? "Deleting..." : "Delete"}
                </button>
                <button type="button" onClick={() => setBulkDeleteOpen(false)} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">Delete Product</p>
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
