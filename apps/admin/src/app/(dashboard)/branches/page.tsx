"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaClock, FaLocationDot, FaPhone } from "react-icons/fa6";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useMe, hasPermission } from "../../../lib/useMe";
import { StatusToggle } from "../../../components/StatusToggle";
import { DeliveryAreasTab } from "../../../components/branches/DeliveryAreasTab";
import { SearchInput } from "../../../components/SearchFilterBar";
import { EditIcon, TrashIcon, PinIcon, CloseIcon } from "../../../components/icons";
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

const MapLoading = () => <div className="flex h-72 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm text-neutral-400">Loading map...</div>;
const LocationMap = dynamic(() => import("../../../components/maps/BranchMaps").then((m) => m.LocationMap), { ssr: false, loading: MapLoading });
const CoverageMap = dynamic(() => import("../../../components/maps/BranchMaps").then((m) => m.CoverageMap), { ssr: false, loading: MapLoading });

type BranchStatus = "ACTIVE" | "INACTIVE" | "TEMPORARILY_CLOSED";
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
  status: BranchStatus;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  dineInEnabled: boolean;
};

type AreaCatalogEntry = { id: string; city: string; name: string; isActive: boolean };
type DeliveryAreaLink = { id: string; branchId: string; areaId: string; isActive: boolean; area: AreaCatalogEntry };

const STATUS_META: Record<BranchStatus, { label: string; badge: string }> = {
  ACTIVE: { label: "Active", badge: "bg-green-50 text-green-700" },
  TEMPORARILY_CLOSED: { label: "Temporarily closed", badge: "bg-amber-50 text-amber-700" },
  INACTIVE: { label: "Inactive", badge: "bg-neutral-100 text-neutral-500" },
};

