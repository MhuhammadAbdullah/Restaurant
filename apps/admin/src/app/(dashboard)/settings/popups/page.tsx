"use client";

import { LoadingDots } from "../../../../components/LoadingDots";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { ImageUploadField } from "../../../../components/ImageUploadField";
import { StatusToggle } from "../../../../components/StatusToggle";
import { CloseIcon, EditIcon, TrashIcon } from "../../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDownIcon } from "../../../../components/icons";
import { DatePopover } from "../../../../components/ui/date-popover";

const PAGES = [
  { key: "ALL", label: "All pages (including pages added later)" },
  { key: "HOME", label: "Home page" },
  { key: "MENU", label: "Menu & categories" },
  { key: "LOCATIONS", label: "Our Locations" },
  { key: "CHECKOUT", label: "Checkout" },
  { key: "ACCOUNT", label: "My Account" },
  { key: "COMPLAINTS", label: "Complaints" },
  { key: "INFO", label: "Terms, Privacy & FAQs" },
  { key: "OTHER", label: "Any other page (new pages too)" },
];
const AUDIENCES = [
  { key: "ALL", label: "Everyone" },
  { key: "GUESTS", label: "Visitors who are not signed in" },
  { key: "CUSTOMERS", label: "Signed-in customers only" },
];
const DEVICES = [
  { key: "ALL", label: "Phones and computers" },
  { key: "MOBILE", label: "Phones only" },
  { key: "DESKTOP", label: "Computers only" },
];
const FREQUENCIES = [
  { key: "EVERY_VISIT", label: "Every time a page opens" },
  { key: "SESSION", label: "Once per visit (until the browser is closed)" },
  { key: "DAILY", label: "Once a day" },
  { key: "EVERY_N_DAYS", label: "Again after a number of days" },
  { key: "ONCE", label: "Only once per person" },
];
const label = (list: { key: string; label: string }[], k: string) => list.find((x) => x.key === k)?.label ?? k;

type Popup = {
  id: string;
  name: string;
  image: string;
  linkUrl: string | null;
  pages: string[];
  audience: string;
  device: string;
  frequency: string;
  repeatDays: number;
  delaySeconds: number;
  startDate: string | null;
  endDate: string | null;
  status: "ACTIVE" | "INACTIVE";
  sortOrder: number;
  viewCount: number;
  clickCount: number;
};

const EMPTY = {
  name: "",
  image: "",
  linkUrl: "",
  pages: ["HOME"] as string[],
  audience: "ALL",
  device: "ALL",
  frequency: "SESSION",
  repeatDays: 3,
  delaySeconds: 2,
  startDate: "",
  endDate: "",
  sortOrder: 0,
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
};

