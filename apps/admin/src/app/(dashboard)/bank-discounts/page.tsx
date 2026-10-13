"use client";

import { LoadingDots } from "../../../components/LoadingDots";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { toast } from "../../../store/useToastStore";
import { confirmDialog } from "../../../store/useConfirmStore";
import { ImageUploadField } from "../../../components/ImageUploadField";
import { ReorderableList } from "../../../components/ReorderableList";
import { StatusToggle } from "../../../components/StatusToggle";
import { Switch } from "../../../components/ui/switch";
import { CloseIcon, EditIcon, TrashIcon } from "../../../components/icons";

type Offer = { id: string; name: string; image: string; linkUrl: string | null; status: "ACTIVE" | "INACTIVE"; sortOrder: number };
type Settings = { enabled: boolean; heading: string; subheading: string };
type Payload = { settings: Settings; items: Offer[] };

const QUERY_KEY = ["bank-discounts-admin"];
const EMPTY_FORM = { name: "", image: "", linkUrl: "", status: "ACTIVE" as "ACTIVE" | "INACTIVE" };

export default function BankDiscountsAdminPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "cms.create");
  const canEdit = hasPermission(me, "cms.edit");
  const canDelete = hasPermission(me, "cms.delete");

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: () => api.get<Payload>("/bank-discounts/admin") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  // page settings
  const [settings, setSettings] = useState<Settings>({ enabled: false, heading: "", subheading: "" });
  const [savedSettings, setSavedSettings] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  useEffect(() => {
    if (!data) return;
    setSettings(data.settings);
    setSavedSettings(JSON.stringify(data.settings));
  }, [data]);
  const settingsDirty = savedSettings !== "" && JSON.stringify(settings) !== savedSettings;

  async function saveSettings(next: Settings = settings) {
    if (!next.heading.trim()) return toast.error("The page heading cannot be empty");
    setSavingSettings(true);
    try {
      await api.put("/bank-discounts/admin/settings", { enabled: next.enabled, heading: next.heading.trim(), subheading: next.subheading.trim() });
      await refresh();
      toast.success("Saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSavingSettings(false);
    }
  }

  // offer form (modal)
  const [editing, setEditing] = useState<Offer | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  function openNew() {
    setForm(EMPTY_FORM);
    setEditing("new");
  }
  function openEdit(o: Offer) {
    setForm({ name: o.name, image: o.image, linkUrl: o.linkUrl ?? "", status: o.status });
    setEditing(o);
  }
  async function saveOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!form.image) return toast.error("Add the offer picture");
    if (!form.name.trim()) return toast.error("Give the offer a name");
    setSaving(true);
    try {
      const body = { name: form.name.trim(), image: form.image, linkUrl: form.linkUrl.trim(), status: form.status };
      if (editing === "new") await api.post("/bank-discounts/admin/items", body);
      else if (editing) await api.patch(`/bank-discounts/admin/items/${editing.id}`, body);
      await refresh();
      toast.success("Saved.");
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the offer");
    } finally {
      setSaving(false);
    }
  }

  const toggle = useMutation({
    mutationFn: (o: Offer) => api.patch(`/bank-discounts/admin/items/${o.id}`, { status: o.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
    onSuccess: () => void refresh(),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not change the status"),
  });

  async function remove(o: Offer) {
    if (!(await confirmDialog({ title: "Delete this offer?", message: `"${o.name}" will be removed from the Bank Discounts page.`, confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await api.delete(`/bank-discounts/admin/items/${o.id}`);
      await refresh();
      toast.success("Offer deleted.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete the offer");
    }
  }

  async function reorder(ids: string[]) {
    try {
      await api.put("/bank-discounts/admin/reorder", { ids });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save the new order");
    }
  }

  const items = data?.items ?? [];
  const activeCount = items.filter((i) => i.status === "ACTIVE").length;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Bank Discounts</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">
        A page on the website that shows your partner-bank offers as pictures. Switch the whole page on or off, and choose which offers appear and in what order.
      </p>

      <section className="mt-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Show the page on the website</p>
            <p className="text-xs text-neutral-500">
              {settings.enabled ? "The page is live at /bank-discounts and linked from the menu and footer." : "The page and its links are hidden. Visitors who open the address see a not-found page."}
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            disabled={!canEdit || savingSettings}
            onCheckedChange={(v) => {
              const next = { ...settings, enabled: v };
              setSettings(next);
              void saveSettings(next);
            }}
            aria-label="Show the Bank Discounts page"
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-neutral-500">
            Page heading
            <input value={settings.heading} onChange={(e) => setSettings((s) => ({ ...s, heading: e.target.value }))} maxLength={80} disabled={!canEdit} className="input mt-1 w-full" />
            <span className="mt-1 block text-[11px] text-neutral-400">The last word is shown in red.</span>
          </label>
          <label className="block text-xs font-medium text-neutral-500">
            Short line under the heading
            <input value={settings.subheading} onChange={(e) => setSettings((s) => ({ ...s, subheading: e.target.value }))} maxLength={200} disabled={!canEdit} className="input mt-1 w-full" />
          </label>
        </div>
        {canEdit && (
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={() => void saveSettings()} disabled={!settingsDirty || savingSettings} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {savingSettings ? <LoadingDots>Saving</LoadingDots> : "Save texts"}
            </button>
            {settingsDirty && <span className="text-xs font-medium text-amber-600">You have unsaved changes</span>}
          </div>
        )}
      </section>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Offers</p>
          <p className="text-xs text-neutral-500">
            {items.length} offer{items.length === 1 ? "" : "s"}, {activeCount} shown. Drag the handle to change the order.
          </p>
        </div>
        {canCreate && (
          <button type="button" onClick={openNew} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            + Add offer
          </button>
        )}
      </div>

      <div className="mt-3">
        {isLoading ? (
          <p className="text-sm text-neutral-400"><LoadingDots>Loading</LoadingDots></p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">No offers yet. Add the first offer picture.</p>
        ) : (
          <ReorderableList
            items={items}
            onReorder={reorder}
            disabled={!canEdit}
            renderItem={(o) => (
              <div className={`flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm ${o.status === "INACTIVE" ? "border-neutral-200 opacity-70" : "border-neutral-200"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.image} alt="" draggable={false} className="h-16 w-16 shrink-0 rounded-lg border border-neutral-200 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900">{o.name}</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{o.linkUrl ? o.linkUrl : "No link"}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${o.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                    {o.status === "ACTIVE" ? "Shown" : "Hidden"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusToggle active={o.status === "ACTIVE"} onClick={() => toggle.mutate(o)} disabled={!canEdit} onLabel="Shown: click to hide" offLabel="Hidden: click to show" />
                  {canEdit && (
                    <button type="button" onClick={() => openEdit(o)} aria-label="Edit offer" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-brand-red">
                      <EditIcon size={15} />
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" onClick={() => void remove(o)} aria-label="Delete offer" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-600">
                      <TrashIcon size={15} />
                    </button>
                  )}
                </div>
              </div>
            )}
          />
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setEditing(null)} role="presentation">
          <form onSubmit={saveOffer} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-neutral-900">{editing === "new" ? "Add offer" : "Edit offer"}</p>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="text-neutral-400 hover:text-neutral-700">
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <ImageUploadField label="Offer picture *" folder="banners" value={form.image} onChange={(url) => setForm((f) => ({ ...f, image: url }))} shape="square" hint="Square picture works best, about 1200 x 1200" />
              <label className="block text-xs font-medium text-neutral-500">
                Name *
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={120} placeholder="e.g. MCB Debit Card, 30% off" className="input mt-1 w-full" />
                <span className="mt-1 block text-[11px] text-neutral-400">Only you and screen readers see this.</span>
              </label>
              <label className="block text-xs font-medium text-neutral-500">
                Link (optional)
                <input value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} placeholder="https://..." className="input mt-1 w-full" />
                <span className="mt-1 block text-[11px] text-neutral-400">Where a click on the picture goes. Leave empty for a plain picture.</span>
              </label>
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2">
                <span className="text-sm text-neutral-700">Show this offer on the page</span>
                <Switch checked={form.status === "ACTIVE"} onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? "ACTIVE" : "INACTIVE" }))} aria-label="Show this offer" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button disabled={saving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {saving ? <LoadingDots>Saving</LoadingDots> : "Save"}
              </button>
            </div>
          </form>
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
