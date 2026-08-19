"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SOCIAL_PLATFORM_KEYS, type SocialPlatformKey } from "@restaurant/validation";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { ImageUploadField } from "../../../../components/ImageUploadField";
import { CloseIcon } from "../../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";

type RestaurantInfo = {
  name: string;
  footerLogoUrl: string | null;
  socialLinks: Partial<Record<SocialPlatformKey, string>> | null;
  footer: { tagline: string; timingText: string };
  productImageFallbackSource: "HEADER" | "FOOTER" | null;
};

const DEFAULT_TAGLINE = "Exquisite range of flavours, delivered fresh.";
const DEFAULT_TIMING = "Monday - Sunday: 11:00 AM - 04:55 AM";

const PLATFORM_LABELS: Record<SocialPlatformKey, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "Twitter / X",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

type SocialRow = { platform: SocialPlatformKey; url: string };

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function unusedPlatform(rows: SocialRow[]): SocialPlatformKey {
  return SOCIAL_PLATFORM_KEYS.find((p) => !rows.some((r) => r.platform === p)) ?? SOCIAL_PLATFORM_KEYS[0]!;
}

export default function FooterSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });

  const [tagline, setTagline] = useState("");
  const [timingText, setTimingText] = useState("");
  const [footerLogoUrl, setFooterLogoUrl] = useState("");
  const [useAsProductFallback, setUseAsProductFallback] = useState(false);
  const [socialRows, setSocialRows] = useState<SocialRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurant) return;
    setTagline(restaurant.footer?.tagline ?? DEFAULT_TAGLINE);
    setTimingText(restaurant.footer?.timingText ?? DEFAULT_TIMING);
    setFooterLogoUrl(restaurant.footerLogoUrl ?? "");
    setUseAsProductFallback(restaurant.productImageFallbackSource === "FOOTER");
    const entries = Object.entries(restaurant.socialLinks ?? {}) as [SocialPlatformKey, string][];
    setSocialRows(entries.length > 0 ? entries.map(([platform, url]) => ({ platform, url })) : []);
  }, [restaurant]);

  function addSocialRow() {
    setSocialRows((rows) => [...rows, { platform: unusedPlatform(rows), url: "" }]);
  }
  function updateSocialRow(index: number, patch: Partial<SocialRow>) {
    setSocialRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeSocialRow(index: number) {
    setSocialRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const socialLinks: Partial<Record<SocialPlatformKey, string>> = {};
      for (const row of socialRows) {
        if (row.url.trim()) socialLinks[row.platform] = row.url.trim();
      }

      await api.patch("/cms/restaurant", {
        socialLinks,
        footer: { tagline, timingText },
        footerLogoUrl: footerLogoUrl || null,
        productImageFallbackSource: useAsProductFallback ? "FOOTER" : restaurant?.productImageFallbackSource === "FOOTER" ? null : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
      toast.success("Footer settings saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save footer settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Footer</h1>
      <p className="mt-1 text-sm text-neutral-500">Controls the tagline, timing, legal links, and social links shown in the customer website footer.</p>

      <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
        The footer&apos;s contact number and address are dynamic: once a customer picks a delivery/pick-up branch, those come from that
        branch automatically. Manage branch phone/address in <span className="font-medium">Administration → Branches</span>. Terms &amp;
        Conditions, Privacy Policy, and FAQs content are managed under{" "}
        <span className="font-medium">Website → Legal Pages</span>.
      </p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4 max-w-xl">
        <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-70">
          <SettingsCard title="Footer Logo" description="A separate logo asset for the footer, independent from the header logo.">
            <ImageUploadField label="Footer Logo" folder="restaurant" value={footerLogoUrl} onChange={setFooterLogoUrl} />
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input type="checkbox" checked={useAsProductFallback} onChange={(e) => setUseAsProductFallback(e.target.checked)} />
              Use this logo as the fallback image for products without a photo
            </label>
          </SettingsCard>

          <SettingsCard title="Tagline" description="Short line shown under the restaurant name in the footer.">
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} className="input w-full" required />
          </SettingsCard>

          <SettingsCard title="Our Timing" description="Shown in the footer's Our Timing column. One line per day-range, e.g. 'Monday - Sunday: 11:00 AM - 04:55 AM'.">
            <textarea value={timingText} onChange={(e) => setTimingText(e.target.value)} className="input w-full" rows={2} required />
          </SettingsCard>

          <SettingsCard title="Social Links" description="Add as many accounts as you like: pick a platform and paste the profile URL.">
            <div className="space-y-2">
              {socialRows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={row.platform} onValueChange={(v) => updateSocialRow(i, { platform: v as SocialPlatformKey })}>
                    <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOCIAL_PLATFORM_KEYS.map((p) => (
                        <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    value={row.url}
                    onChange={(e) => updateSocialRow(i, { url: e.target.value })}
                    placeholder="https://..."
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeSocialRow(i)}
                    aria-label="Remove"
                    className="shrink-0 rounded-lg border border-neutral-300 px-3 text-neutral-500 hover:border-red-400 hover:text-red-600"
                  >
                    <CloseIcon size={13} />
                  </button>
                </div>
              ))}
            </div>
            {socialRows.length < SOCIAL_PLATFORM_KEYS.length && (
              <button
                type="button"
                onClick={addSocialRow}
                className="text-sm font-medium text-brand-red hover:opacity-80"
              >
                + Add Social Link
              </button>
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
