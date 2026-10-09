"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { toast } from "../../../store/useToastStore";
import { SearchInput, FilterBar, FilterSelect, ClearFiltersButton, ResultsSummary } from "../../../components/SearchFilterBar";
import { StatusToggle } from "../../../components/StatusToggle";
import { EntityPickerModal, type PickableEntity } from "../../../components/EntityPickerModal";
import { CloseIcon, EditIcon, TrashIcon } from "../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { DatePopover } from "../../../components/ui/date-popover";

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderValue: number | null;
  startDate: string | null;
  endDate: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  status: "ACTIVE" | "INACTIVE";
  restrictedProducts: { product: { id: string; name: string } }[];
  restrictedCategories: { category: { id: string; name: string } }[];
};

type CatalogProduct = { id: string; name: string };
type CatalogCategory = { id: string; name: string };

const EMPTY_FORM = {
  code: "",
  description: "",
  discountType: "PERCENTAGE" as "PERCENTAGE" | "FIXED_AMOUNT",
  discountValue: "",
  maxDiscountAmount: "",
  minOrderValue: "",
  startDate: "",
  endDate: "",
  usageLimit: "",
  perCustomerLimit: "1",
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
  productIds: [] as string[],
  categoryIds: [] as string[],
};

type CouponState = "LIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE";
function couponState(c: Coupon): CouponState {
  if (c.status !== "ACTIVE") return "INACTIVE";
  const now = Date.now();
  if (c.endDate && new Date(c.endDate).getTime() + 86_400_000 <= now) return "EXPIRED";
  if (c.startDate && new Date(c.startDate).getTime() > now) return "SCHEDULED";
  return "LIVE";
}
function validityText(c: Coupon): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  if (c.startDate && c.endDate) return `Valid ${fmt(c.startDate)} – ${fmt(c.endDate)}`;
  if (c.endDate) return `Valid until ${fmt(c.endDate)}`;
  if (c.startDate) return `Starts ${fmt(c.startDate)}`;
  return "No expiry";
}
function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export default function CouponsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "coupons.create");
  const canEdit = hasPermission(me, "coupons.edit");
  const canDelete = hasPermission(me, "coupons.delete");

  const { data: coupons } = useQuery({ queryKey: ["coupons"], queryFn: () => api.get<Coupon[]>("/catalog/coupons") });
  const { data: products } = useQuery({ queryKey: ["admin-products-lite"], queryFn: () => api.get<CatalogProduct[]>("/catalog/products") });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api.get<CatalogCategory[]>("/catalog/categories") });

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const isFiltering = [search, stateFilter, typeFilter].some((v) => v !== "");
  const filteredCoupons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (coupons ?? []).filter((c) => {
      if (q && !c.code.toLowerCase().includes(q) && !(c.description ?? "").toLowerCase().includes(q)) return false;
      if (stateFilter && couponState(c) !== stateFilter) return false;
      if (typeFilter && c.discountType !== typeFilter) return false;
      return true;
    });
  }, [coupons, search, stateFilter, typeFilter]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [picker, setPicker] = useState<"products" | "categories" | null>(null);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(c: Coupon) {
    setEditingId(c.id);
    setForm({
      code: c.code,
      description: c.description ?? "",
      discountType: c.discountType,
      discountValue: c.discountType === "PERCENTAGE" ? String(c.discountValue) : String(c.discountValue / 100),
      maxDiscountAmount: c.maxDiscountAmount != null ? String(c.maxDiscountAmount / 100) : "",
      minOrderValue: c.minOrderValue != null ? String(c.minOrderValue / 100) : "",
      startDate: toDateInput(c.startDate),
      endDate: toDateInput(c.endDate),
      usageLimit: c.usageLimit != null ? String(c.usageLimit) : "",
      perCustomerLimit: c.perCustomerLimit != null ? String(c.perCustomerLimit) : "",
      status: c.status,
      productIds: c.restrictedProducts.map((p) => p.product.id),
      categoryIds: c.restrictedCategories.map((cat) => cat.category.id),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(form.discountValue);
    if (!(val > 0) || (form.discountType === "PERCENTAGE" && val > 100)) {
      toast.error(form.discountType === "PERCENTAGE" ? "Percent off must be between 1 and 100" : "Enter an amount greater than 0");
      return;
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      toast.error("End date can't be before the start date");
      return;
    }
    setSaving(true);
    try {
      const body = {
        code: form.code,
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue:
          form.discountType === "PERCENTAGE" ? Number(form.discountValue) : Math.round(Number(form.discountValue) * 100),
        maxDiscountAmount: form.maxDiscountAmount.trim() ? Math.round(Number(form.maxDiscountAmount) * 100) : undefined,
        minOrderValue: form.minOrderValue.trim() ? Math.round(Number(form.minOrderValue) * 100) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        usageLimit: form.usageLimit.trim() ? Number(form.usageLimit) : undefined,
        perCustomerLimit: form.perCustomerLimit.trim() ? Number(form.perCustomerLimit) : undefined,
        status: form.status,
        productIds: form.productIds,
        categoryIds: form.categoryIds,
      };
      if (editingId) {
        await api.patch(`/catalog/coupons/${editingId}`, body);
      } else {
        await api.post("/catalog/coupons", body);
      }
      await queryClient.invalidateQueries({ queryKey: ["coupons"] });
      toast.success(editingId ? "Coupon updated." : "Coupon created.");
      closeForm();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save coupon");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/catalog/coupons/${deleteTarget.id}`);
      await queryClient.invalidateQueries({ queryKey: ["coupons"] });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStatus(c: Coupon) {
    await api.patch(`/catalog/coupons/${c.id}`, { status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    await queryClient.invalidateQueries({ queryKey: ["coupons"] });
  }

  const productItems: PickableEntity[] = (products ?? []).map((p) => ({ id: p.id, label: p.name }));
  const categoryItems: PickableEntity[] = (categories ?? []).map((c) => ({ id: c.id, label: c.name }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Coupons</h1>
          <p className="mt-1 text-sm text-neutral-500">Discount codes for online checkout and POS. All validation happens server-side.</p>
        </div>
        {canCreate && (
          <button onClick={startCreate} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
            + New Coupon
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total", (coupons ?? []).length],
          ["Live now", (coupons ?? []).filter((c) => couponState(c) === "LIVE").length],
          ["Scheduled", (coupons ?? []).filter((c) => couponState(c) === "SCHEDULED").length],
          ["Expired / off", (coupons ?? []).filter((c) => ["EXPIRED", "INACTIVE"].includes(couponState(c))).length],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-xl font-semibold text-neutral-900">{n}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search code or description..." />
          <FilterSelect
            value={stateFilter}
            onChange={setStateFilter}
            placeholder="All states"
            options={[
              { value: "LIVE", label: "Live now" },
              { value: "SCHEDULED", label: "Scheduled" },
              { value: "EXPIRED", label: "Expired" },
              { value: "INACTIVE", label: "Inactive" },
            ]}
          />
          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="All types"
            options={[
              { value: "PERCENTAGE", label: "Percentage" },
              { value: "FIXED_AMOUNT", label: "Fixed amount" },
            ]}
          />
          {isFiltering && (
            <ClearFiltersButton
              onClick={() => {
                setSearch("");
                setStateFilter("");
                setTypeFilter("");
              }}
            />
          )}
        </FilterBar>
        <ResultsSummary count={filteredCoupons.length} total={coupons?.length ?? 0} itemLabel="coupon" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCoupons.map((c) => {
          const state = couponState(c);
          const stateMeta = {
            LIVE: ["Live", "bg-green-50 text-green-700"],
            SCHEDULED: ["Scheduled", "bg-blue-50 text-blue-700"],
            EXPIRED: ["Expired", "bg-neutral-200 text-neutral-600"],
            INACTIVE: ["Inactive", "bg-neutral-100 text-neutral-500"],
          }[state] as [string, string];
          const restricted = [...c.restrictedProducts.map((p) => p.product.name), ...c.restrictedCategories.map((cat) => cat.category.name)];
          return (
            <div key={c.id} className={`flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md ${state === "EXPIRED" || state === "INACTIVE" ? "opacity-70" : ""}`}>
              <div className="flex items-stretch">
                <div className="flex w-28 shrink-0 flex-col items-center justify-center bg-brand-red px-2 py-4 text-center text-white">
                  <span className="text-2xl font-extrabold leading-none">{c.discountType === "PERCENTAGE" ? `${c.discountValue}%` : formatPaisa(c.discountValue)}</span>
                  <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-90">OFF</span>
                </div>
                <div className="min-w-0 flex-1 border-l-2 border-dashed border-neutral-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(c.code).then(() => toast.success(`Copied ${c.code}`));
                      }}
                      title="Click to copy"
                      className="truncate rounded-md bg-neutral-100 px-2 py-1 font-mono text-sm font-bold tracking-wider text-neutral-900 hover:bg-neutral-200"
                    >
                      {c.code}
                    </button>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateMeta[1]}`}>{stateMeta[0]}</span>
                  </div>
                  {c.description && <p className="mt-1.5 line-clamp-2 text-xs text-neutral-500">{c.description}</p>}
                  <p className="mt-1.5 text-xs text-neutral-400">{validityText(c)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 px-3 py-2.5 text-[11px]">
                {c.maxDiscountAmount != null && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">Max {formatPaisa(c.maxDiscountAmount)}</span>}
                {c.minOrderValue != null && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">Min order {formatPaisa(c.minOrderValue)}</span>}
                {c.perCustomerLimit != null && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">{c.perCustomerLimit}/customer</span>}
                {c.usageLimit != null && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">{c.usageLimit} total uses</span>}
                {restricted.length > 0 ? (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700" title={restricted.join(", ")}>
                    Only: {restricted.slice(0, 2).join(", ")}{restricted.length > 2 ? ` +${restricted.length - 2}` : ""}
                  </span>
                ) : (
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">All items</span>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-neutral-100 px-3 py-2.5 text-xs">
                <StatusToggle active={c.status === "ACTIVE"} onClick={() => toggleStatus(c)} disabled={!canEdit} />
                <div className="flex items-center gap-3">
                  {canEdit && (
                    <button onClick={() => startEdit(c)} aria-label="Edit coupon" className="flex items-center gap-1 text-neutral-500 hover:text-brand-red">
                      <EditIcon size={14} /> Edit
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => setDeleteTarget(c)} aria-label="Delete coupon" className="flex items-center gap-1 text-neutral-500 hover:text-red-600">
                      <TrashIcon size={14} /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {coupons?.length === 0 && <p className="col-span-full rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No coupons yet.</p>}
        {(coupons?.length ?? 0) > 0 && filteredCoupons.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No coupons match your search/filters.</p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">{editingId ? "Edit Coupon" : "New Coupon"}</p>
              <button type="button" onClick={closeForm} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={1} title="Coupon code" hint="What customers type at checkout." />
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Code *</p>
                  <div className="flex gap-2">
                    <input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, "") })}
                      className="input min-w-0 flex-1 font-mono uppercase tracking-wider"
                      placeholder="WELCOME10"
                      required
                    />
                    <button type="button" onClick={() => setForm({ ...form, code: randomCode() })} className="shrink-0 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                      Generate
                    </button>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Description</p>
                  <input placeholder="Optional note, e.g. Welcome offer for new customers" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" />
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={2} title="Discount" hint="How much the customer saves." />
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["PERCENTAGE", "Percentage", "e.g. 10% off the order"],
                      ["FIXED_AMOUNT", "Fixed amount", "e.g. Rs. 200 off the order"],
                    ] as ["PERCENTAGE" | "FIXED_AMOUNT", string, string][]
                  ).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, discountType: value, maxDiscountAmount: value === "FIXED_AMOUNT" ? "" : form.maxDiscountAmount })}
                      className={`rounded-lg border p-3 text-left ${form.discountType === value ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}
                    >
                      <span className="block text-sm font-medium text-neutral-900">{label}</span>
                      <span className="block text-xs text-neutral-500">{hint}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">{form.discountType === "PERCENTAGE" ? "Percent off (%) *" : "Amount off (Rs.) *"}</p>
                    <input type="number" min={1} max={form.discountType === "PERCENTAGE" ? 100 : undefined} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} className="input w-full" required />
                  </div>
                  {form.discountType === "PERCENTAGE" && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-neutral-500">Max discount cap (Rs.)</p>
                      <input type="number" min={0} value={form.maxDiscountAmount} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })} className="input w-full" placeholder="No cap" />
                    </div>
                  )}
                </div>
                {form.discountValue.trim() && Number(form.discountValue) > 0 && (
                  <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                    <span className="font-semibold text-brand-red">{form.code || "CODE"}</span> gives{" "}
                    {form.discountType === "PERCENTAGE" ? `${form.discountValue}% off` : `Rs. ${form.discountValue} off`}
                    {form.discountType === "PERCENTAGE" && form.maxDiscountAmount.trim() ? ` (up to Rs. ${form.maxDiscountAmount})` : ""}
                    {form.minOrderValue.trim() ? ` on orders of Rs. ${form.minOrderValue} or more` : " on any order"}.
                  </p>
                )}
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={3} title="Conditions & validity" hint="Leave blank for no limit." />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Minimum order (Rs.)</p>
                    <input type="number" min={0} value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} className="input w-full" placeholder="None" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Uses per customer</p>
                    <input type="number" min={1} value={form.perCustomerLimit} onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })} className="input w-full" placeholder="Unlimited" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Total uses</p>
                    <input type="number" min={1} value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} className="input w-full" placeholder="Unlimited" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Start date</p>
                    <DatePopover value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">End date</p>
                    <DatePopover value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
                <SectionTitle n={4} title="Restrictions" hint="Limit the coupon to certain products or categories. Empty means everything." />
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-500">Products</p>
                    <button type="button" onClick={() => setPicker("products")} className="text-xs font-medium text-brand-red">+ Select</button>
                  </div>
                <div className="flex flex-wrap gap-2">
                  {form.productIds.map((id) => {
                    const x = products?.find((y) => y.id === id);
                    if (!x) return null;
                    return (
                      <span key={id} className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs">
                        {x.name}
                        <button type="button" onClick={() => setForm({ ...form, productIds: form.productIds.filter((y) => y !== id) })} className="text-neutral-400 hover:text-red-600"><CloseIcon size={11} /></button>
                      </span>
                    );
                  })}
                  {form.productIds.length === 0 && <p className="text-xs text-neutral-400">All products</p>}
                </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-500">Categories</p>
                    <button type="button" onClick={() => setPicker("categories")} className="text-xs font-medium text-brand-red">+ Select</button>
                  </div>
                <div className="flex flex-wrap gap-2">
                  {form.categoryIds.map((id) => {
                    const x = categories?.find((y) => y.id === id);
                    if (!x) return null;
                    return (
                      <span key={id} className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs">
                        {x.name}
                        <button type="button" onClick={() => setForm({ ...form, categoryIds: form.categoryIds.filter((y) => y !== id) })} className="text-neutral-400 hover:text-red-600"><CloseIcon size={11} /></button>
                      </span>
                    );
                  })}
                  {form.categoryIds.length === 0 && <p className="text-xs text-neutral-400">All categories</p>}
                </div>
                </div>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${form.status === "ACTIVE" ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}>
                  <input type="checkbox" checked={form.status === "ACTIVE"} onChange={(e) => setForm({ ...form, status: e.target.checked ? "ACTIVE" : "INACTIVE" })} className="mt-0.5 h-4 w-4 accent-[#ED2320]" />
                  <span>
                    <span className="block text-sm font-medium text-neutral-900">Active</span>
                    <span className="block text-xs text-neutral-500">Inactive coupons can&apos;t be used at checkout or POS.</span>
                  </span>
                </label>
              </section>

              <div className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 flex items-center gap-3 border-t border-neutral-200 bg-white px-5 py-3">
                <button type="submit" className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Coupon"}
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
          title={picker === "products" ? "Restrict to Products" : "Restrict to Categories"}
          items={picker === "products" ? productItems : categoryItems}
          selectedIds={picker === "products" ? form.productIds : form.categoryIds}
          onToggle={(id) => {
            if (picker === "products") {
              setForm((f) => ({ ...f, productIds: f.productIds.includes(id) ? f.productIds.filter((x) => x !== id) : [...f.productIds, id] }));
            } else {
              setForm((f) => ({ ...f, categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((x) => x !== id) : [...f.categoryIds, id] }));
            }
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">Delete Coupon</p>
              <button type="button" onClick={() => setDeleteTarget(null)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-600">
                Delete <span className="font-mono font-medium text-neutral-900">{deleteTarget.code}</span>? This cannot be undone.
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