const EMPTY_FORM = {
  name: "",
  code: "",
  phone: "",
  email: "",
  address: "",
  city: "",
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

function to12h(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
/** Is the branch inside its opening hours (and outside the break) right now? Handles after-midnight closing. */
function isOpenNow(b: Branch): boolean {
  if (b.status !== "ACTIVE") return false;
  const now = new Date();
  const t = now.getHours() * 60 + now.getMinutes();
  const o = mins(b.openingTime);
  const c = mins(b.closingTime);
  const inside = o <= c ? t >= o && t < c : t >= o || t < c;
  if (!inside) return false;
  if (b.breakStart && b.breakEnd) {
    const bs = mins(b.breakStart);
    const be = mins(b.breakEnd);
    const inBreak = bs <= be ? t >= bs && t < be : t >= bs || t < be;
    if (inBreak) return false;
  }
  return true;
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

function ConfirmModal({ title, body, confirmLabel, busy, onConfirm, onClose }: { title: string; body: React.ReactNode; confirmLabel: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
        </div>
        <div className="p-5">
          <div className="text-sm text-neutral-600">{body}</div>
          <div className="mt-5 flex items-center gap-3">
            <button type="button" onClick={onConfirm} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
              {busy ? "Working..." : confirmLabel}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
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
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Branches</h1>
          <p className="mt-1 text-sm text-neutral-500">Your locations, their opening hours and delivery settings, and the areas each one delivers to.</p>
        </div>
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

      {tab === "branches" ? <BranchesTab canCreate={canCreate} onOpenAreas={() => setTab("areas")} /> : <DeliveryAreasTab />}

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

function BranchesTab({ canCreate, onOpenAreas }: { canCreate: boolean; onOpenAreas: () => void }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canEdit = hasPermission(me, "branches.edit");
  const canDelete = hasPermission(me, "branches.delete");

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches") });

  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [areasBranch, setAreasBranch] = useState<Branch | null>(null);
  const [showCoverage, setShowCoverage] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const all = branches ?? [];
  const cities = useMemo(() => Array.from(new Set(all.map((b) => b.city))).sort(), [all]);
  const filtered = all.filter((b) => {
    const q = search.trim().toLowerCase();
    if (q && !`${b.name} ${b.code} ${b.area} ${b.city} ${b.phone ?? ""}`.toLowerCase().includes(q)) return false;
    if (cityFilter && b.city !== cityFilter) return false;
    if (statusFilter && b.status !== statusFilter) return false;
    return true;
  });
  const isFiltering = search.trim() !== "" || cityFilter !== "" || statusFilter !== "";

  async function setStatus(branch: Branch, status: BranchStatus) {
    try {
      await api.patch(`/branches/${branch.id}`, { status });
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update branch");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/branches/${deleteTarget.id}`);
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete branch");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Branches", all.length],
          ["Open now", all.filter(isOpenNow).length],
          ["Cities", cities.length],
          ["Closed / inactive", all.filter((b) => b.status !== "ACTIVE").length],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-xl font-semibold text-neutral-900">{n}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, area, phone..." />
          {cities.length > 1 && (
            <Select value={cityFilter || "all"} onValueChange={(v) => setCityFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_META) as BranchStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isFiltering && (
            <button onClick={() => { setSearch(""); setCityFilter(""); setStatusFilter(""); }} className="text-sm font-medium text-brand-red hover:underline">Clear filters</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCoverage(true)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            Coverage map
          </button>
          {canCreate && (
            <button onClick={() => setShowCreateModal(true)} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
              + New Branch
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((b) => {
          const open = isOpenNow(b);
          const meta = STATUS_META[b.status];
          const types = [b.deliveryEnabled && "Delivery", b.pickupEnabled && "Pickup", b.dineInEnabled && "Dine-in"].filter(Boolean) as string[];
          return (
            <div key={b.id} className={`flex flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${b.status === "INACTIVE" ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-neutral-900">{b.name}</p>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-600">{b.code}</span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500"><PinIcon size={12} />{b.area}, {b.city}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>{meta.label}</span>
                  {b.status === "ACTIVE" && (
                    <span className={`flex items-center gap-1 text-[10px] font-medium ${open ? "text-green-700" : "text-neutral-400"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-green-500" : "bg-neutral-300"}`} />
                      {open ? "Open now" : "Closed now"}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-neutral-600">
                <p className="flex items-center gap-2">
                  <FaClock size={12} className="shrink-0 text-neutral-400" />
                  <span>{to12h(b.openingTime)} – {to12h(b.closingTime)}{b.breakStart && b.breakEnd ? ` · break ${to12h(b.breakStart)}–${to12h(b.breakEnd)}` : ""}</span>
                </p>
                {b.phone && (
                  <p className="flex items-center gap-2">
                    <FaPhone size={12} className="shrink-0 text-neutral-400" />
                    <span>{b.phone}</span>
                  </p>
                )}
                {b.address && (
                  <p className="flex items-center gap-2" title={b.address}>
                    <FaLocationDot size={12} className="shrink-0 text-neutral-400" />
                    <span className="truncate">{b.address}</span>
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                {types.map((t) => (
                  <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">{t}</span>
                ))}
                {types.length === 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">No order types enabled</span>}
              </div>
              {b.deliveryEnabled && (
                <p className="mt-2 text-[11px] text-neutral-400">
                  Delivery {formatPaisa(b.deliveryFee)} · min order {formatPaisa(b.minimumOrder)} · ~{b.estimatedDeliveryMins} min · {b.deliveryRadiusKm} km radius
                  {b.latitude == null || b.longitude == null ? <span className="ml-1 font-medium text-amber-600">· no map pin</span> : null}
                </p>
              )}

              <div className="mt-auto pt-4" />
              <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                {canEdit ? (
                  <Select value={b.status} onValueChange={(v) => setStatus(b, v as BranchStatus)}>
                    <SelectTrigger className="h-auto w-44 py-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_META) as BranchStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-3 text-xs">
                  {canEdit && b.deliveryEnabled && (
                    <button onClick={() => setAreasBranch(b)} className="flex items-center gap-1 font-medium text-neutral-500 hover:text-brand-red">
                      <PinIcon size={13} /> Areas
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={() => setEditingBranch(b)} aria-label="Edit branch" className="flex items-center gap-1 text-neutral-500 hover:text-brand-red">
                      <EditIcon size={14} /> Edit
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => setDeleteTarget(b)} aria-label="Delete branch" className="text-neutral-400 hover:text-red-600">
                      <TrashIcon size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {all.length === 0 && branches && <p className="col-span-full rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">No branches yet. {canCreate && "Click “New Branch” to add your first one."}</p>}
        {all.length > 0 && filtered.length === 0 && <p className="col-span-full rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">No branches match your filters.</p>}
      </div>

      {(showCreateModal || editingBranch) && (
        <BranchFormModal
          branch={editingBranch}
          cities={cities}
          existingCodes={all.filter((b) => b.id !== editingBranch?.id).map((b) => b.code.toLowerCase())}
          otherBranches={all.filter((b) => b.id !== editingBranch?.id)}
          onClose={() => {
            setShowCreateModal(false);
            setEditingBranch(null);
          }}
        />
      )}

      {showCoverage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <div>
                <p className="text-base font-semibold text-neutral-900">Delivery coverage</p>
                <p className="text-xs text-neutral-500">Each red circle is a branch&apos;s delivery radius. Branches with delivery off are shown as a pin only.</p>
              </div>
              <button type="button" onClick={() => setShowCoverage(false)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
            </div>
            <div className="p-4">
              <CoverageMap
                branches={all
                  .filter((b) => b.latitude != null && b.longitude != null)
                  .map((b) => ({ id: b.id, name: b.name, code: b.code, lat: Number(b.latitude), lng: Number(b.longitude), radiusKm: Number(b.deliveryRadiusKm), delivery: b.deliveryEnabled }))}
              />
              {all.some((b) => b.latitude == null || b.longitude == null) && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  No map pin yet: {all.filter((b) => b.latitude == null || b.longitude == null).map((b) => b.name).join(", ")}. Edit the branch and place its pin.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {areasBranch && <DeliveryAreaAssignModal branch={areasBranch} onClose={() => setAreasBranch(null)} onManageCatalog={() => { setAreasBranch(null); onOpenAreas(); }} />}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.name}`}
          body={<>Delete this branch? Its delivery-area assignments are removed too. If it has past orders the system may refuse. In that case set it to <b>Inactive</b> instead. This cannot be undone.</>}
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

function BranchFormModal({ branch, cities, existingCodes, otherBranches, onClose }: { branch: Branch | null; cities: string[]; existingCodes: string[]; otherBranches: Branch[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = !!branch;
  const [form, setForm] = useState<FormState>(branch ? branchToForm(branch) : { ...EMPTY_FORM, city: cities[0] ?? "" });
  const [codeTouched, setCodeTouched] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      // suggest a code from the name until the admin types their own
      code: codeTouched ? f.code : name.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 6).toUpperCase(),
    }));
  }

  const mapLat = form.latitude.trim() !== "" && Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null;
  const mapLng = form.longitude.trim() !== "" && Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null;
  const radiusKm = Number.isFinite(Number(form.deliveryRadiusKm)) ? Math.max(0, Number(form.deliveryRadiusKm)) : 0;
  const otherPins = otherBranches
    .filter((b) => b.latitude != null && b.longitude != null)
    .map((b) => ({ id: b.id, name: b.name, lat: Number(b.latitude), lng: Number(b.longitude), radiusKm: Number(b.deliveryRadiusKm) }));

  const errors = {
    code: form.code && existingCodes.includes(form.code.trim().toLowerCase()) ? "This code is already used by another branch" : null,
    email: form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()) ? "Enter a valid email address" : null,
    lat: form.latitude && !(Number(form.latitude) >= -90 && Number(form.latitude) <= 90) ? "Latitude must be between -90 and 90" : null,
    lng: form.longitude && !(Number(form.longitude) >= -180 && Number(form.longitude) <= 180) ? "Longitude must be between -180 and 180" : null,
    coords: (form.latitude && !form.longitude) || (!form.latitude && form.longitude) ? "Enter both latitude and longitude, or neither" : null,
    breakPair: (form.breakStart && !form.breakEnd) || (!form.breakStart && form.breakEnd) ? "Set both break start and break end, or leave both empty" : null,
    map: form.mapUrl.trim() && !/^https?:\/\//i.test(form.mapUrl.trim()) ? "Paste the full link, starting with https://" : null,
    radius: form.deliveryEnabled && !(radiusKm > 0) ? "Set a delivery radius greater than 0 km" : null,
    types: !form.deliveryEnabled && !form.pickupEnabled && !form.dineInEnabled ? "Turn on at least one order type" : null,
  };
  const firstError = Object.values(errors).find(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (firstError) {
      toast.error(firstError);
      return;
    }
    if (!form.openingTime || !form.closingTime) {
      toast.error("Opening and closing time are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim(),
        area: form.area.trim(),
        mapUrl: form.mapUrl.trim() || undefined,
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

  const Err = ({ text }: { text: string | null }) => (text ? <p className="mt-1 text-xs text-red-600">{text}</p> : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">{isEdit ? `Edit ${branch.name}` : "New Branch"}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
        </div>

        <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
            <SectionTitle n={1} title="Basic details" hint="Name and where the branch is." />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Branch name *</p>
                <input placeholder="e.g. DHA Branch" value={form.name} onChange={(e) => onNameChange(e.target.value)} className="input w-full" required />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Short code *</p>
                <input
                  placeholder="e.g. DHA"
                  value={form.code}
                  onChange={(e) => {
                    setCodeTouched(true);
                    set("code", e.target.value.toUpperCase().replace(/\s+/g, ""));
                  }}
                  className={`input w-full font-mono uppercase ${errors.code ? "!border-red-400" : ""}`}
                  required
                />
                <Err text={errors.code} />
                {!errors.code && <p className="mt-1 text-xs text-neutral-400">Used on orders and reports. Unique per branch.</p>}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">City *</p>
                <input list="branch-cities" placeholder="e.g. Karachi" value={form.city} onChange={(e) => set("city", e.target.value)} className="input w-full" required />
                <datalist id="branch-cities">
                  {cities.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Area / neighbourhood *</p>
                <input placeholder="e.g. DHA Phase 6" value={form.area} onChange={(e) => set("area", e.target.value)} className="input w-full" required />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
            <SectionTitle n={2} title="Contact & location" hint="Shown to customers on the website footer and location picker." />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Phone</p>
                <input type="tel" placeholder="+92 300 1234567" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="input w-full" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Email</p>
                <input placeholder="branch@restaurant.com" value={form.email} onChange={(e) => set("email", e.target.value)} className={`input w-full ${errors.email ? "!border-red-400" : ""}`} />
                <Err text={errors.email} />
              </div>
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-medium text-neutral-500">Full address</p>
                <input placeholder="Shop 12, Main Boulevard, DHA Phase 6, Karachi" value={form.address} onChange={(e) => set("address", e.target.value)} className="input w-full" />
              </div>
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-medium text-neutral-500">Google Maps link</p>
                <input placeholder="https://maps.google.com/..." value={form.mapUrl} onChange={(e) => set("mapUrl", e.target.value)} className={`input w-full ${errors.map ? "!border-red-400" : ""}`} />
                <Err text={errors.map} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Latitude (optional)</p>
                <input type="number" step="any" placeholder="24.8607" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} className={`input w-full ${errors.lat ? "!border-red-400" : ""}`} />
                <Err text={errors.lat} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Longitude (optional)</p>
                <input type="number" step="any" placeholder="67.0011" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} className={`input w-full ${errors.lng ? "!border-red-400" : ""}`} />
                <Err text={errors.lng} />
              </div>
            </div>
            <Err text={errors.coords} />
            <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              Paste the Google Maps link and the coordinates are picked up automatically. Typed coordinates always win over the link. They are used by
              “Use current location” to find the nearest branch.
            </p>

            <div className="border-t border-neutral-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Pin the branch on the map</p>
              <LocationMap
                lat={mapLat}
                lng={mapLng}
                radiusKm={radiusKm}
                showRadius={form.deliveryEnabled}
                onMove={(la, ln) => setForm((f) => ({ ...f, latitude: la.toFixed(6), longitude: ln.toFixed(6) }))}
                others={otherPins}
              />
              {form.deliveryEnabled && (
                <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-neutral-700">Delivery radius</p>
                    <div className="flex items-center gap-1.5 text-sm">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={form.deliveryRadiusKm}
                        onChange={(e) => set("deliveryRadiusKm", e.target.value)}
                        className="input w-20 py-1 text-right"
                        aria-label="Delivery radius in km"
                      />
                      <span className="text-neutral-500">km</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={Math.min(30, Math.max(0.5, radiusKm || 0.5))}
                    onChange={(e) => set("deliveryRadiusKm", e.target.value)}
                    className="mt-2 w-full accent-[#ED2320]"
                    aria-label="Delivery radius slider"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-400"><span>0.5 km</span><span>15 km</span><span>30 km</span></div>
                  <p className="mt-2 text-xs text-neutral-500">
                    {mapLat == null
                      ? "Place the pin to see the delivery circle."
                      : `Customers within ${radiusKm || 0} km of the pin (about ${Math.round(Math.PI * radiusKm * radiusKm).toLocaleString()} km²) can order delivery, even if their area isn't in the list.`}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
            <SectionTitle n={3} title="Opening hours" hint="Closing time can be after midnight, e.g. 2:00 AM." />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="text-xs font-medium text-neutral-500">Opens *
                <input type="time" value={form.openingTime} onChange={(e) => set("openingTime", e.target.value)} className="input mt-1 w-full" required />
              </label>
              <label className="text-xs font-medium text-neutral-500">Closes *
                <input type="time" value={form.closingTime} onChange={(e) => set("closingTime", e.target.value)} className="input mt-1 w-full" required />
              </label>
              <label className="text-xs font-medium text-neutral-500">Break starts
                <input type="time" value={form.breakStart} onChange={(e) => set("breakStart", e.target.value)} className="input mt-1 w-full" />
              </label>
              <label className="text-xs font-medium text-neutral-500">Break ends
                <input type="time" value={form.breakEnd} onChange={(e) => set("breakEnd", e.target.value)} className="input mt-1 w-full" />
              </label>
            </div>
            <Err text={errors.breakPair} />
            {form.openingTime && form.closingTime && (
              <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Open {to12h(form.openingTime)} to {to12h(form.closingTime)}
                {mins(form.closingTime) <= mins(form.openingTime) ? " (next day)" : ""}
                {form.breakStart && form.breakEnd ? `, closed for a break ${to12h(form.breakStart)} to ${to12h(form.breakEnd)}` : ""}.
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
            <SectionTitle n={4} title="Order types" hint="What customers can order from this branch." />
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["deliveryEnabled", "Delivery", "Rider brings the order"],
                  ["pickupEnabled", "Pickup", "Customer collects"],
                  ["dineInEnabled", "Dine-in", "Eat at the restaurant"],
                ] as ["deliveryEnabled" | "pickupEnabled" | "dineInEnabled", string, string][]
              ).map(([key, label, hint]) => (
                <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${form[key] ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}>
                  <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#ED2320]" />
                  <span>
                    <span className="block text-sm font-medium text-neutral-900">{label}</span>
                    <span className="block text-xs text-neutral-500">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <Err text={errors.types} />
          </section>

          {form.deliveryEnabled && (
            <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
              <SectionTitle n={5} title="Delivery settings" hint="Fee, minimum order and delivery time. The radius is set on the map above." />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <label className="text-xs font-medium text-neutral-500">Fee (Rs.)
                  <input type="number" min="0" value={form.deliveryFee} onChange={(e) => set("deliveryFee", e.target.value)} className="input mt-1 w-full" />
                </label>
                <label className="text-xs font-medium text-neutral-500">Min. order (Rs.)
                  <input type="number" min="0" value={form.minimumOrder} onChange={(e) => set("minimumOrder", e.target.value)} className="input mt-1 w-full" />
                </label>
                <label className="text-xs font-medium text-neutral-500">Est. time (min)
                  <input type="number" min="0" value={form.estimatedDeliveryMins} onChange={(e) => set("estimatedDeliveryMins", e.target.value)} className="input mt-1 w-full" />
                </label>
              </div>
              <p className="text-xs text-neutral-400">
                After saving, use the <b>Areas</b> button on the branch card to choose which neighbourhoods it delivers to.
              </p>
            </section>
          )}

          <div className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 flex items-center gap-3 border-t border-neutral-200 bg-white px-5 py-3">
            <button type="submit" disabled={saving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Branch"}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">Cancel</button>
            {firstError && <span className="ml-auto truncate text-xs text-red-600">{firstError}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}

/** Search the shared area catalog (scoped to this branch's city) and toggle which ones this branch serves. */
function DeliveryAreaAssignModal({ branch, onClose, onManageCatalog }: { branch: Branch; onClose: () => void; onManageCatalog: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

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
  const assignedCount = (catalog ?? []).filter((a) => linkByAreaId.get(a.id)?.isActive).length;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["branch-delivery-areas"] });
    await queryClient.invalidateQueries({ queryKey: ["branches"] });
  }

  async function setAssigned(area: AreaCatalogEntry, on: boolean) {
    const link = linkByAreaId.get(area.id);
    if (!link) {
      if (on) await api.post(`/branches/${branch.id}/delivery-areas`, { areaId: area.id });
    } else if (link.isActive !== on) {
      await api.patch(`/branches/${branch.id}/delivery-areas/${link.id}`, { isActive: on });
    }
  }

  async function toggleAssignment(area: AreaCatalogEntry) {
    setBusy(area.id);
    try {
      await setAssigned(area, !(linkByAreaId.get(area.id)?.isActive ?? false));
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update delivery area");
    } finally {
      setBusy(null);
    }
  }

  async function bulk(on: boolean) {
    const targets = filteredCatalog.filter((a) => a.isActive && (linkByAreaId.get(a.id)?.isActive ?? false) !== on);
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(targets.map((a) => setAssigned(a, on)));
      const failed = results.filter((r) => r.status === "rejected").length;
      await refresh();
      if (failed > 0) toast.error(`${failed} of ${targets.length} could not be updated.`);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div>
            <p className="text-base font-semibold text-neutral-900">Delivery areas: {branch.name}</p>
            <p className="text-xs text-neutral-500">Choose which {branch.city} areas this branch delivers to.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          <SearchInput value={search} onChange={setSearch} placeholder={`Search ${branch.city} areas...`} />

          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-600">{assignedCount} of {catalog?.length ?? 0} areas selected</span>
            <span className="flex items-center gap-3">
              <button type="button" disabled={bulkBusy || filteredCatalog.length === 0} onClick={() => bulk(true)} className="font-medium text-brand-red hover:underline disabled:opacity-50">
                Select {search.trim() ? "shown" : "all"}
              </button>
              <button type="button" disabled={bulkBusy || filteredCatalog.length === 0} onClick={() => bulk(false)} className="font-medium text-neutral-500 hover:underline disabled:opacity-50">
                Clear {search.trim() ? "shown" : "all"}
              </button>
            </span>
          </div>

          {catalog && catalog.length === 0 ? (
            <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">
              No delivery areas exist for {branch.city} yet.{" "}
              <button type="button" onClick={onManageCatalog} className="font-medium underline">Add areas first</button>.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCatalog.map((a) => {
                const assigned = linkByAreaId.get(a.id)?.isActive ?? false;
                return (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${assigned ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}
                  >
                    <span className={assigned ? "font-medium text-brand-red" : "text-neutral-700"}>
                      {a.name} {!a.isActive && <span className="text-xs text-neutral-400">(hidden in catalog)</span>}
                    </span>
                    <input type="checkbox" checked={assigned} onChange={() => toggleAssignment(a)} disabled={busy === a.id || bulkBusy} className="h-4 w-4 accent-[#ED2320]" />
                  </label>
                );
              })}
              {filteredCatalog.length === 0 && catalog && catalog.length > 0 && <p className="py-4 text-center text-sm text-neutral-400">No areas match “{search}”</p>}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-neutral-200 px-5 py-3">
          <button type="button" onClick={onManageCatalog} className="text-xs font-medium text-neutral-500 underline hover:text-brand-red">Manage area list</button>
          <button type="button" onClick={onClose} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">Done</button>
        </div>
      </div>
    </div>
  );
}
