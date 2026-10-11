"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaBriefcase, FaCrosshairs, FaHouse, FaLocationDot, FaPlus, FaRegStar, FaTrashCan, FaXmark } from "react-icons/fa6";
import type { IconType } from "react-icons";
import { api, ApiError } from "../../../lib/api";
import { useLocationStore } from "../../../store/useLocationStore";
import { toast } from "../../../store/useToastStore";
import { SelectField } from "../../../components/SelectField";
import type { Branch } from "../../../lib/types";
import { AddressFormSkeleton, SkeletonAddressCard } from "../../../components/skeletons";

const AddressMap = dynamic(() => import("../../../components/AddressMap").then((m) => m.AddressMap), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-surface-alt" />,
});

type Address = {
  id: string;
  label: string;
  city: string;
  area: string;
  addressLine: string;
  landmark: string | null;
  isDefault: boolean;
};

const DEFAULT_CENTER: [number, number] = [24.8607, 67.0011]; // Karachi

const LABELS: { value: string; icon: IconType }[] = [
  { value: "Home", icon: FaHouse },
  { value: "Work", icon: FaBriefcase },
  { value: "Other", icon: FaLocationDot },
];
const labelIcon = (label: string): IconType => LABELS.find((l) => l.value.toLowerCase() === label.toLowerCase())?.icon ?? FaLocationDot;

