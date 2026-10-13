"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaBars, FaLocationDot, FaMobileScreenButton, FaTriangleExclamation } from "react-icons/fa6";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { ImageUploadField } from "../../../../components/ImageUploadField";

type HeaderConfig = {
  deliveryButtonLabel: string;
  pickupButtonLabel: string;
  contactButtonLabel: string;
  complaintButtonLabel: string;
  showCartIcon: boolean;
  showHamburgerIcon: boolean;
};

type RestaurantInfo = {
  name: string;
  logoUrl: string | null;
  currency: string;
  contactPhone: string | null;
  contactEmail: string | null;
  header: HeaderConfig;
  productImageFallbackSource: "HEADER" | "FOOTER" | null;
  seo?: { faviconUrl?: string };
};

const DEFAULT_HEADER: HeaderConfig = {
  deliveryButtonLabel: "Delivery from",
  pickupButtonLabel: "Pick-Up from",
  contactButtonLabel: "Contact",
  complaintButtonLabel: "Submit a Complaint",
  showCartIcon: true,
  showHamburgerIcon: true,
};

const EMPTY_FORM = { name: "", logoUrl: "", faviconUrl: "", contactPhone: "", contactEmail: "", useAsProductFallback: false, ...DEFAULT_HEADER };
type FormState = typeof EMPTY_FORM;

