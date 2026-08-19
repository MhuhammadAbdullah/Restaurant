"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FaLocationCrosshairs } from "react-icons/fa6";
import { api } from "../lib/api";
import { useLocationStore } from "../store/useLocationStore";
import type { Branch } from "../lib/types";
import {
  BahawalpurIcon,
  BuildingIcon,
  CloseIcon,
  ExternalLinkIcon,
  FaisalabadIcon,
  GujranwalaIcon,
  IslamabadIcon,
  LahoreIcon,
  MultanIcon,
  PinSolidIcon,
  RahimYarKhanIcon,
  SialkotIcon,
} from "./icons";

type CityIconProps = { size?: number; className?: string };

// Original icons (not third-party assets) for cities without an admin-uploaded/hotlinked icon —
// Karachi/Hyderabad ship with a real URL by default (see DEFAULT_LOCATION_POPUP_CONFIG on the
// API); every other recognized city renders one of these instead of the generic building glyph.
const BUILT_IN_CITY_ICONS: Record<string, (props: CityIconProps) => React.ReactElement> = {
  lahore: LahoreIcon,
  islamabad: IslamabadIcon,
  multan: MultanIcon,
  gujranwala: GujranwalaIcon,
  sialkot: SialkotIcon,
  faisalabad: FaisalabadIcon,
  "rahim yar khan": RahimYarKhanIcon,
  bahawalpur: BahawalpurIcon,
};

type LocationPopupConfig = {
  logoUrl?: string;
  heading: string;
  subheading: string;
  deliveryLabel: string;
  pickupLabel: string;
  cityStepLabel: string;
  useCurrentLocationLabel: string;
  useCurrentLocationIconUrl?: string;
  areaStepLabel: string;
  areaSearchPlaceholder: string;
  branchStepLabel: string;
  branchSearchPlaceholder: string;
  branchLocationLabel: string;
  getDirectionsLabel: string;
  submitLabel: string;
  cityIcons: Record<string, string>;
};
type RestaurantInfo = { name: string; logoUrl: string | null; locationPopup: LocationPopupConfig };

/** These pages render their own minimal chrome (see LegalPageLayout) — the mandatory location gate shouldn't interrupt them. */
const NO_CHROME_PATHS = ["/terms", "/privacy-policy", "/faqs"];

