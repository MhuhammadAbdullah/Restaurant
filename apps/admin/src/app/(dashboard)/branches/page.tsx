"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useMe, hasPermission } from "../../../lib/useMe";
import { StatusToggle } from "../../../components/StatusToggle";
import { EditIcon, TrashIcon, PinIcon, SearchIcon, CloseIcon } from "../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

/** Surfaces the specific field that failed Zod validation instead of the generic "Request validation failed". */
function describeApiError(e: ApiError): string {
  const fieldErrors = (e.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
  if (fieldErrors) {
    const first = Object.entries(fieldErrors).find(([, msgs]) => msgs.length > 0);
    if (first) return `${first[0]}: ${first[1][0]}`;
  }
  return e.message;
}

type Branch = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string;
  area: string;
  mapUrl: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  openingTime: string;
  closingTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  deliveryRadiusKm: number;
  deliveryFee: number;
  minimumOrder: number;
  estimatedDeliveryMins: number;
  status: "ACTIVE" | "INACTIVE" | "TEMPORARILY_CLOSED";
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  dineInEnabled: boolean;
};

type AreaCatalogEntry = { id: string; city: string; name: string; isActive: boolean };
type DeliveryAreaLink = { id: string; branchId: string; areaId: string; isActive: boolean; area: AreaCatalogEntry };

const EMPTY_FORM = {
  name: "",
  code: "",
  phone: "",
  email: "",
  address: "",
  city: "Karachi",
  area: "",
  mapUrl: "",
  latitude: "",
  longitude: "",
  openingTime: "11:00",
  closingTime: "23:00",
  breakStart: "",
  breakEnd: "",
  deliveryRadiusKm: "5",
  deliveryFee: "100",
  minimumOrder: "500",
  estimatedDeliveryMins: "45",
  deliveryEnabled: true,
  pickupEnabled: true,
  dineInEnabled: true,
};
type FormState = typeof EMPTY_FORM;

function branchToForm(b: Branch): FormState {
  return {
    name: b.name,
    code: b.code,
    phone: b.phone ?? "",
    email: b.email ?? "",
    address: b.address ?? "",
    city: b.city,
    area: b.area,
    mapUrl: b.mapUrl ?? "",
    latitude: b.latitude != null ? String(b.latitude) : "",
    longitude: b.longitude != null ? String(b.longitude) : "",
    openingTime: b.openingTime,
    closingTime: b.closingTime,
    breakStart: b.breakStart ?? "",
    breakEnd: b.breakEnd ?? "",
    deliveryRadiusKm: String(b.deliveryRadiusKm),
    deliveryFee: String(b.deliveryFee / 100),
    minimumOrder: String(b.minimumOrder / 100),
    estimatedDeliveryMins: String(b.estimatedDeliveryMins),
    deliveryEnabled: b.deliveryEnabled,
    pickupEnabled: b.pickupEnabled,
    dineInEnabled: b.dineInEnabled,
  };
}

