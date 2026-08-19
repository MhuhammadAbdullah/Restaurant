"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { ImageUploadField } from "../../../../components/ImageUploadField";

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
type Branch = { city: string };

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

const TEXT_FIELDS: { key: keyof Omit<LocationPopupConfig, "logoUrl" | "cityIcons" | "useCurrentLocationIconUrl">; label: string; placeholder: string }[] = [
  { key: "heading", label: "Heading", placeholder: "Select Your Order Type" },
  { key: "subheading", label: "Subheading", placeholder: "Please select your location" },
  { key: "deliveryLabel", label: "Delivery Toggle Label", placeholder: "Delivery" },
  { key: "pickupLabel", label: "Pick-Up Toggle Label", placeholder: "Pick-Up" },
  { key: "useCurrentLocationLabel", label: '"Use Current Location" Button', placeholder: "Use Current Location" },
  { key: "cityStepLabel", label: "City Step Label", placeholder: "Please Select City" },
  { key: "areaStepLabel", label: "Area Step Label", placeholder: "Select Area" },
  { key: "areaSearchPlaceholder", label: "Area Search Placeholder", placeholder: "Search your area..." },
  { key: "branchStepLabel", label: "Branch Step Label", placeholder: "Select Branch" },
  { key: "branchSearchPlaceholder", label: "Branch Search Placeholder", placeholder: "Search branches..." },
  { key: "branchLocationLabel", label: "Branch Location Card Title", placeholder: "Branch Location" },
  { key: "getDirectionsLabel", label: '"Get Directions" Link', placeholder: "Get Directions" },
  { key: "submitLabel", label: "Submit Button", placeholder: "Select" },
];

export default function LocationPopupSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches") });
  const cities = Array.from(new Set((branches ?? []).map((b) => b.city)));

  const [logoUrl, setLogoUrl] = useState("");
  const [useCurrentLocationIconUrl, setUseCurrentLocationIconUrl] = useState("");
  const [text, setText] = useState<Record<string, string>>({});
  const [cityIcons, setCityIcons] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurant) return;
    setLogoUrl(restaurant.locationPopup.logoUrl ?? "");
    setUseCurrentLocationIconUrl(restaurant.locationPopup.useCurrentLocationIconUrl ?? "");
    const textValues: Record<string, string> = {};
    for (const f of TEXT_FIELDS) textValues[f.key] = restaurant.locationPopup[f.key] ?? f.placeholder;
    setText(textValues);
    setCityIcons(restaurant.locationPopup.cityIcons ?? {});
  }, [restaurant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", {
        locationPopup: {
          logoUrl: logoUrl || null,
          useCurrentLocationIconUrl: useCurrentLocationIconUrl || null,
          ...text,
          cityIcons,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
      toast.success("Location popup settings saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save location popup settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Location Popup</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Full branding for the mandatory location/order-type popup shown to every customer on the website: logo, every label, and a custom icon
        per city.
      </p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4 max-w-5xl">
        <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-70">
          <SettingsCard title="Popup Branding">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="flex flex-col items-center">
                <p className="mb-1 text-xs font-medium text-neutral-500">Logo</p>
                <ImageUploadField label="Logo" hideLabel folder="restaurant" value={logoUrl} onChange={setLogoUrl} compact />
                <p className="mt-1.5 text-center text-xs text-neutral-400">Falls back to your header logo if left empty.</p>
              </div>
              <div className="flex flex-col items-center">
                <p className="mb-1 text-xs font-medium text-neutral-500">&quot;Use Current Location&quot; Icon</p>
                <ImageUploadField
                  label='"Use Current Location" Icon'
                  hideLabel
                  folder="restaurant"
                  value={useCurrentLocationIconUrl}
                  onChange={setUseCurrentLocationIconUrl}
                  compact
                />
                <p className="mt-1.5 text-center text-xs text-neutral-400">Falls back to the default pin icon if left empty.</p>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Text Labels" description="Every piece of copy shown in the popup.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TEXT_FIELDS.map((f) => (
                <div key={f.key}>
                  <p className="mb-1 text-xs font-medium text-neutral-500">{f.label}</p>
                  <input
                    value={text[f.key] ?? ""}
                    onChange={(e) => setText((t) => ({ ...t, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="input w-full"
                  />
                </div>
              ))}
            </div>
          </SettingsCard>

          <SettingsCard title="City Icons" description="Shown on each city card in the popup. A city with no icon shows a generic building icon instead.">
            {cities.length === 0 ? (
              <p className="text-sm text-neutral-400">No branches yet. Add a branch first, then its city will appear here.</p>
            ) : (
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
                {cities.map((city) => (
                  <div key={city} className="flex flex-col items-center">
                    <ImageUploadField
                      label={city}
                      hideLabel
                      folder="restaurant"
                      value={cityIcons[city.trim().toLowerCase()] ?? ""}
                      onChange={(url) => setCityIcons((c) => ({ ...c, [city.trim().toLowerCase()]: url }))}
                      compact
                    />
                    <p className="mt-1.5 text-center text-xs font-medium text-neutral-600">{city}</p>
                  </div>
                ))}
              </div>
            )}
          </SettingsCard>

          <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </fieldset>
      </form>

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