export default function AddressesPage() {
  const queryClient = useQueryClient();
  const { data: addresses, isLoading } = useQuery({ queryKey: ["addresses"], queryFn: () => api.get<Address[]>("/customers/me/addresses") });
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["addresses"] });
  }

  async function remove(a: Address) {
    setBusyId(a.id);
    try {
      await api.delete(`/customers/me/addresses/${a.id}`);
      await refresh();
      toast.success("Address removed");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove the address");
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  }

  async function makeDefault(a: Address) {
    setBusyId(a.id);
    try {
      await api.patch(`/customers/me/addresses/${a.id}/default`, {});
      await refresh();
      toast.success("Default address updated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update the default address");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Addresses</h1>
          <p className="mt-0.5 text-sm text-muted">Saved places make checkout faster.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-xl bg-brand-red px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
          <FaPlus size={12} /> Add new address
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {isLoading && Array.from({ length: 2 }).map((_, i) => <SkeletonAddressCard key={i} />)}
        {!isLoading &&
          addresses?.map((a) => {
            const Icon = labelIcon(a.label);
            return (
              <div key={a.id} className={`flex flex-col rounded-2xl border bg-surface p-4 ${a.isDefault ? "border-brand-red" : "border-line"}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{a.label}</p>
                      {a.isDefault && <span className="rounded-full bg-brand-red px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Default</span>}
                    </div>
                    <p className="mt-0.5 break-words text-sm text-ink">{a.addressLine}</p>
                    <p className="text-xs text-muted">
                      {a.area}, {a.city}
                    </p>
                    {a.landmark && <p className="mt-0.5 text-xs text-muted">Near {a.landmark}</p>}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
                  {a.isDefault ? (
                    <span className="text-muted">Used first at checkout</span>
                  ) : (
                    <button onClick={() => makeDefault(a)} disabled={busyId === a.id} className="flex items-center gap-1.5 font-medium text-ink transition hover:text-brand-red disabled:opacity-50">
                      <FaRegStar size={12} /> Set as default
                    </button>
                  )}
                  <button onClick={() => setDeleteTarget(a)} className="flex items-center gap-1.5 font-medium text-muted transition hover:text-red-600">
                    <FaTrashCan size={12} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {!isLoading && addresses?.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
            <FaLocationDot size={22} />
          </span>
          <p className="mt-4 text-base font-semibold text-ink">No saved addresses yet</p>
          <p className="mt-1 text-sm text-muted">Add your home or office address and we will pick it for you at checkout.</p>
          <button onClick={() => setShowForm(true)} className="mt-5 rounded-xl bg-brand-red px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
            Add your first address
          </button>
        </div>
      )}

      {showForm && <AddNewAddressModal onClose={() => setShowForm(false)} />}

      {deleteTarget &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteTarget(null)}>
            <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold">Delete this address?</h3>
              <p className="mt-1.5 text-sm text-muted">
                <span className="font-medium text-ink">{deleteTarget.label}</span>: {deleteTarget.addressLine}, {deleteTarget.area}
              </p>
              <div className="mt-5 flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl border border-line py-2.5 text-sm font-medium transition hover:bg-surface-alt">
                  Cancel
                </button>
                <button onClick={() => remove(deleteTarget)} disabled={busyId === deleteTarget.id} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60">
                  {busyId === deleteTarget.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function AddNewAddressModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { city: headerCity, area: headerArea, branch } = useLocationStore();

  // City and area are chosen here (they start from the location picked in the header).
  const [city, setCity] = useState(headerCity ?? branch?.city ?? "");
  const [area, setArea] = useState(headerArea ?? "");
  const { data: allBranches } = useQuery({ queryKey: ["branches"], queryFn: () => api.public.get<Branch[]>("/branches") });
  const cities = useMemo(() => Array.from(new Set((allBranches ?? []).map((b) => b.city))).sort(), [allBranches]);
  const { data: cityAreas } = useQuery({
    queryKey: ["delivery-areas", city],
    queryFn: () => api.public.get<string[]>(`/branches/areas?city=${encodeURIComponent(city)}`),
    enabled: !!city,
  });
  const areaOptions = useMemo(() => {
    const list = [...(cityAreas ?? [])];
    if (area && !list.includes(area)) list.unshift(area); // keep a previously saved/header area selectable
    return list.map((a) => ({ value: a, label: a }));
  }, [cityAreas, area]);

  const [locatingNow, setLocatingNow] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  /** Pin the map on the visitor's real position, then fill in city, area and (if still empty) the street address. */
  function useMyLocation() {
    setLocationNote(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationNote("Location is not available in this browser.");
      return;
    }
    setLocatingNow(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPosition([lat, lng]);
        try {
          const result = await api.public.post<{ eligible: boolean; branch?: Branch }>("/branches/resolve", { lat, lng, orderType: "DELIVERY" });
          if (result.eligible && result.branch) {
            setCity(result.branch.city);
            setArea(result.branch.area);
            setEligible(true);
            setIneligibleMessage(null);
          } else {
            setLocationNote("Your current location is outside our delivery area. You can still pick another city and area.");
          }
        } catch {
          setLocationNote("We found you on the map. Please choose your city and area.");
        }
        // best-effort street address from the free OpenStreetMap lookup; never blocks the form
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, { headers: { Accept: "application/json" } });
          const geo = (await res.json()) as { display_name?: string };
          if (geo.display_name) setAddressLine((cur) => cur || geo.display_name!.split(",").slice(0, 3).join(",").trim());
        } catch {
          // ignore
        }
        setLocatingNow(false);
      },
      (err) => {
        setLocatingNow(false);
        setLocationNote(err.code === err.PERMISSION_DENIED ? "Location permission is blocked. Allow it in your browser settings and try again." : "Could not get your location. Please try again.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function selectCity(next: string) {
    setCity(next);
    setArea("");
    setEligible(null);
    setIneligibleMessage(null);
    // move the map to that city so the pin starts somewhere sensible
    const b = (allBranches ?? []).find((x) => x.city === next && x.latitude != null && x.longitude != null);
    if (b) setPosition([Number(b.latitude), Number(b.longitude)]);
  }

  const [label, setLabel] = useState("Home");
  const [addressLine, setAddressLine] = useState("");
  const [landmark, setLandmark] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(true);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [ineligibleMessage, setIneligibleMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fallback = (): [number, number] => {
      const lat = branch?.latitude != null ? Number(branch.latitude) : null;
      const lng = branch?.longitude != null ? Number(branch.longitude) : null;
      return lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;
    };
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPosition(fallback());
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
      },
      () => {
        setPosition(fallback());
        setLocating(false);
      },
      { timeout: 8000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check delivery eligibility whenever the city, area or pinned point changes — the pin can land
  // somewhere the resolved branch doesn't actually deliver to.
  useEffect(() => {
    if (!position || !city) return;
    const timer = setTimeout(async () => {
      setCheckingEligibility(true);
      try {
        const result = await api.public.post<{ eligible: boolean; message?: string }>("/branches/resolve", {
          city,
          area: area ?? undefined,
          lat: position[0],
          lng: position[1],
          orderType: "DELIVERY",
        });
        setEligible(result.eligible);
        setIneligibleMessage(result.eligible ? null : (result.message ?? "Delivery is not available in this area."));
      } catch {
        // Resolution failing shouldn't block address entry — only an explicit "not eligible" does.
        setEligible(true);
        setIneligibleMessage(null);
      } finally {
        setCheckingEligibility(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [position, city, area]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!position) return;
    setError(null);
    setSaving(true);
    try {
      await api.post("/customers/me/addresses", {
        label,
        city: city ?? "",
        area: area ?? "",
        addressLine: addressLine.trim(),
        landmark: landmark.trim() || undefined,
        latitude: position[0],
        longitude: position[1],
        isDefault: makeDefault,
      });
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      toast.success("Address saved");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the address");
    } finally {
      setSaving(false);
    }
  }

  const ready = !locating && position;
  const needsArea = (cityAreas?.length ?? 0) > 0;
  const canSave = ready && !!city && (!needsArea || !!area) && addressLine.trim().length > 0 && eligible !== false && !checkingEligibility;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">Add new address</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-ink transition hover:text-brand-red">
            <FaXmark size={14} />
          </button>
        </div>

        {!ready ? (
          <div className="p-5">
            <AddressFormSkeleton />
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Save as</p>
                <div className="flex gap-2">
                  {LABELS.map(({ value, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLabel(value)}
                      aria-pressed={label === value}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                        label === value ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-line text-ink hover:border-brand-red/50"
                      }`}
                    >
                      <Icon size={13} /> {value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Complete address</label>
                <input required value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="House / flat no., street, building" autoComplete="street-address" className="input" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Nearby landmark <span className="text-xs font-normal text-muted">(optional)</span>
                </label>
                <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. Near the main mosque" maxLength={150} className="input" />
              </div>

              <div>
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={locatingNow}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-red/40 bg-brand-red/5 px-4 py-3 text-sm font-semibold text-brand-red transition hover:bg-brand-red/10 disabled:opacity-60"
                >
                  {locatingNow ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-red/30 border-t-brand-red" /> : <FaCrosshairs size={14} />}
                  {locatingNow ? "Finding your location..." : "Use my current location"}
                </button>
                {locationNote && <p className="mt-1.5 text-xs text-muted">{locationNote}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">City</label>
                  <SelectField value={city} onChange={selectCity} options={cities.map((c) => ({ value: c, label: c }))} placeholder="Select city" required ariaLabel="City" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">Area / region</label>
                  <SelectField
                    value={area}
                    onChange={(v) => {
                      setArea(v);
                      setEligible(null);
                    }}
                    options={areaOptions}
                    placeholder={!city ? "Select a city first" : needsArea ? "Select area" : "No areas listed"}
                    disabled={!city || areaOptions.length === 0}
                    required={needsArea}
                    ariaLabel="Area"
                  />
                </div>
              </div>

              {eligible === false && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  <p>{ineligibleMessage}</p>
                  <p className="mt-1 text-xs opacity-80">Try a different area, or move the pin on the map.</p>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Pin the exact spot</p>
                <AddressMap lat={position![0]} lng={position![1]} onMove={(lat, lng) => setPosition([lat, lng])} />
                <p className="mt-1 text-xs text-muted">Drag the pin so the rider finds you easily.</p>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm text-ink">
                <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="h-4 w-4 accent-[#ED2320]" />
                Make this my default address
              </label>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
            </div>

            <div className="shrink-0 border-t border-line p-4">
              <button type="submit" disabled={!canSave || saving} className="w-full rounded-xl bg-brand-red py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                {saving ? "Saving..." : checkingEligibility ? "Checking delivery..." : "Save address"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
