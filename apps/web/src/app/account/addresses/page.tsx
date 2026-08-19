"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import { useLocationStore } from "../../../store/useLocationStore";
import { CloseIcon, TrashIcon, PinIcon } from "../../../components/icons";
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

export default function AddressesPage() {
  const queryClient = useQueryClient();
  const { data: addresses, isLoading } = useQuery({ queryKey: ["addresses"], queryFn: () => api.get<Address[]>("/customers/me/addresses") });
  const [showForm, setShowForm] = useState(false);

  async function remove(id: string) {
    await api.delete(`/customers/me/addresses/${id}`);
    await queryClient.invalidateQueries({ queryKey: ["addresses"] });
  }

  return (
    <div>
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-base font-semibold text-ink">My Addresses</p>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
          + Add new Address
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {isLoading && Array.from({ length: 2 }).map((_, i) => <SkeletonAddressCard key={i} />)}
        {!isLoading &&
          addresses?.map((a) => (
            <div key={a.id} className="flex items-start justify-between rounded-xl border border-line bg-surface p-4">
              <div className="flex gap-2.5">
                <PinIcon size={16} className="mt-0.5 shrink-0 text-ink" />
                <div>
                  <p className="text-sm font-semibold text-ink">Address</p>
                  <p className="text-sm text-ink">{a.addressLine}</p>
                  <p className="text-xs text-muted">
                    {a.area}, {a.city}
                  </p>
                </div>
              </div>
              <button onClick={() => remove(a.id)} aria-label="Delete address" className="shrink-0 text-muted hover:text-red-600">
                <TrashIcon size={16} />
              </button>
            </div>
          ))}
        {!isLoading && addresses?.length === 0 && <p className="text-sm text-muted">No saved addresses yet.</p>}
      </div>

      {showForm && <AddNewAddressModal onClose={() => setShowForm(false)} />}
    </div>
  );
}

function AddNewAddressModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { city, area, branch, openChangeModal } = useLocationStore();

  const [addressLine, setAddressLine] = useState("");
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(true);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [ineligibleMessage, setIneligibleMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regionLabel = area && city ? `${area}, ${city}` : (branch ? `${branch.city}` : "");

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

  // Re-check delivery eligibility for the *current header region* whenever the pinned point moves —
  // region text itself is locked to the header (can't be edited here), but the pin can still land
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
        city: city ?? "",
        area: area ?? "",
        addressLine,
        latitude: position[0],
        longitude: position[1],
      });
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save address");
    } finally {
      setSaving(false);
    }
  }

  const ready = !locating && position;
  const canSave = ready && addressLine.trim().length > 0 && eligible !== false && !checkingEligibility;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Add new Address</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-ink">
            <CloseIcon size={16} />
          </button>
        </div>

        {!ready ? (
          <div className="mt-4">
            <AddressFormSkeleton />
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div>
              <p className="mb-1 text-sm font-medium text-ink">Address (with post code if applicable)</p>
              <input
                required
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Enter your complete street address"
                className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-brand-red focus:outline-none"
              />
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-ink">Region</p>
              <input
                readOnly
                value={regionLabel}
                className="w-full cursor-not-allowed rounded-lg border border-line bg-surface-alt px-3.5 py-2.5 text-sm text-muted"
              />
              <p className="mt-1 text-xs text-muted">To change your area/region, please do it from the top header location button.</p>
            </div>

            {eligible === false && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p>{ineligibleMessage}</p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openChangeModal();
                  }}
                  className="mt-2 font-semibold underline"
                >
                  Change Region
                </button>
              </div>
            )}

            <AddressMap lat={position![0]} lng={position![1]} onMove={(lat, lng) => setPosition([lat, lng])} />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={!canSave || saving}
              className="w-full rounded-lg bg-brand-red py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Address"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
