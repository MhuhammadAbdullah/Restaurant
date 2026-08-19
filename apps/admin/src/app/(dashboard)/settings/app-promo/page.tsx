"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AboutContentConfig, AppPromoConfig } from "@restaurant/validation";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { ImageUploadField } from "../../../../components/ImageUploadField";
import { Switch } from "../../../../components/ui/switch";

type RestaurantInfo = {
  appPromo: Required<AppPromoConfig>;
  aboutContent: Required<AboutContentConfig>;
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

export default function AppPromoSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });

  const [bannerImage, setBannerImage] = useState("");

  const [aboutEnabled, setAboutEnabled] = useState(false);
  const [aboutHeading, setAboutHeading] = useState("");
  const [aboutParagraph, setAboutParagraph] = useState("");
  const [truncateLength, setTruncateLength] = useState(280);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurant) return;
    setBannerImage(restaurant.appPromo.bannerImage ?? "");

    setAboutEnabled(restaurant.aboutContent.enabled);
    setAboutHeading(restaurant.aboutContent.heading);
    setAboutParagraph(restaurant.aboutContent.paragraph);
    setTruncateLength(restaurant.aboutContent.truncateLength);
  }, [restaurant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", {
        appPromo: {
          bannerImage: bannerImage || null,
        },
        aboutContent: {
          enabled: aboutEnabled,
          heading: aboutHeading,
          paragraph: aboutParagraph,
          truncateLength,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
      toast.success("Saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save these sections");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">App Promo & About Section</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Two optional sections shown on the homepage, just above the footer: a promo banner image, and a heading + expandable paragraph.
      </p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4 max-w-xl">
        <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-70">
          <SettingsCard title="Promo Banner Image" description="Shown on the homepage just above the footer. Leave empty to hide it entirely — no placeholder is shown.">
            <ImageUploadField label="Banner Image" folder="banners" value={bannerImage} onChange={setBannerImage} />
          </SettingsCard>

          <SettingsCard title="About / Homepage Text" description="A heading and long-form paragraph, collapsed with a Show more/Show less toggle. Turn off to hide it.">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <Switch checked={aboutEnabled} onCheckedChange={setAboutEnabled} aria-label="Show about section" />
              Show this section on the homepage
            </label>

            <div>
              <p className="mb-1 text-xs font-medium text-neutral-500">Heading</p>
              <input value={aboutHeading} onChange={(e) => setAboutHeading(e.target.value)} className="input w-full" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-500">Paragraph</p>
              <textarea value={aboutParagraph} onChange={(e) => setAboutParagraph(e.target.value)} className="input w-full" rows={8} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-500">Collapse after how many characters</p>
              <input
                type="number"
                min={50}
                max={2000}
                value={truncateLength}
                onChange={(e) => setTruncateLength(Number(e.target.value))}
                className="input w-32"
              />
            </div>
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
