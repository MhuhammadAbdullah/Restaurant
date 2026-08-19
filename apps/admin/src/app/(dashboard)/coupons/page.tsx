"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { toast } from "../../../store/useToastStore";
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

      <div className="mt-5 space-y-2">
        {coupons?.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono font-medium text-neutral-900">{c.code}</p>
              <p className="text-xs text-neutral-500">
                {c.discountType === "PERCENTAGE" ? `${c.discountValue}% off` : `${formatPaisa(c.discountValue)} off`}
                {c.maxDiscountAmount != null && ` (max ${formatPaisa(c.maxDiscountAmount)})`}
                {c.minOrderValue != null && ` · min order ${formatPaisa(c.minOrderValue)}`}
                {c.usageLimit != null && ` · limit ${c.usageLimit} uses`}
                {c.perCustomerLimit != null && ` · ${c.perCustomerLimit}/customer`}
              </p>
              {c.description && <p className="mt-0.5 text-xs text-neutral-400">{c.description}</p>}
              {(c.restrictedProducts.length > 0 || c.restrictedCategories.length > 0) && (
                <p className="mt-0.5 text-xs text-amber-600">
                  Restricted to: {[...c.restrictedProducts.map((p) => p.product.name), ...c.restrictedCategories.map((cat) => cat.category.name)].join(", ")}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatusToggle active={c.status === "ACTIVE"} onClick={() => toggleStatus(c)} disabled={!canEdit} />
              {canEdit && (
                <button onClick={() => startEdit(c)} aria-label="Edit coupon" className="text-neutral-500 hover:text-brand-red">
                  <EditIcon size={17} />
                </button>
              )}
              {canDelete && (
                <button onClick={() => setDeleteTarget(c)} aria-label="Delete coupon" className="text-neutral-500 hover:text-red-600">
                  <TrashIcon size={17} />
                </button>
              )}
            </div>
          </div>
        ))}
        {coupons?.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">No coupons yet.</p>}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">{editingId ? "Edit Coupon" : "New Coupon"}</p>
              <button type="button" onClick={closeForm} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Code</p>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="input w-full font-mono uppercase"
                  placeholder="WELCOME10"
                  required
                />
              </div>

              <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Discount Type</p>
                  <Select value={form.discountType} onValueChange={(v) => setForm({ ...form, discountType: v as "PERCENTAGE" | "FIXED_AMOUNT" })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                      <SelectItem value="FIXED_AMOUNT">Fixed Amount (Rs.)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">{form.discountType === "PERCENTAGE" ? "Percent Off" : "Amount Off (Rs.)"}</p>
                  <input
                    type="number"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    className="input w-full"
                    required
                    max={form.discountType === "PERCENTAGE" ? 100 : undefined}
                  />
                </div>
              </div>

              {form.discountType === "PERCENTAGE" && (
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Max Discount Cap (Rs., optional)</p>
                  <input type="number" value={form.maxDiscountAmount} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })} className="input w-full" placeholder="e.g. 300" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Minimum Order (Rs., optional)</p>
                  <input type="number" value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} className="input w-full" />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Per-Customer Limit</p>
                  <input type="number" min={1} value={form.perCustomerLimit} onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })} className="input w-full" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Start Date (optional)</p>
                  <DatePopover value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">End Date (optional)</p>
                  <DatePopover value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} />
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Total Usage Limit (optional)</p>
                <input type="number" min={1} value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} className="input w-full" placeholder="Unlimited if empty" />
              </div>

              <div className="mt-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-neutral-500">Restrict to Products (optional)</p>
                  <button type="button" onClick={() => setPicker("products")} className="text-xs font-medium text-brand-red">
                    + Select
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {form.productIds.map((id) => {
                    const p = products?.find((x) => x.id === id);
                    if (!p) return null;
                    return (
                      <span key={id} className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs">
                        {p.name}
                        <button type="button" onClick={() => setForm({ ...form, productIds: form.productIds.filter((x) => x !== id) })} className="text-neutral-400 hover:text-red-600"><CloseIcon size={11} /></button>
                      </span>
                    );
                  })}
                  {form.productIds.length === 0 && <p className="text-xs text-neutral-400">No product restriction; applies to all products</p>}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-neutral-500">Restrict to Categories (optional)</p>
                  <button type="button" onClick={() => setPicker("categories")} className="text-xs font-medium text-brand-red">
                    + Select
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {form.categoryIds.map((id) => {
                    const c = categories?.find((x) => x.id === id);
                    if (!c) return null;
                    return (
                      <span key={id} className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs">
                        {c.name}
                        <button type="button" onClick={() => setForm({ ...form, categoryIds: form.categoryIds.filter((x) => x !== id) })} className="text-neutral-400 hover:text-red-600"><CloseIcon size={11} /></button>
                      </span>
                    );
                  })}
                  {form.categoryIds.length === 0 && <p className="text-xs text-neutral-400">No category restriction; applies to all categories</p>}
                </div>
              </div>

              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "ACTIVE" | "INACTIVE" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-3 pt-1">
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
