"use client";

import { useEffect, useMemo, useState } from "react";
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

const PARAGRAPH_MAX = 5000;
const HEADING_MAX = 200;

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

function StatusPill({ on, onText, offText }: { on: boolean; onText: string; offText: string }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${on ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{on ? onText : offText}</span>;
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
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const snapshot = useMemo(() => JSON.stringify({ bannerImage, aboutEnabled, aboutHeading, aboutParagraph, truncateLength }), [bannerImage, aboutEnabled, aboutHeading, aboutParagraph, truncateLength]);
  const dirty = saved !== "" && snapshot !== saved;

  useEffect(() => {
    if (!restaurant) return;
    const next = {
      bannerImage: restaurant.appPromo.bannerImage ?? "",
      aboutEnabled: restaurant.aboutContent.enabled,
      aboutHeading: restaurant.aboutContent.heading,
      aboutParagraph: restaurant.aboutContent.paragraph,
      truncateLength: restaurant.aboutContent.truncateLength,
    };
    setBannerImage(next.bannerImage);
    setAboutEnabled(next.aboutEnabled);
    setAboutHeading(next.aboutHeading);
    setAboutParagraph(next.aboutParagraph);
    setTruncateLength(next.truncateLength);
    setSaved(JSON.stringify(next));
  }, [restaurant]);

  function reset() {
    if (!saved) return;
    const s = JSON.parse(saved) as { bannerImage: string; aboutEnabled: boolean; aboutHeading: string; aboutParagraph: string; truncateLength: number };
    setBannerImage(s.bannerImage);
    setAboutEnabled(s.aboutEnabled);
    setAboutHeading(s.aboutHeading);
    setAboutParagraph(s.aboutParagraph);
    setTruncateLength(s.truncateLength);
  }

  const truncateValid = truncateLength >= 50 && truncateLength <= 2000;
  const needsTruncation = aboutParagraph.length > truncateLength;
  const headingMissing = aboutEnabled && !aboutHeading.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (headingMissing) {
      toast.error("Add a heading, or turn the About section off");
      return;
    }
    if (!truncateValid) {
      toast.error("Collapse length must be between 50 and 2000 characters");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", {
        appPromo: { bannerImage: bannerImage || null },
        aboutContent: {
          enabled: aboutEnabled,
          // The API rejects an empty heading even when the section is off, so keep the last good one.
          heading: aboutHeading.trim() || restaurant?.aboutContent.heading || "About us",
          paragraph: aboutParagraph.trim(),
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

  const paragraphs = aboutParagraph.split(/\n{2,}/).filter(Boolean);
  const preview = needsTruncation ? aboutParagraph.slice(0, truncateLength).trimEnd() + "…" : aboutParagraph;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">App Promo & About</h1>
      <p className="mt-1 text-sm text-neutral-500">Two optional sections on the homepage, just above the footer: a promo banner and an About text. Leave either empty or off to hide it.</p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={!canManage} className="grid grid-cols-1 gap-5 disabled:opacity-70 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <SectionCard
              n={1}
              title="Promo banner"
              description="A wide image shown on the homepage. No image means nothing is shown."
              right={<StatusPill on={!!bannerImage} onText="Visible" offText="Hidden" />}
            >
              <ImageUploadField label="Banner image" folder="banners" value={bannerImage} onChange={setBannerImage} shape="landscape" hint="Landscape, e.g. 1680×600 (JPG, PNG or WEBP)" />
            </SectionCard>

            <SectionCard
              n={2}
              title="About text"
              description="A heading with a paragraph that collapses behind a Show more button."
              right={<Switch checked={aboutEnabled} onCheckedChange={setAboutEnabled} aria-label="Show about section" />}
            >
              <StatusPill on={aboutEnabled} onText="Shown on homepage" offText="Hidden — turn on with the switch" />
              <div className={aboutEnabled ? "space-y-3" : "space-y-3 opacity-60"}>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Heading {aboutEnabled && "*"}</p>
                  <input
                    value={aboutHeading}
                    onChange={(e) => setAboutHeading(e.target.value.slice(0, HEADING_MAX))}
                    className={`input w-full ${headingMissing ? "!border-red-400" : ""}`}
                    placeholder="e.g. Welcome to our restaurant"
                  />
                  {headingMissing && <p className="mt-1 text-xs text-red-600">A heading is required while this section is on.</p>}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Paragraph</p>
                  <textarea
                    value={aboutParagraph}
                    onChange={(e) => setAboutParagraph(e.target.value.slice(0, PARAGRAPH_MAX))}
                    className="input w-full"
                    rows={9}
                    placeholder="Tell customers about your food, story and values. Leave a blank line between paragraphs."
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-400">
                    <span>Leave a blank line to start a new paragraph.</span>
                    <span>{aboutParagraph.length}/{PARAGRAPH_MAX}</span>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Show this many characters before “Show more”</p>
                  <div className="flex items-center gap-3">
                    <input type="range" min={50} max={2000} step={10} value={truncateValid ? truncateLength : 280} onChange={(e) => setTruncateLength(Number(e.target.value))} className="flex-1 accent-[#ED2320]" />
                    <input type="number" min={50} max={2000} value={truncateLength} onChange={(e) => setTruncateLength(Number(e.target.value))} className={`input w-24 ${truncateValid ? "" : "!border-red-400"}`} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    {!truncateValid
                      ? "Enter a number between 50 and 2000."
                      : aboutParagraph.length === 0
                        ? "Add a paragraph to see how it will collapse."
                        : needsTruncation
                          ? `Your text is ${aboutParagraph.length} characters, so customers will see a “Show more” button.`
                          : `Your text is ${aboutParagraph.length} characters, shorter than the limit, so it is shown in full with no button.`}
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-neutral-900">Live preview</p>
              <div className="mt-3 space-y-4 rounded-xl border border-neutral-200 bg-[#F2EFE9] p-3">
                {bannerImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bannerImage} alt="" className="w-full rounded-2xl object-cover" />
                ) : (
                  <p className="rounded-xl border border-dashed border-neutral-300 py-5 text-center text-xs text-neutral-400">No promo banner (hidden)</p>
                )}
                {aboutEnabled && (aboutHeading.trim() || aboutParagraph.trim()) ? (
                  <div className="text-center">
                    {aboutHeading.trim() && <h3 className="text-base font-bold text-neutral-900">{aboutHeading}</h3>}
                    <div className="mt-2 text-xs leading-relaxed text-neutral-500">
                      {previewOpen ? paragraphs.map((p, i) => <p key={i} className={i > 0 ? "mt-2" : ""}>{p}</p>) : <p>{preview}</p>}
                    </div>
                    {needsTruncation && (
                      <button type="button" onClick={() => setPreviewOpen((v) => !v)} className="mt-2 text-xs font-semibold text-neutral-600 hover:opacity-80">
                        {previewOpen ? "Show Less ▴" : "Show More ▾"}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-neutral-300 py-5 text-center text-xs text-neutral-400">{aboutEnabled ? "Type a heading and paragraph" : "About text is off (hidden)"}</p>
                )}
              </div>
              <p className="mt-2 text-[11px] text-neutral-400">A simplified preview of what appears above the footer.</p>
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
