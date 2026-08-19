"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
};

const DEFAULT_HEADER: HeaderConfig = {
  deliveryButtonLabel: "Delivery from",
  pickupButtonLabel: "Pick-Up from",
  contactButtonLabel: "Contact",
  complaintButtonLabel: "Submit a Complaint",
  showCartIcon: true,
  showHamburgerIcon: true,
};

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

export default function HeaderSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });

  const [form, setForm] = useState({
    name: "",
    logoUrl: "",
    contactPhone: "",
    contactEmail: "",
    useAsProductFallback: false,
    ...DEFAULT_HEADER,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurant) return;
    setForm({
      name: restaurant.name ?? "",
      logoUrl: restaurant.logoUrl ?? "",
      contactPhone: restaurant.contactPhone ?? "",
      contactEmail: restaurant.contactEmail ?? "",
      useAsProductFallback: restaurant.productImageFallbackSource === "HEADER",
      deliveryButtonLabel: restaurant.header?.deliveryButtonLabel ?? DEFAULT_HEADER.deliveryButtonLabel,
      pickupButtonLabel: restaurant.header?.pickupButtonLabel ?? DEFAULT_HEADER.pickupButtonLabel,
      contactButtonLabel: restaurant.header?.contactButtonLabel ?? DEFAULT_HEADER.contactButtonLabel,
      complaintButtonLabel: restaurant.header?.complaintButtonLabel ?? DEFAULT_HEADER.complaintButtonLabel,
      showCartIcon: restaurant.header?.showCartIcon ?? true,
      showHamburgerIcon: restaurant.header?.showHamburgerIcon ?? true,
    });
  }, [restaurant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", {
        name: form.name || undefined,
        logoUrl: form.logoUrl || null,
        contactPhone: form.contactPhone || null,
        contactEmail: form.contactEmail || null,
        productImageFallbackSource: form.useAsProductFallback ? "HEADER" : restaurant?.productImageFallbackSource === "HEADER" ? null : undefined,
        header: {
          deliveryButtonLabel: form.deliveryButtonLabel,
          pickupButtonLabel: form.pickupButtonLabel,
          contactButtonLabel: form.contactButtonLabel,
          complaintButtonLabel: form.complaintButtonLabel,
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
      <p className="mt-1 text-sm text-neutral-500">
        Controls the logo and button text shown in the customer website header. Icons are fixed in the app itself and aren&apos;t configurable here.
      </p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4 max-w-5xl">
        <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-70">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsCard title="Logo & Name">
            <ImageUploadField label="Logo" folder="restaurant" value={form.logoUrl} onChange={(url) => setForm({ ...form, logoUrl: url })} />
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-500">Restaurant Name</p>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" required />
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={form.useAsProductFallback}
                onChange={(e) => setForm({ ...form, useAsProductFallback: e.target.checked })}
              />
              Use this logo as the fallback image for products without a photo
            </label>
          </SettingsCard>

          <SettingsCard title="Location Button" description="Shown in the header for changing delivery/pick-up location.">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Delivery Label</p>
                <input
                  value={form.deliveryButtonLabel}
                  onChange={(e) => setForm({ ...form, deliveryButtonLabel: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Pick-Up Label</p>
                <input
                  value={form.pickupButtonLabel}
                  onChange={(e) => setForm({ ...form, pickupButtonLabel: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Contact Button">
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-500">Button Text</p>
              <input
                value={form.contactButtonLabel}
                onChange={(e) => setForm({ ...form, contactButtonLabel: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Contact Phone</p>
                <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="input w-full" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Contact Email</p>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  className="input w-full"
                />
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Complaint Button">
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-500">Button Text</p>
              <input
                value={form.complaintButtonLabel}
                onChange={(e) => setForm({ ...form, complaintButtonLabel: e.target.value })}
                className="input w-full"
                required
              />
            </div>
          </SettingsCard>

          <SettingsCard title="Cart Icon">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.showCartIcon} onChange={(e) => setForm({ ...form, showCartIcon: e.target.checked })} />
              Show cart icon
            </label>
          </SettingsCard>

          <SettingsCard title="Hamburger (Menu) Icon">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={form.showHamburgerIcon}
                onChange={(e) => setForm({ ...form, showHamburgerIcon: e.target.checked })}
              />
              Show hamburger (menu) icon
            </label>
          </SettingsCard>
        </div>

          <button className="mt-4 rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
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