/** Prefers the branch's own pasted Google Maps link; falls back to coordinates, then a plain address search. */
function mapsUrl(branch: Branch): string {
  if (branch.mapUrl) return branch.mapUrl;
  const lat = branch.latitude != null ? Number(branch.latitude) : null;
  const lng = branch.longitude != null ? Number(branch.longitude) : null;
  if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  const query = [branch.address, branch.area, branch.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

type ComboOption = { id: string; label: string };

/**
 * Searchable combobox whose results open upward — used for both the delivery-area and
 * pickup-branch pickers. Manages its own display text internally: reopening it (focus) with an
 * existing selection shows the FULL option list (not filtered down to just the selected item —
 * that was the bug), and typing narrows it from there. Blurring without picking anything reverts
 * the display text back to the confirmed selection.
 */
function SearchCombobox({
  selectedId,
  selectedLabel,
  options,
  onSelect,
  placeholder,
}: {
  selectedId: string;
  selectedLabel: string;
  options: ComboOption[];
  onSelect: (opt: ComboOption) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState(selectedLabel);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Query still matches the confirmed selection verbatim → the user just opened this, hasn't
    // typed anything new yet, so show every option rather than narrowing to just itself.
    if (!q || q === selectedLabel.trim().toLowerCase()) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, selectedLabel]);

  function handleSelect(opt: ComboOption) {
    onSelect(opt);
    setQuery(opt.label);
    setShow(false);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShow(true);
        }}
        onFocus={() => setShow(true)}
        onBlur={() => {
          setTimeout(() => {
            setShow(false);
            setQuery(selectedLabel);
          }, 150);
        }}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink"
      />
      {show && (
        <div className="absolute bottom-full z-10 mb-1 max-h-48 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3.5 py-2.5 text-sm text-muted">No matches</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={() => handleSelect(o)}
                className={`block w-full px-3.5 py-2.5 text-left text-sm transition ${
                  o.id === selectedId ? "bg-brand-red text-white" : "text-ink hover:bg-surface-alt"
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function LocationModal() {
  const pathname = usePathname();
  const { branch: resolvedBranch, isResolved, hasHydrated, isChangeModalOpen, orderType, setOrderType, setResolved, closeChangeModal } =
    useLocationStore();
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api.public.get<Branch[]>("/branches"),
  });
  const { data: restaurant } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const { data: cityAreas } = useQuery({
    queryKey: ["delivery-areas", city],
    queryFn: () => api.public.get<string[]>(`/branches/areas?city=${encodeURIComponent(city)}`),
    enabled: orderType === "DELIVERY" && !!city,
  });

  const cities = useMemo(() => Array.from(new Set((branches ?? []).map((b) => b.city))), [branches]);
  const pickupBranches = useMemo(() => (branches ?? []).filter((b) => b.city === city && b.pickupEnabled), [branches, city]);
  const selectedPickupBranch = useMemo(() => pickupBranches.find((b) => b.id === branchId) ?? null, [pickupBranches, branchId]);

  useEffect(() => {
    if (orderType === "PICKUP" && !branchId && pickupBranches.length > 0) setBranchId(pickupBranches[0]!.id);
  }, [pickupBranches, branchId, orderType]);

  // Wait for the persisted location to load before deciding whether to show the gate —
  // otherwise it flashes open on every refresh even when a location was already resolved.
  // Once resolved, the modal only reappears when the header's "change location" button opens it.
  if (NO_CHROME_PATHS.includes(pathname)) return null;
  if (!hasHydrated || (isResolved && !isChangeModalOpen)) return null;

  const copy = restaurant?.locationPopup;
  const popupLogo = copy?.logoUrl || restaurant?.logoUrl;

  function selectCity(next: string) {
    setCity(next);
    setArea("");
    setBranchId("");
  }

  async function resolve(useCoords?: { lat: number; lng: number }) {
    setError(null);
    setLoading(true);
    try {
      const result = await api.public.post<{ eligible: boolean; branch?: Branch; isOpen?: boolean; message?: string }>("/branches/resolve", {
        // "Use Current Location" resolves purely from coordinates — no pre-picked city required.
        ...(useCoords ? {} : { city }),
        area: orderType === "DELIVERY" && !useCoords ? area || undefined : undefined,
        orderType,
        branchId: orderType === "PICKUP" && !useCoords ? branchId || undefined : undefined,
        ...(useCoords ? { lat: useCoords.lat, lng: useCoords.lng } : {}),
      });
      if (!result.eligible || !result.branch) {
        setError(
          useCoords
            ? "Your current location is outside our delivery area. Please change your location to continue."
            : result.message ?? "Sorry, delivery is currently unavailable in your selected area.",
        );
        return;
      }
      // Coordinates-based resolution has no customer-picked city/area — fall back to the matched
      // branch's own city/area as the closest available "your location" label.
      const resolvedCity = useCoords ? result.branch.city : city;
      const resolvedArea = orderType === "DELIVERY" ? (useCoords ? result.branch.area : area || null) : result.branch.area;
      setCity(resolvedCity);
      setResolved(resolvedCity, resolvedArea, result.branch, result.isOpen ?? true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Location services are not available in this browser.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        setLoading(false);
        setError("Could not get your location. Please select manually.");
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
        {resolvedBranch && (
          <button
            onClick={closeChangeModal}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-brand-red transition hover:bg-red-100"
          >
            <CloseIcon size={16} />
          </button>
        )}

        <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-brand-red">
          {popupLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={popupLogo} alt={restaurant?.name ?? ""} className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center font-display text-lg leading-tight text-white">{restaurant?.name ?? ""}</span>
          )}
        </div>

        <h2 className="mt-4 text-center text-lg font-semibold text-ink">{copy?.heading ?? "Select Your Order Type"}</h2>
        <div className="mx-auto mt-3 flex w-fit rounded-full bg-red-50 p-1">
          {(["DELIVERY", "PICKUP"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`rounded-full px-8 py-2 text-sm font-medium transition ${
                orderType === t ? "bg-brand-red text-white" : "text-brand-red/70"
              }`}
            >
              {t === "DELIVERY" ? copy?.deliveryLabel ?? "Delivery" : copy?.pickupLabel ?? "Pick-Up"}
            </button>
          ))}
        </div>

        <p className="mt-5 text-center text-sm font-semibold text-muted">{copy?.subheading ?? "Please select your location"}</p>
        <button
          onClick={useCurrentLocation}
          disabled={loading}
          className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-line bg-surface-alt px-4 py-2 text-sm font-medium text-ink transition hover:border-brand-red hover:text-brand-red disabled:opacity-60"
        >
          {copy?.useCurrentLocationIconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={copy.useCurrentLocationIconUrl} alt="" className="h-4 w-4 object-contain" />
          ) : (
            <FaLocationCrosshairs size={15} />
          )}{" "}
          {copy?.useCurrentLocationLabel ?? "Use Current Location"}
        </button>

        <div className="mt-5">
          <p className="mb-2 text-center text-sm font-semibold text-muted">{copy?.cityStepLabel ?? "Please Select City"}</p>
          <div className="grid grid-cols-4 justify-items-center gap-x-2 gap-y-4 sm:grid-cols-5">
            {(cities.length > 0 ? cities : ["Karachi"]).map((c) => {
              const isSelected = c === city;
              const cityKey = c.trim().toLowerCase();
              const iconUrl = copy?.cityIcons?.[cityKey];
              const BuiltInIcon = BUILT_IN_CITY_ICONS[cityKey];
              return (
                <button key={c} onClick={() => selectCity(c)} className="flex flex-col items-center gap-1.5 text-center">
                  {/* Fixed size (not aspect-square/w-full derived from the grid column) so every
                      tile is identically sized regardless of row height or icon content. */}
                  <span
                    className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition ${
                      isSelected ? "border-solid border-brand-red bg-red-50" : "border-line bg-surface hover:border-brand-red/50"
                    }`}
                  >
                    {iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={iconUrl} alt="" className="h-11 w-11 object-contain" />
                    ) : BuiltInIcon ? (
                      <BuiltInIcon size={40} className={isSelected ? "text-brand-red" : "text-muted"} />
                    ) : (
                      <BuildingIcon size={36} className={isSelected ? "text-brand-red" : "text-muted"} />
                    )}
                  </span>
                  <span className={`text-xs font-medium leading-tight ${isSelected ? "text-brand-red" : "text-ink"}`}>{c}</span>
                </button>
              );
            })}
          </div>
        </div>

        {orderType === "PICKUP" ? (
          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-semibold text-ink">{copy?.branchStepLabel ?? "Select Branch"}</label>
            <SearchCombobox
              selectedId={branchId}
              selectedLabel={selectedPickupBranch?.name ?? ""}
              onSelect={(opt) => setBranchId(opt.id)}
              options={pickupBranches.map((b) => ({ id: b.id, label: b.name }))}
              placeholder={copy?.branchSearchPlaceholder ?? "Search branches..."}
            />

            {selectedPickupBranch && (
              <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-4">
                <div className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-red">
                    <PinSolidIcon size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{copy?.branchLocationLabel ?? "Branch Location"}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {[selectedPickupBranch.address, selectedPickupBranch.area, selectedPickupBranch.city].filter(Boolean).join(", ")}
                    </p>
                    <a
                      href={mapsUrl(selectedPickupBranch)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-red hover:underline"
                    >
                      <ExternalLinkIcon size={14} /> {copy?.getDirectionsLabel ?? "Get Directions"}
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-semibold text-ink">{copy?.areaStepLabel ?? "Select Area"}</label>
            <SearchCombobox
              selectedId={area}
              selectedLabel={area}
              onSelect={(opt) => setArea(opt.label)}
              options={(cityAreas ?? []).map((a) => ({ id: a, label: a }))}
              placeholder={copy?.areaSearchPlaceholder ?? "Search your area..."}
            />
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          onClick={() => resolve()}
          disabled={loading || (orderType === "DELIVERY" ? !area : !branchId)}
          className="mt-5 w-full rounded-full bg-brand-red py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Checking..." : copy?.submitLabel ?? "Select"}
        </button>
      </div>
    </div>
  );
}