const dateValue = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** Dropdown with checkboxes. "All pages" and the specific pages exclude each other. */
function PagesDropdown({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const all = value.includes("ALL");
  function toggle(key: string) {
    if (key === "ALL") return onChange(all ? [] : ["ALL"]);
    const rest = value.filter((x) => x !== "ALL");
    onChange(rest.includes(key) ? rest.filter((x) => x !== key) : [...rest, key]);
  }
  const summary = all ? "All pages" : value.length === 0 ? "Choose pages" : value.map((k) => PAGES.find((p) => p.key === k)?.label.replace(/ \(.*\)/, "") ?? k).join(", ");
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-700 transition hover:border-brand-red data-[state=open]:border-brand-red">
          <span className={`truncate ${value.length ? "" : "text-neutral-400"}`}>{summary}</span>
          <ChevronDownIcon size={10} className="shrink-0 text-neutral-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-[60] w-[var(--radix-popover-trigger-width)] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
          {PAGES.map((p) => {
            const on = p.key === "ALL" ? all : !all && value.includes(p.key);
            return (
              <label key={p.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
                <input type="checkbox" checked={on} onChange={() => toggle(p.key)} className="h-4 w-4 accent-brand-red" />
                <span className={p.key === "ALL" ? "font-medium" : ""}>{p.label}</span>
              </label>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Dropdown({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { key: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function PopupsSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "cms.create");
  const canEdit = hasPermission(me, "cms.edit");
  const canDelete = hasPermission(me, "cms.delete");

  const { data: popups } = useQuery({ queryKey: ["admin-popups"], queryFn: () => api.get<Popup[]>("/cms/admin/popups") });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Popup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-popups"] });
  };

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function startEdit(p: Popup) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      image: p.image,
      linkUrl: p.linkUrl ?? "",
      pages: p.pages?.length ? p.pages : ["HOME"],
      audience: p.audience,
      device: p.device,
      frequency: p.frequency,
      repeatDays: p.repeatDays,
      delaySeconds: p.delaySeconds,
      startDate: dateValue(p.startDate),
      endDate: dateValue(p.endDate),
      sortOrder: p.sortOrder,
      status: p.status,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.pages.length === 0) return toast.error("Pick at least one page for the pop-up");
    if (form.startDate && form.endDate && form.endDate < form.startDate) return toast.error("The end date cannot be before the start date");
    const link = form.linkUrl.trim();
    if (link && !/^(https?:\/\/|\/)/i.test(link)) return toast.error("The link must start with https:// or / (for a page on your website)");
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        image: form.image,
        linkUrl: link,
        pages: form.pages,
        audience: form.audience,
        device: form.device,
        frequency: form.frequency,
        repeatDays: Math.max(1, Math.round(form.repeatDays) || 1),
        delaySeconds: Math.max(0, Math.round(form.delaySeconds) || 0),
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        sortOrder: form.sortOrder,
        status: form.status,
      };
      if (editingId) await api.patch(`/cms/admin/popups/${editingId}`, body);
      else await api.post("/cms/admin/popups", body);
      await refresh();
      closeForm();
      toast.success(editingId ? "Pop-up updated." : "Pop-up created.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the pop-up");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/cms/admin/popups/${deleteTarget.id}`);
      await refresh();
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStatus(p: Popup) {
    await api.patch(`/cms/admin/popups/${p.id}`, { status: p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    await refresh();
  }

  const rule = (p: Popup) => {
    const freq = p.frequency === "EVERY_N_DAYS" ? `Again after ${p.repeatDays} day${p.repeatDays === 1 ? "" : "s"}` : label(FREQUENCIES, p.frequency).replace(/ \(.*\)/, "");
    return `${freq} · ${label(AUDIENCES, p.audience).replace("Visitors who are not signed in", "Guests").replace("Signed-in customers only", "Customers")} · ${label(DEVICES, p.device).replace(" only", "").replace("Phones and computers", "All devices")}`;
  };
  const when = (p: Popup) => (p.startDate || p.endDate ? `${p.startDate ? dateValue(p.startDate) : "any time"} → ${p.endDate ? dateValue(p.endDate) : "no end"}` : "Always");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Marketing Pop-ups</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Promotional pop-ups shown on your website, like an offer or free-delivery notice. Choose the pages, who sees it, how often and for how long. If several match, only the first one in sort order is shown.
          </p>
        </div>
        {canCreate && (
          <button onClick={startCreate} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
            + Add Pop-up
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">Pop-up</th>
              <th className="px-4 py-2">Shown on</th>
              <th className="px-4 py-2">Rules</th>
              <th className="px-4 py-2">Dates</th>
              <th className="px-4 py-2">Views / Clicks</th>
              <th className="px-4 py-2">Sort</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {popups?.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                    <span className="font-medium text-neutral-800">{p.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {p.pages.map((k) => (
                      <span key={k} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">{label(PAGES, k).replace(/ \(.*\)/, "")}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs text-neutral-600">{rule(p)}<br /><span className="text-neutral-400">Appears after {p.delaySeconds}s</span></td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-600">{when(p)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-600">
                  {p.viewCount} / {p.clickCount}
                  {p.viewCount > 0 && p.linkUrl && <span className="ml-1 text-neutral-400">({Math.round((p.clickCount / p.viewCount) * 100)}%)</span>}
                </td>
                <td className="px-4 py-2">{p.sortOrder}</td>
                <td className="px-4 py-2">
                  <StatusToggle active={p.status === "ACTIVE"} onClick={() => toggleStatus(p)} disabled={!canEdit} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <button onClick={() => startEdit(p)} aria-label="Edit pop-up" className="text-neutral-500 hover:text-brand-red">
                        <EditIcon size={17} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setDeleteTarget(p)} aria-label="Delete pop-up" className="text-neutral-500 hover:text-red-600">
                        <TrashIcon size={17} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {popups?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">No pop-ups yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">{editingId ? "Edit Pop-up" : "Add Pop-up"}</p>
              <button type="button" onClick={closeForm} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <ImageUploadField label="Pop-up Image" shape="square" hint="1080 × 1080" folder="banners" value={form.image} onChange={(url) => setForm({ ...form, image: url })} />
              <p className="-mt-2 text-xs text-neutral-400">Square or portrait artwork works best (for example 1080 × 1080). It is shown as it is, with rounded corners.</p>

              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Name *</p>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 50% off online orders" className="input w-full" required />
                <p className="mt-1 text-xs text-neutral-400">For your reference only; never shown on the website.</p>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">When the image is clicked, open (optional)</p>
                <input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/category/pizza  or  https://..." className="input w-full" />
                <p className="mt-1 text-xs text-neutral-400">Leave empty if the pop-up is only an announcement. Use / for a page on your own website.</p>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Show on these pages *</p>
                <PagesDropdown value={form.pages} onChange={(pages) => setForm({ ...form, pages })} />
                <p className="mt-1 text-xs text-neutral-400">Choose "All pages" to cover every page, including any you add to the website later.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Who sees it</p>
                  <Dropdown value={form.audience} onChange={(v) => setForm({ ...form, audience: v })} options={AUDIENCES} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">On which devices</p>
                  <Dropdown value={form.device} onChange={(v) => setForm({ ...form, device: v })} options={DEVICES} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">How often</p>
                  <Dropdown value={form.frequency} onChange={(v) => setForm({ ...form, frequency: v })} options={FREQUENCIES} />
                </div>
                {form.frequency === "EVERY_N_DAYS" ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Show again after (days)</p>
                    <input type="number" min={1} max={365} value={form.repeatDays} onChange={(e) => setForm({ ...form, repeatDays: Number(e.target.value) })} className="input w-full" />
                  </div>
                ) : (
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Appear after (seconds)</p>
                    <input type="number" min={0} max={120} value={form.delaySeconds} onChange={(e) => setForm({ ...form, delaySeconds: Number(e.target.value) })} className="input w-full" />
                  </div>
                )}
              </div>
              {form.frequency === "EVERY_N_DAYS" && (
                <div className="sm:w-1/2">
                  <p className="mb-1 text-xs font-medium text-neutral-500">Appear after (seconds)</p>
                  <input type="number" min={0} max={120} value={form.delaySeconds} onChange={(e) => setForm({ ...form, delaySeconds: Number(e.target.value) })} className="input w-full" />
                </div>
              )}
              <p className="-mt-2 text-xs text-neutral-400">If you change the image or settings of a pop-up, people who already closed it will see it again.</p>

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
              <p className="-mt-2 text-xs text-neutral-400">The pop-up stays on through the whole end date.</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Sort Order</p>
                  <input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className="input w-full" />
                  <p className="mt-1 text-xs text-neutral-400">Lower number is shown first.</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Status</p>
                  <Dropdown value={form.status} onChange={(v) => setForm({ ...form, status: v as "ACTIVE" | "INACTIVE" })} options={[{ key: "ACTIVE", label: "Active" }, { key: "INACTIVE", label: "Inactive" }]} />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={saving || !form.image || !form.name.trim()} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  {saving ? <LoadingDots>Saving</LoadingDots> : editingId ? "Save Changes" : "Create Pop-up"}
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
              <p className="text-base font-semibold text-neutral-900">Delete Pop-up</p>
              <button type="button" onClick={() => setDeleteTarget(null)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={deleteTarget.image} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
                <p className="text-sm text-neutral-600">Delete &quot;{deleteTarget.name}&quot;? This cannot be undone.</p>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <button type="button" onClick={confirmDelete} disabled={deleting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                  {deleting ? <LoadingDots>Deleting</LoadingDots> : "Delete"}
                </button>
                <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