function SectionCard({ n, title, description, children }: { n: number; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white">{n}</span>
        <div>
          <p className="text-sm font-semibold text-neutral-900">{title}</p>
          <p className="text-xs text-neutral-500">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-neutral-500">{label}</p>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

function ToggleCard({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${checked ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#ED2320]" />
      <span>
        <span className="block text-sm font-medium text-neutral-900">{title}</span>
        <span className="block text-xs text-neutral-500">{hint}</span>
      </span>
    </label>
  );
}

const CART_ICON_URL = "https://res.cloudinary.com/dgkd8jw6a/image/upload/v1786624174/Gemini_Generated_Image_lrzw3wlrzw3wlrzw-removebg-preview_sdff6k.png";

/** Mirrors the storefront header (phone layout): awning, location button, logo, contact, cart and menu icons. */
function HeaderPreview({ form, mode }: { form: FormState; mode: "delivery" | "pickup" }) {
  const label = mode === "delivery" ? form.deliveryButtonLabel || "Delivery from" : form.pickupButtonLabel || "Pick-Up from";
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-[#FAF8F4]">
      <div
        aria-hidden="true"
        className="h-2.5 w-full"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 25% 0, #ED2320 0 5.5px, transparent 6px)",
            "radial-gradient(circle at 75% 0, #ffffff 0 5.5px, rgba(0,0,0,0.18) 6px, transparent 8px)",
          ].join(", "),
          backgroundSize: "24px 10px",
          backgroundRepeat: "repeat-x",
        }}
      />
      <div className="relative flex h-16 items-center justify-between gap-2 px-3 pt-2">
        <button type="button" className="flex min-w-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-left">
          <FaLocationDot size={13} className="shrink-0 text-brand-red" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="whitespace-nowrap text-[10px] font-semibold text-neutral-900">Change Location</span>
            <span className="max-w-[90px] truncate text-[9px] text-neutral-500">{label} Branch</span>
          </span>
        </button>
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center pt-1">
          {form.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logoUrl} alt="" className="h-14 w-auto max-w-[110px] object-contain" />
          ) : (
            <span className="text-xl font-bold text-brand-red">{form.name || "Restaurant"}</span>
          )}
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-red/10 text-brand-red"><FaMobileScreenButton size={14} /></span>
          </span>
          {form.showCartIcon && (
            <span className="relative">
              <span
                className="block h-7 w-7 bg-brand-red"
                style={{ WebkitMask: `url(${CART_ICON_URL}) center / contain no-repeat`, mask: `url(${CART_ICON_URL}) center / contain no-repeat` }}
              />
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[9px] font-semibold text-white ring-2 ring-[#FAF8F4]">0</span>
            </span>
          )}
          {form.showHamburgerIcon && (
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-red/10 text-brand-red"><FaBars size={14} /></span>
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-neutral-200 bg-white px-3 py-2 text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5 text-neutral-600">
          <FaMobileScreenButton size={10} className="shrink-0 text-brand-red" />
          <span className="truncate"><b className="text-neutral-800">{form.contactButtonLabel || "Contact us"}</b> {form.contactPhone}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-red"><FaTriangleExclamation size={9} />{form.complaintButtonLabel || "Submit a Complaint"}</span>
      </div>
    </div>
  );
}

export default function HeaderSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saved, setSaved] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"delivery" | "pickup">("delivery");

  useEffect(() => {
    if (!restaurant) return;
    const next: FormState = {
      name: restaurant.name ?? "",
      logoUrl: restaurant.logoUrl ?? "",
      faviconUrl: restaurant.seo?.faviconUrl ?? "",
      contactPhone: restaurant.contactPhone ?? "",
      contactEmail: restaurant.contactEmail ?? "",
      useAsProductFallback: restaurant.productImageFallbackSource === "HEADER",
      deliveryButtonLabel: restaurant.header?.deliveryButtonLabel ?? DEFAULT_HEADER.deliveryButtonLabel,
      pickupButtonLabel: restaurant.header?.pickupButtonLabel ?? DEFAULT_HEADER.pickupButtonLabel,
      contactButtonLabel: restaurant.header?.contactButtonLabel ?? DEFAULT_HEADER.contactButtonLabel,
      complaintButtonLabel: restaurant.header?.complaintButtonLabel ?? DEFAULT_HEADER.complaintButtonLabel,
      showCartIcon: restaurant.header?.showCartIcon ?? true,
      showHamburgerIcon: restaurant.header?.showHamburgerIcon ?? true,
    };
    setForm(next);
    setSaved(next);
  }, [restaurant]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", {
        name: form.name.trim() || undefined,
        logoUrl: form.logoUrl || null,
        seo: { faviconUrl: form.faviconUrl },
        contactPhone: form.contactPhone.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        productImageFallbackSource: form.useAsProductFallback ? "HEADER" : restaurant?.productImageFallbackSource === "HEADER" ? null : undefined,
        header: {
          deliveryButtonLabel: form.deliveryButtonLabel.trim(),
          pickupButtonLabel: form.pickupButtonLabel.trim(),
          contactButtonLabel: form.contactButtonLabel.trim(),
          complaintButtonLabel: form.complaintButtonLabel.trim(),
          showCartIcon: form.showCartIcon,
          showHamburgerIcon: form.showHamburgerIcon,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
      toast.success("Header settings saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save header settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Header & Branding</h1>
      <p className="mt-1 text-sm text-neutral-500">Your logo, name and the header buttons customers see on the website. The preview updates as you type.</p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={!canManage} className="grid grid-cols-1 gap-5 disabled:opacity-70 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <SectionCard n={1} title="Logo & name" description="Shown in the centre of the website header and on receipts.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[190px_1fr]">
                <div>
                  <ImageUploadField label="Logo" folder="restaurant" value={form.logoUrl} onChange={(url) => set("logoUrl", url)} shape="square" hint="Square, transparent PNG works best" />
                </div>
                <div className="space-y-3">
                  <Field label="Favicon (browser tab icon)" hint="Optional. A small square picture, at least 96 x 96. Without one, the logo is used.">
                    <div className="flex items-center gap-3">
                      <div className="w-24">
                        <ImageUploadField label="Favicon" hideLabel compact folder="restaurant" value={form.faviconUrl} onChange={(url) => set("faviconUrl", url)} />
                      </div>
                      {form.faviconUrl && (
                        <button type="button" onClick={() => set("faviconUrl", "")} className="text-xs text-brand-red hover:underline">Use the logo instead</button>
                      )}
                    </div>
                  </Field>
                  <Field label="Restaurant name *">
                    <input value={form.name} onChange={(e) => set("name", e.target.value)} className="input w-full" placeholder="e.g. Baloch Restaurant" required />
                  </Field>
                  <ToggleCard
                    checked={form.useAsProductFallback}
                    onChange={(v) => set("useAsProductFallback", v)}
                    title="Use logo as product placeholder"
                    hint="Products without a photo will show this logo instead of an empty box."
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard n={2} title="Location button" description="Lets customers pick where they order from. The branch name is added after the label.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Delivery label *" hint='Shows as "Delivery from <branch>"'>
                  <input
                    value={form.deliveryButtonLabel}
                    onChange={(e) => set("deliveryButtonLabel", e.target.value)}
                    onFocus={() => setPreviewMode("delivery")}
                    className="input w-full"
                    required
                  />
                </Field>
                <Field label="Pick-up label *" hint='Shows as "Pick-Up from <branch>"'>
                  <input
                    value={form.pickupButtonLabel}
                    onChange={(e) => set("pickupButtonLabel", e.target.value)}
                    onFocus={() => setPreviewMode("pickup")}
                    className="input w-full"
                    required
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard n={3} title="Contact" description="The Contact button shows the phone number of the branch the customer has chosen, and calls it when tapped. The number changes when they switch branch.">
              <Field label="Button text *">
                <input value={form.contactButtonLabel} onChange={(e) => set("contactButtonLabel", e.target.value)} className="input w-full" required />
              </Field>
              <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Each branch&apos;s number is set in <strong>Branches</strong>. The same number is shown in the website footer.
              </p>
              <details className="rounded-lg border border-neutral-200 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-neutral-600">Common number (used only when a branch has no number of its own)</summary>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Common phone" hint="Include the country code, e.g. +92 300 1234567">
                    <input type="tel" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className="input w-full" placeholder="+92 ..." />
                  </Field>
                  <Field label="Common email">
                    <input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className="input w-full" placeholder="hello@restaurant.com" />
                  </Field>
                </div>
              </details>
            </SectionCard>

            <SectionCard n={4} title="Complaint button" description="Opens the complaint form for customers.">
              <Field label="Button text *">
                <input value={form.complaintButtonLabel} onChange={(e) => set("complaintButtonLabel", e.target.value)} className="input w-full" required />
              </Field>
            </SectionCard>

            <SectionCard n={5} title="Header icons" description="Turn the standard header icons on or off.">
              <div className="grid gap-2 sm:grid-cols-2">
                <ToggleCard checked={form.showCartIcon} onChange={(v) => set("showCartIcon", v)} title="Cart icon" hint="Shortcut to the customer's cart." />
                <ToggleCard checked={form.showHamburgerIcon} onChange={(v) => set("showHamburgerIcon", v)} title="Menu (hamburger) icon" hint="Opens the side menu." />
              </div>
              <p className="text-xs text-neutral-400">The icon designs themselves are fixed in the app.</p>
            </SectionCard>
          </div>

          <aside className="xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">Live preview</p>
                <div className="flex overflow-hidden rounded-lg border border-neutral-300 text-[11px] font-medium">
                  {(["delivery", "pickup"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setPreviewMode(m)} className={`px-2.5 py-1 ${previewMode === m ? "bg-brand-red text-white" : "bg-white text-neutral-600"}`}>
                      {m === "delivery" ? "Delivery" : "Pick-up"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <HeaderPreview form={form} mode={previewMode} />
              </div>
              <p className="mt-2 text-[11px] text-neutral-400">Shown like the website header on a phone. On desktop the same items sit in one wide bar.</p>
            </div>
          </aside>

          <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg xl:col-span-2">
            <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving || !dirty}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" onClick={() => setForm(saved)} disabled={!dirty || saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
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
