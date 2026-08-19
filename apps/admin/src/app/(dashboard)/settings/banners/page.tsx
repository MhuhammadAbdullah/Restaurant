"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { ImageUploadField } from "../../../../components/ImageUploadField";
import { StatusToggle } from "../../../../components/StatusToggle";
import { CloseIcon, EditIcon, TrashIcon } from "../../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { DatePopover } from "../../../../components/ui/date-popover";

type Banner = {
  id: string;
  image: string;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  status: "ACTIVE" | "INACTIVE";
  sortOrder: number;
};

const EMPTY_FORM = {
  image: "",
  title: "",
  startDate: "",
  endDate: "",
  sortOrder: 0,
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function BannersSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "cms.create");
  const canEdit = hasPermission(me, "cms.edit");
  const canDelete = hasPermission(me, "cms.delete");

  const { data: banners } = useQuery({ queryKey: ["admin-banners"], queryFn: () => api.get<Banner[]>("/cms/admin/banners") });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null);
  const [deleting, setDeleting] = useState(false);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(b: Banner) {
    setEditingId(b.id);
    setForm({
      image: b.image,
      title: b.title ?? "",
      startDate: toDateInputValue(b.startDate),
      endDate: toDateInputValue(b.endDate),
      sortOrder: b.sortOrder,
      status: b.status,
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
        image: form.image,
        title: form.title || undefined,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
        sortOrder: form.sortOrder,
        status: form.status,
      };
      if (editingId) {
        await api.patch(`/cms/admin/banners/${editingId}`, body);
      } else {
        await api.post("/cms/admin/banners", body);
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      await queryClient.invalidateQueries({ queryKey: ["cms-banners"] });
      closeForm();
      setForm(EMPTY_FORM);
      toast.success(editingId ? "Banner updated." : "Banner created.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save banner");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/cms/admin/banners/${deleteTarget.id}`);
      await queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      await queryClient.invalidateQueries({ queryKey: ["cms-banners"] });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStatus(b: Banner) {
    await api.patch(`/cms/admin/banners/${b.id}`, { status: b.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    await queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
    await queryClient.invalidateQueries({ queryKey: ["cms-banners"] });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Hero Banners</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage the homepage hero slider. Add multiple banners; they rotate in ascending sort-order.
          </p>
        </div>
        {canCreate && (
          <button onClick={startCreate} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
            + Add Banner
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">Image</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Sort</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {banners?.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.image} alt="" className="h-10 w-16 rounded object-cover" />
                </td>
                <td className="px-4 py-2 text-neutral-600">{b.title || <span className="text-neutral-300">—</span>}</td>
                <td className="px-4 py-2">{b.sortOrder}</td>
                <td className="px-4 py-2">
                  <StatusToggle active={b.status === "ACTIVE"} onClick={() => toggleStatus(b)} disabled={!canEdit} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <button onClick={() => startEdit(b)} aria-label="Edit banner" className="text-neutral-500 hover:text-brand-red">
                        <EditIcon size={17} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setDeleteTarget(b)} aria-label="Delete banner" className="text-neutral-500 hover:text-red-600">
                        <TrashIcon size={17} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {banners?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  No banners yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">{editingId ? "Edit Banner" : "Add Banner"}</p>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"
              >
                <CloseIcon size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <ImageUploadField label="Banner Image" folder="banners" value={form.image} onChange={(url) => setForm({ ...form, image: url })} />

              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Internal Title</p>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Weekend deals promo"
                  className="input w-full"
                />
                <p className="mt-1 text-xs text-neutral-400">For your reference only; never shown on the website.</p>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Sort Order</p>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
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

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  disabled={saving || !form.image}
                >
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Banner"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100"
                >
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
              <p className="text-base font-semibold text-neutral-900">Delete Banner</p>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"
              >
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={deleteTarget.image} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
                <p className="text-sm text-neutral-600">Are you sure you want to delete this banner? This cannot be undone.</p>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100"
                >
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