const TABS = [
  { key: "branches", label: "Branches" },
  { key: "areas", label: "Delivery Areas" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function BranchesPage() {
  const [tab, setTab] = useState<TabKey>("branches");
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "branches.create");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Branches</h1>
        <div className="flex rounded-lg border border-neutral-300 p-0.5 text-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3.5 py-1.5 font-medium transition ${tab === t.key ? "bg-brand-red text-white" : "text-neutral-500 hover:text-neutral-900"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "branches" ? <BranchesTab canCreate={canCreate} /> : <DeliveryAreasCatalogTab />}

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

function BranchesTab({ canCreate }: { canCreate: boolean }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canEdit = hasPermission(me, "branches.edit");
  const canDelete = hasPermission(me, "branches.delete");

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches") });

  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [areasBranch, setAreasBranch] = useState<Branch | null>(null);

  async function toggleStatus(branch: Branch) {
    const status = branch.status === "ACTIVE" ? "TEMPORARILY_CLOSED" : "ACTIVE";
    await api.patch(`/branches/${branch.id}`, { status });
    await queryClient.invalidateQueries({ queryKey: ["branches"] });
  }

  async function deleteBranch(branch: Branch) {
    if (!confirm(`Delete "${branch.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/branches/${branch.id}`);
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete branch");
    }
  }

  return (
    <>
      <div className="mt-4 flex justify-end">
        {canCreate && (
          <button onClick={() => setShowCreateModal(true)} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
            + New Branch
          </button>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">City/Area</th>
              <th className="px-4 py-2">Hours</th>
              <th className="px-4 py-2">Capabilities</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {branches?.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2 font-medium">{b.name}</td>
                <td className="px-4 py-2">{b.code}</td>
                <td className="px-4 py-2">{b.area}, {b.city}</td>
                <td className="px-4 py-2">{b.openingTime}–{b.closingTime}</td>
                <td className="px-4 py-2 text-xs text-neutral-500">
                  {[b.deliveryEnabled && "Delivery", b.pickupEnabled && "Pickup", b.dineInEnabled && "Dine-in"].filter(Boolean).join(" · ")}
                </td>
                <td className="px-4 py-2">
                  {canEdit ? (
                    <StatusToggle active={b.status === "ACTIVE"} onClick={() => toggleStatus(b)} />
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${b.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}>
                      {b.status.replace(/_/g, " ")}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <button onClick={() => setAreasBranch(b)} title="Delivery Areas" className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-brand-red">
                        <PinIcon size={14} /> Delivery Areas
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => setEditingBranch(b)} title="Edit" aria-label="Edit branch" className="text-neutral-400 hover:text-brand-red">
                        <EditIcon size={16} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => deleteBranch(b)} title="Delete" aria-label="Delete branch" className="text-neutral-400 hover:text-red-600">
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {branches?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-neutral-400">No branches yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(showCreateModal || editingBranch) && (
        <BranchFormModal
          branch={editingBranch}
          onClose={() => {
            setShowCreateModal(false);
            setEditingBranch(null);
          }}
        />
      )}

      {areasBranch && <DeliveryAreaAssignModal branch={areasBranch} onClose={() => setAreasBranch(null)} />}
    </>
  );
}

function BranchFormModal({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = !!branch;
  const [form, setForm] = useState<FormState>(branch ? branchToForm(branch) : EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.openingTime || !form.closingTime) {
      toast.error("Opening and closing time are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        code: form.code,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        city: form.city,
        area: form.area,
        mapUrl: form.mapUrl || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        openingTime: form.openingTime,
        closingTime: form.closingTime,
        breakStart: form.breakStart || undefined,
        breakEnd: form.breakEnd || undefined,
        deliveryRadiusKm: Number(form.deliveryRadiusKm),
        deliveryFee: Math.round(Number(form.deliveryFee) * 100),
        minimumOrder: Math.round(Number(form.minimumOrder) * 100),
        estimatedDeliveryMins: Number(form.estimatedDeliveryMins),
        deliveryEnabled: form.deliveryEnabled,
        pickupEnabled: form.pickupEnabled,
        dineInEnabled: form.dineInEnabled,
      };
      if (isEdit) {
        await api.patch(`/branches/${branch.id}`, payload);
      } else {
        await api.post("/branches", payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success(isEdit ? "Branch updated." : "Branch created.");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? describeApiError(e) : "Could not save branch");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">{isEdit ? `Edit ${branch.name}` : "New Branch"}</p>
          <button onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
        </div>

        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Basics</p>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Branch Name" value={form.name} onChange={(e) => set("name", e.target.value)} className="input" required />
                <input placeholder="Code (e.g. DHA)" value={form.code} onChange={(e) => set("code", e.target.value)} className="input" required />
                <input placeholder="City" value={form.city} onChange={(e) => set("city", e.target.value)} className="input" required />
                <input placeholder="Area" value={form.area} onChange={(e) => set("area", e.target.value)} className="input" required />
                <label className="text-xs text-neutral-500">
                  Opening Time
                  <input type="time" value={form.openingTime} onChange={(e) => set("openingTime", e.target.value)} className="input mt-1 w-full" required />
                </label>
                <label className="text-xs text-neutral-500">
                  Closing Time
                  <input type="time" value={form.closingTime} onChange={(e) => set("closingTime", e.target.value)} className="input mt-1 w-full" required />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Contact & Address</p>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="input" />
                <input placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} className="input" />
                <input placeholder="Full Address" value={form.address} onChange={(e) => set("address", e.target.value)} className="input col-span-2" />
                <input
                  placeholder="Location URL (paste a Google Maps link)"
                  value={form.mapUrl}
                  onChange={(e) => set("mapUrl", e.target.value)}
                  className="input col-span-2"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude (optional)"
                  value={form.latitude}
                  onChange={(e) => set("latitude", e.target.value)}
                  className="input"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude (optional)"
                  value={form.longitude}
                  onChange={(e) => set("longitude", e.target.value)}
                  className="input"
                />
              </div>
              <p className="mt-1 text-[11px] text-neutral-400">
                Paste the branch's Google Maps link, and coordinates are picked up automatically. Or type Latitude/Longitude directly if you already have
                them; typed coordinates always take priority over the map link. Either way, these are what "Use Current Location" matches against to find
                the nearest branch.
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Hours & Break</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-neutral-500">
                  Break Start (optional)
                  <input type="time" value={form.breakStart} onChange={(e) => set("breakStart", e.target.value)} className="input mt-1 w-full" />
                </label>
                <label className="text-xs text-neutral-500">
                  Break End (optional)
                  <input type="time" value={form.breakEnd} onChange={(e) => set("breakEnd", e.target.value)} className="input mt-1 w-full" />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Delivery Settings</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-neutral-500">
                  Delivery Radius (km)
                  <input type="number" min="0" step="0.5" value={form.deliveryRadiusKm} onChange={(e) => set("deliveryRadiusKm", e.target.value)} className="input mt-1 w-full" />
                </label>
                <label className="text-xs text-neutral-500">
                  Estimated Delivery (mins)
                  <input type="number" min="0" value={form.estimatedDeliveryMins} onChange={(e) => set("estimatedDeliveryMins", e.target.value)} className="input mt-1 w-full" />
                </label>
                <label className="text-xs text-neutral-500">
                  Delivery Fee (Rs.)
                  <input type="number" min="0" value={form.deliveryFee} onChange={(e) => set("deliveryFee", e.target.value)} className="input mt-1 w-full" />
                </label>
                <label className="text-xs text-neutral-500">
                  Minimum Order (Rs.)
                  <input type="number" min="0" value={form.minimumOrder} onChange={(e) => set("minimumOrder", e.target.value)} className="input mt-1 w-full" />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Order Types Available</p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-1.5 text-sm text-neutral-700">
                  <input type="checkbox" checked={form.deliveryEnabled} onChange={(e) => set("deliveryEnabled", e.target.checked)} /> Delivery
                </label>
                <label className="flex items-center gap-1.5 text-sm text-neutral-700">
                  <input type="checkbox" checked={form.pickupEnabled} onChange={(e) => set("pickupEnabled", e.target.checked)} /> Pickup
                </label>
                <label className="flex items-center gap-1.5 text-sm text-neutral-700">
                  <input type="checkbox" checked={form.dineInEnabled} onChange={(e) => set("dineInEnabled", e.target.checked)} /> Dine-in
                </label>
              </div>
            </div>

          </div>
        </form>

        <div className="shrink-0 border-t border-neutral-200 p-4">
          <button onClick={submit} disabled={saving} className="w-full rounded-lg bg-brand-red py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Branch"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Search the shared area catalog (scoped to this branch's city) and toggle which ones this branch serves. */
function DeliveryAreaAssignModal({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: catalog } = useQuery({
    queryKey: ["area-catalog", branch.city],
    queryFn: () => api.get<AreaCatalogEntry[]>(`/branches/area-catalog?city=${encodeURIComponent(branch.city)}`),
  });
  const { data: links } = useQuery({
    queryKey: ["branch-delivery-areas", branch.id],
    queryFn: () => api.get<DeliveryAreaLink[]>(`/branches/${branch.id}/delivery-areas`),
  });

  const linkByAreaId = useMemo(() => new Map((links ?? []).map((l) => [l.areaId, l])), [links]);
  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = catalog ?? [];
    return q ? list.filter((a) => a.name.toLowerCase().includes(q)) : list;
  }, [catalog, search]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["branch-delivery-areas", branch.id] });
    await queryClient.invalidateQueries({ queryKey: ["branches"] });
  }

  async function toggleAssignment(area: AreaCatalogEntry) {
    const link = linkByAreaId.get(area.id);
    setBusy(area.id);
    try {
      if (!link) {
        await api.post(`/branches/${branch.id}/delivery-areas`, { areaId: area.id });
      } else {
        await api.patch(`/branches/${branch.id}/delivery-areas/${link.id}`, { isActive: !link.isActive });
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update delivery area");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div>
            <p className="text-base font-semibold text-neutral-900">Delivery Areas: {branch.name}</p>
            <p className="text-xs text-neutral-500">Search and select which {branch.city} areas this branch serves.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          <div className="relative">
            <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${branch.city} areas...`}
              className="input w-full pl-9"
            />
          </div>

          {catalog && catalog.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No delivery areas exist for {branch.city} yet. Add some first in the <span className="font-medium">Delivery Areas</span> tab.
            </p>
          ) : (
            <div className="space-y-1">
              {filteredCatalog.map((a) => {
                const link = linkByAreaId.get(a.id);
                const assigned = link?.isActive ?? false;
                return (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                      assigned ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    <span className={assigned ? "font-medium text-brand-red" : "text-neutral-700"}>
                      {a.name} {!a.isActive && <span className="text-xs text-neutral-400">(catalog inactive)</span>}
                    </span>
                    <input
                      type="checkbox"
                      checked={assigned}
                      onChange={() => toggleAssignment(a)}
                      disabled={busy === a.id}
                      className="h-4 w-4 accent-brand-red"
                    />
                  </label>
                );
              })}
              {filteredCatalog.length === 0 && catalog && catalog.length > 0 && (
                <p className="py-4 text-center text-sm text-neutral-400">No areas match "{search}"</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryAreasCatalogTab() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canEdit = hasPermission(me, "branches.edit");
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches") });
  const cities = useMemo(() => Array.from(new Set((branches ?? []).map((b) => b.city))), [branches]);

  const [cityFilter, setCityFilter] = useState("");
  const { data: catalog } = useQuery({
    queryKey: ["area-catalog", "all", cityFilter],
    queryFn: () => api.get<AreaCatalogEntry[]>(`/branches/area-catalog${cityFilter ? `?city=${encodeURIComponent(cityFilter)}` : ""}`),
  });

  const [newCity, setNewCity] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!newCity && cities.length > 0) setNewCity(cities[0]!);
  }, [cities, newCity]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["area-catalog"] });
  }

  async function addArea(e: React.FormEvent) {
    e.preventDefault();
    if (!newCity.trim() || !newName.trim()) return;
    setBusy(true);
    try {
      await api.post("/branches/area-catalog", { city: newCity.trim(), name: newName.trim() });
      setNewName("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add area");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(area: AreaCatalogEntry) {
    setBusy(true);
    try {
      await api.patch(`/branches/area-catalog/${area.id}`, { isActive: !area.isActive });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update area");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(area: AreaCatalogEntry) {
    setEditingId(area.id);
    setEditingName(area.name);
  }

  async function saveEdit(area: AreaCatalogEntry) {
    if (!editingName.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/branches/area-catalog/${area.id}`, { name: editingName.trim() });
      setEditingId(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not rename area");
    } finally {
      setBusy(false);
    }
  }

  async function deleteArea(area: AreaCatalogEntry) {
    if (!confirm(`Delete "${area.name}"? This removes it from every branch that serves it.`)) return;
    setBusy(true);
    try {
      await api.delete(`/branches/area-catalog/${area.id}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete area");
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, AreaCatalogEntry[]>();
    for (const a of catalog ?? []) {
      const list = map.get(a.city) ?? [];
      list.push(a);
      map.set(a.city, list);
    }
    return Array.from(map.entries());
  }, [catalog]);

  return (
    <div className="mt-4">
      <p className="text-sm text-neutral-500">
        Manage the shared list of delivery neighbourhoods. Only active areas show on the website's location picker, and only for branches you've
        assigned them to (via each branch's "Delivery Areas" action).
      </p>

      {canEdit && (
        <form onSubmit={addArea} className="mt-3 flex flex-wrap gap-2 rounded-xl border border-dashed border-neutral-300 p-3">
          <Select value={newCity || undefined} onValueChange={setNewCity}>
            <SelectTrigger className="w-40"><SelectValue placeholder="No branches yet" /></SelectTrigger>
            <SelectContent>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Area name, e.g. Clifton" className="input flex-1" />
          <button disabled={busy || !newCity} className="rounded-lg bg-brand-red px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            + Add Area
          </button>
        </form>
      )}

      <div className="mt-3">
        <Select value={cityFilter || "all"} onValueChange={(v) => setCityFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cities</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 space-y-5">
        {grouped.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No delivery areas yet. Add one above.</p>}
        {grouped.map(([city, areas]) => (
          <div key={city}>
            <p className="mb-1.5 text-xs font-semibold uppercase text-neutral-500">{city} ({areas.length})</p>
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {areas.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-2">
                        {editingId === a.id ? (
                          <input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), saveEdit(a))}
                            className="input"
                            autoFocus
                          />
                        ) : (
                          a.name
                        )}
                      </td>
                      <td className="w-24 px-4 py-2">{canEdit && <StatusToggle active={a.isActive} onClick={() => toggleActive(a)} disabled={busy} />}</td>
                      <td className="w-24 px-4 py-2">
                        {canEdit && (
                          <div className="flex items-center gap-3">
                            {editingId === a.id ? (
                              <>
                                <button onClick={() => saveEdit(a)} disabled={busy} className="text-xs font-medium text-brand-red">Save</button>
                                <button onClick={() => setEditingId(null)} aria-label="Cancel" className="text-neutral-400 hover:text-neutral-600">
                                  <CloseIcon size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(a)} aria-label="Rename" className="text-neutral-400 hover:text-brand-red">
                                  <EditIcon size={15} />
                                </button>
                                <button onClick={() => deleteArea(a)} aria-label="Delete" className="text-neutral-400 hover:text-red-600">
                                  <TrashIcon size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
