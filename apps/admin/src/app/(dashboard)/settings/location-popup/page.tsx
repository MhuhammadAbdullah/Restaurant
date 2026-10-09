"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaBuilding, FaLocationCrosshairs, FaMagnifyingGlass } from "react-icons/fa6";
import { DEFAULT_LOCATION_POPUP_CONFIG } from "@restaurant/validation";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { ImageUploadField } from "../../../../components/ImageUploadField";

type TextKey =
  | "heading"
  | "subheading"
  | "deliveryLabel"
  | "pickupLabel"
  | "cityStepLabel"
  | "useCurrentLocationLabel"
  | "areaStepLabel"
  | "areaSearchPlaceholder"
  | "branchStepLabel"
  | "branchSearchPlaceholder"
  | "branchLocationLabel"
  | "getDirectionsLabel"
  | "submitLabel";

type LocationPopupConfig = Partial<Record<TextKey, string>> & { logoUrl?: string | null; useCurrentLocationIconUrl?: string | null; cityIcons?: Record<string, string> };
type RestaurantInfo = { name: string; logoUrl: string | null; locationPopup: LocationPopupConfig };
type Branch = { city: string };
type Step = "city" | "area" | "branch";

const DEFAULTS = DEFAULT_LOCATION_POPUP_CONFIG as Record<TextKey, string>;

// Max lengths mirror the API's validation.
const FIELD_GROUPS: { n: number; title: string; description: string; step: Step; fields: { key: TextKey; label: string; max: number }[] }[] = [
  {
    n: 2,
    title: "Title & order type",
    description: "The top of the popup, including the Delivery / Pick-up switch.",
    step: "city",
    fields: [
      { key: "heading", label: "Heading", max: 100 },
      { key: "subheading", label: "Subheading", max: 150 },
      { key: "deliveryLabel", label: "Delivery switch", max: 40 },
      { key: "pickupLabel", label: "Pick-up switch", max: 40 },
    ],
  },
  {
    n: 3,
    title: "Step 1: City",
    description: "Where customers choose their city or use their GPS location.",
    step: "city",
    fields: [
      { key: "cityStepLabel", label: "City step title", max: 100 },
      { key: "useCurrentLocationLabel", label: "“Use current location” button", max: 60 },
    ],
  },
  {
    n: 4,
    title: "Step 2: Area (delivery)",
    description: "Delivery customers pick their neighbourhood.",
    step: "area",
    fields: [
      { key: "areaStepLabel", label: "Area step title", max: 60 },
      { key: "areaSearchPlaceholder", label: "Area search placeholder", max: 100 },
    ],
  },
  {
    n: 5,
    title: "Step 3: Branch",
    description: "The branch list and the final button.",
    step: "branch",
    fields: [
      { key: "branchStepLabel", label: "Branch step title", max: 60 },
      { key: "branchSearchPlaceholder", label: "Branch search placeholder", max: 100 },
      { key: "branchLocationLabel", label: "Branch card title", max: 60 },
      { key: "getDirectionsLabel", label: "“Get directions” link", max: 40 },
      { key: "submitLabel", label: "Submit button", max: 40 },
    ],
  },
];
const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);

function SectionCard({ n, title, description, right, children }: { n: number; title: string; description: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white">{n}</span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">{title}</p>
            <p className="text-xs text-neutral-500">{description}</p>
          </div>
        </div>
        {right}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

const cityKey = (city: string) => city.trim().toLowerCase();

/** Simplified mock of the storefront's location popup. */
function PopupPreview({
  text,
  logo,
  locationIcon,
  cities,
  cityIcons,
  step,
  mode,
}: {
  text: Record<TextKey, string>;
  logo: string;
  locationIcon: string;
  cities: string[];
  cityIcons: Record<string, string>;
  step: Step;
  mode: "delivery" | "pickup";
}) {
  const t = (k: TextKey) => text[k]?.trim() || DEFAULTS[k];
  const shownCities = cities.length > 0 ? cities.slice(0, 4) : ["Karachi", "Hyderabad"];
  return (
    <div className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-neutral-200">
      <div className="text-center">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="mx-auto h-12 w-12 object-contain" />
        ) : (
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-[10px] text-neutral-400">Logo</span>
        )}
        <p className="mt-2 text-sm font-bold text-neutral-900">{t("heading")}</p>
        <p className="text-[11px] text-neutral-500">{t("subheading")}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-full bg-[#F2EFE9] p-1 text-[11px] font-semibold">
        <span className={`rounded-full py-1.5 text-center ${mode === "delivery" ? "bg-brand-red text-white" : "text-neutral-800"}`}>{t("deliveryLabel")}</span>
        <span className={`rounded-full py-1.5 text-center ${mode === "pickup" ? "bg-brand-red text-white" : "text-neutral-800"}`}>{t("pickupLabel")}</span>
      </div>

      {step === "city" && (
        <div className="mt-3 space-y-2.5">
          <button type="button" className="flex w-full items-center justify-center gap-2 rounded-full border border-neutral-300 py-2 text-[11px] font-medium text-neutral-700">
            {locationIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={locationIcon} alt="" className="h-4 w-4 object-contain" />
            ) : (
              <FaLocationCrosshairs size={12} className="text-brand-red" />
            )}
            {t("useCurrentLocationLabel")}
          </button>
          <p className="text-center text-[11px] font-semibold text-neutral-700">{t("cityStepLabel")}</p>
          <div className="grid grid-cols-2 gap-2">
            {shownCities.map((c) => {
              const icon = cityIcons[cityKey(c)];
              return (
                <span key={c} className="flex flex-col items-center gap-1 rounded-xl border border-neutral-200 py-2.5 text-[11px] font-medium text-neutral-700">
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon} alt="" className="h-7 w-7 object-contain" />
                  ) : (
                    <FaBuilding size={20} className="text-neutral-400" />
                  )}
                  {c}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {step === "area" && (
        <div className="mt-3 space-y-2.5">
          <p className="text-center text-[11px] font-semibold text-neutral-700">{t("areaStepLabel")}</p>
          <div className="flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-2 text-[11px] text-neutral-400">
            <FaMagnifyingGlass size={11} />
            {t("areaSearchPlaceholder")}
          </div>
          {["DHA Phase 6", "Clifton Block 4", "Gulshan-e-Iqbal"].map((a) => (
            <p key={a} className="rounded-lg bg-neutral-50 px-3 py-2 text-[11px] text-neutral-600">{a}</p>
          ))}
        </div>
      )}

      {step === "branch" && (
        <div className="mt-3 space-y-2.5">
          <p className="text-center text-[11px] font-semibold text-neutral-700">{t("branchStepLabel")}</p>
          <div className="flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-2 text-[11px] text-neutral-400">
            <FaMagnifyingGlass size={11} />
            {t("branchSearchPlaceholder")}
          </div>
          <div className="rounded-xl border border-neutral-200 p-3">
            <p className="text-[11px] font-semibold text-neutral-900">{t("branchLocationLabel")}</p>
            <p className="text-[11px] text-neutral-500">Shop 12, Main Boulevard, DHA</p>
            <p className="mt-1 text-[11px] font-medium text-brand-red">{t("getDirectionsLabel")}</p>
          </div>
          <span className="block rounded-full bg-brand-red py-2 text-center text-[11px] font-semibold text-white">{t("submitLabel")}</span>
        </div>
      )}
    </div>
  );
}

export default function LocationPopupSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches") });
  const branchCities = useMemo(() => Array.from(new Set((branches ?? []).map((b) => b.city))), [branches]);

  const [logoUrl, setLogoUrl] = useState("");
  const [useCurrentLocationIconUrl, setUseCurrentLocationIconUrl] = useState("");
  const [text, setText] = useState<Record<TextKey, string>>({ ...DEFAULTS });
  const [cityIcons, setCityIcons] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>("city");
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");
  const [extraCities, setExtraCities] = useState<string[]>([]);
  const [newCity, setNewCity] = useState("");

  // Branch cities first, then any extra cities the admin added on their own (so an icon can exist before a branch does).
  const cities = useMemo(() => {
    const seen = new Set(branchCities.map(cityKey));
    return [...branchCities, ...extraCities.filter((c) => !seen.has(cityKey(c)))];
  }, [branchCities, extraCities]);

  const snapshot = useMemo(() => JSON.stringify({ logoUrl, useCurrentLocationIconUrl, text, cityIcons }), [logoUrl, useCurrentLocationIconUrl, text, cityIcons]);
  const dirty = saved !== "" && snapshot !== saved;

  useEffect(() => {
    if (!restaurant) return;
    const lp = restaurant.locationPopup ?? {};
    const textValues = { ...DEFAULTS };
    for (const f of ALL_FIELDS) textValues[f.key] = lp[f.key] ?? DEFAULTS[f.key];
    const next = { logoUrl: lp.logoUrl ?? "", useCurrentLocationIconUrl: lp.useCurrentLocationIconUrl ?? "", text: textValues, cityIcons: lp.cityIcons ?? {} };
    setLogoUrl(next.logoUrl);
    setUseCurrentLocationIconUrl(next.useCurrentLocationIconUrl);
    setText(next.text);
    setCityIcons(next.cityIcons);
    setExtraCities(Object.keys(next.cityIcons).map((k) => k.replace(/\b\w/g, (c) => c.toUpperCase())));
    setSaved(JSON.stringify(next));
  }, [restaurant]);

  function reset() {
    if (!saved) return;
    const s = JSON.parse(saved);
    setLogoUrl(s.logoUrl);
    setUseCurrentLocationIconUrl(s.useCurrentLocationIconUrl);
    setText(s.text);
    setCityIcons(s.cityIcons);
  }

  function addCity() {
    const name = newCity.trim();
    if (!name) return;
    if (cities.some((c) => cityKey(c) === cityKey(name))) {
      toast.error(`${name} is already in the list`);
      return;
    }
    setExtraCities((c) => [...c, name]);
    setNewCity("");
  }
  function removeCity(city: string) {
    setExtraCities((c) => c.filter((x) => cityKey(x) !== cityKey(city)));
    setCityIcons((icons) => {
      const next = { ...icons };
      delete next[cityKey(city)];
      return next;
    });
  }

  const emptyFields = ALL_FIELDS.filter((f) => !text[f.key]?.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (emptyFields.length > 0) {
      toast.error(`“${emptyFields[0]!.label}” can't be empty. Use “Restore default” if unsure.`);
      return;
    }
    setSaving(true);
    try {
      // The API only accepts real URLs, so cities whose icon was cleared are left out entirely.
      const icons = Object.fromEntries(Object.entries(cityIcons).filter(([, url]) => url.trim()));
      const trimmed = Object.fromEntries(ALL_FIELDS.map((f) => [f.key, text[f.key].trim()]));
      await api.patch("/cms/restaurant", {
        locationPopup: {
          logoUrl: logoUrl || null,
          useCurrentLocationIconUrl: useCurrentLocationIconUrl || null,
          ...trimmed,
          cityIcons: icons,
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

  const effectiveLogo = logoUrl || restaurant?.logoUrl || "";

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Location Popup</h1>
      <p className="mt-1 text-sm text-neutral-500">
        The popup every customer sees first, where they choose Delivery or Pick-up and their location. Change the logo, wording and city icons; the preview shows each step.
      </p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={!canManage} className="grid grid-cols-1 gap-5 disabled:opacity-70 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <SectionCard n={1} title="Branding" description="The logo at the top and the icon on the “use current location” button.">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <ImageUploadField label="Popup logo" folder="restaurant" value={logoUrl} onChange={setLogoUrl} shape="square" hint="Transparent PNG works best" />
                  <p className="mt-1.5 text-xs text-neutral-400">{logoUrl ? "Using this logo." : restaurant?.logoUrl ? "Empty: your header logo is used." : "Empty: no logo is shown."}</p>
                </div>
                <div>
                  <ImageUploadField label="Location button icon" folder="restaurant" value={useCurrentLocationIconUrl} onChange={setUseCurrentLocationIconUrl} shape="square" hint="Small icon, e.g. 64×64" />
                  <p className="mt-1.5 text-xs text-neutral-400">Empty: the default pin icon is used.</p>
                </div>
              </div>
            </SectionCard>

            {FIELD_GROUPS.map((g) => (
              <SectionCard
                key={g.n}
                n={g.n}
                title={g.title}
                description={g.description}
                right={
                  canManage && g.fields.some((f) => text[f.key] !== DEFAULTS[f.key]) ? (
                    <button
                      type="button"
                      onClick={() => setText((t) => ({ ...t, ...Object.fromEntries(g.fields.map((f) => [f.key, DEFAULTS[f.key]])) }))}
                      className="shrink-0 text-xs font-medium text-neutral-500 underline hover:text-brand-red"
                    >
                      Restore defaults
                    </button>
                  ) : undefined
                }
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" onFocusCapture={() => setStep(g.step)}>
                  {g.fields.map((f) => {
                    const empty = !text[f.key]?.trim();
                    return (
                      <div key={f.key}>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-medium text-neutral-500">{f.label}</p>
                          <span className="text-[11px] text-neutral-400">{text[f.key]?.length ?? 0}/{f.max}</span>
                        </div>
                        <input
                          value={text[f.key] ?? ""}
                          onChange={(e) => setText((t) => ({ ...t, [f.key]: e.target.value.slice(0, f.max) }))}
                          placeholder={DEFAULTS[f.key]}
                          className={`input w-full ${empty ? "!border-red-400" : ""}`}
                        />
                        {empty && <p className="mt-0.5 text-[11px] text-red-600">Required</p>}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            ))}

            <SectionCard n={6} title="City icons" description="One icon per city card. Cities from your branches are listed automatically; you can also add a city and its icon yourself.">
              <div className="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-6" onFocusCapture={() => setStep("city")}>
                {cities.map((city) => {
                  const isExtra = !branchCities.some((c) => cityKey(c) === cityKey(city));
                  return (
                    <div key={city} className="flex min-w-0 flex-col items-center">
                      <ImageUploadField
                        label={city}
                        hideLabel
                        icon
                        folder="restaurant"
                        value={cityIcons[cityKey(city)] ?? ""}
                        onChange={(url) => setCityIcons((c) => ({ ...c, [cityKey(city)]: url }))}
                      />
                      <p className="mt-1.5 w-full truncate text-center text-xs font-semibold text-neutral-800" title={city}>{city}</p>
                      <p className="text-[10px] text-neutral-400">{cityIcons[cityKey(city)] ? "Custom icon" : "Default icon"}{isExtra ? " · extra" : ""}</p>
                      {isExtra && canManage && (
                        <button type="button" onClick={() => removeCity(city)} className="mt-0.5 text-[10px] text-neutral-400 underline hover:text-red-600">Remove city</button>
                      )}
                    </div>
                  );
                })}
              </div>
              {cities.length === 0 && <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400">No cities yet. Add one below, or add a branch.</p>}
              {canManage && (
                <div className="flex gap-2 border-t border-neutral-100 pt-3">
                  <input
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value.slice(0, 80))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCity();
                      }
                    }}
                    placeholder="Add another city, e.g. Quetta"
                    className="input min-w-0 flex-1"
                  />
                  <button type="button" onClick={addCity} disabled={!newCity.trim()} className="shrink-0 rounded-lg border border-brand-red px-4 text-sm font-medium text-brand-red hover:bg-red-50 disabled:opacity-50">
                    + Add city
                  </button>
                </div>
              )}
            </SectionCard>
          </div>

          <aside className="xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">Live preview</p>
                <div className="flex overflow-hidden rounded-lg border border-neutral-300 text-[11px] font-medium">
                  {(["delivery", "pickup"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)} className={`px-2.5 py-1 ${mode === m ? "bg-brand-red text-white" : "bg-white text-neutral-600"}`}>
                      {m === "delivery" ? "Delivery" : "Pick-up"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] font-medium">
                {(
                  [
                    ["city", "1. City"],
                    ["area", "2. Area"],
                    ["branch", "3. Branch"],
                  ] as [Step, string][]
                ).map(([s, label]) => (
                  <button key={s} type="button" onClick={() => setStep(s)} className={`rounded-lg border py-1.5 ${step === s ? "border-brand-red bg-red-50 text-brand-red" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-xl bg-neutral-900/5 p-3">
                <PopupPreview text={text} logo={effectiveLogo} locationIcon={useCurrentLocationIconUrl} cities={cities} cityIcons={cityIcons} step={step} mode={mode} />
              </div>
              <p className="mt-2 text-[11px] text-neutral-400">The step switches automatically as you edit a section. Pick-up customers skip the area step.</p>
            </div>
          </aside>

          <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg xl:col-span-2">
            <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving || !dirty}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" onClick={reset} disabled={!dirty || saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
              Reset
            </button>
            <span className={`text-xs ${dirty ? "font-medium text-amber-600" : "text-neutral-400"}`}>{dirty ? "You have unsaved changes" : "All changes saved"}</span>
          </div>
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
