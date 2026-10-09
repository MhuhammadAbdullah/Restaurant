"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaFacebook, FaInstagram, FaLinkedin, FaTiktok, FaWhatsapp, FaXTwitter, FaYoutube } from "react-icons/fa6";
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
const TAGLINE_MAX = 200;
const TIMING_MAX = 300;

const PLATFORM_META: Record<SocialPlatformKey, { label: string; icon: (p: { size?: number }) => React.ReactElement; placeholder: string }> = {
  facebook: { label: "Facebook", icon: (p) => <FaFacebook {...p} />, placeholder: "https://facebook.com/yourpage" },
  instagram: { label: "Instagram", icon: (p) => <FaInstagram {...p} />, placeholder: "https://instagram.com/yourhandle" },
  twitter: { label: "Twitter / X", icon: (p) => <FaXTwitter {...p} />, placeholder: "https://x.com/yourhandle" },
  youtube: { label: "YouTube", icon: (p) => <FaYoutube {...p} />, placeholder: "https://youtube.com/@yourchannel" },
  tiktok: { label: "TikTok", icon: (p) => <FaTiktok {...p} />, placeholder: "https://tiktok.com/@yourhandle" },
  linkedin: { label: "LinkedIn", icon: (p) => <FaLinkedin {...p} />, placeholder: "https://linkedin.com/company/yourpage" },
  whatsapp: { label: "WhatsApp", icon: (p) => <FaWhatsapp {...p} />, placeholder: "https://wa.me/923001234567" },
};

const DAY_PRESETS = ["Monday - Sunday", "Monday - Friday", "Monday - Saturday", "Saturday - Sunday", "Friday - Saturday"];

type SocialRow = { platform: SocialPlatformKey; url: string };

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

function unusedPlatform(rows: SocialRow[]): SocialPlatformKey {
  return SOCIAL_PLATFORM_KEYS.find((p) => !rows.some((r) => r.platform === p)) ?? SOCIAL_PLATFORM_KEYS[0]!;
}

function isValidUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** "09:30" → "9:30 AM" */
function to12h(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return "";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
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
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [builder, setBuilder] = useState({ days: DAY_PRESETS[0]!, open: "11:00", close: "23:00" });

  const snapshot = useMemo(() => JSON.stringify({ tagline, timingText, footerLogoUrl, useAsProductFallback, socialRows }), [tagline, timingText, footerLogoUrl, useAsProductFallback, socialRows]);
  const dirty = saved !== "" && snapshot !== saved;

  useEffect(() => {
    if (!restaurant) return;
    const entries = Object.entries(restaurant.socialLinks ?? {}) as [SocialPlatformKey, string][];
    const next = {
      tagline: restaurant.footer?.tagline ?? DEFAULT_TAGLINE,
      timingText: restaurant.footer?.timingText ?? DEFAULT_TIMING,
      footerLogoUrl: restaurant.footerLogoUrl ?? "",
      useAsProductFallback: restaurant.productImageFallbackSource === "FOOTER",
      socialRows: entries.map(([platform, url]) => ({ platform, url })),
    };
    setTagline(next.tagline);
    setTimingText(next.timingText);
    setFooterLogoUrl(next.footerLogoUrl);
    setUseAsProductFallback(next.useAsProductFallback);
    setSocialRows(next.socialRows);
    setSaved(JSON.stringify(next));
  }, [restaurant]);

  function reset() {
    if (!saved) return;
    const s = JSON.parse(saved) as { tagline: string; timingText: string; footerLogoUrl: string; useAsProductFallback: boolean; socialRows: SocialRow[] };
    setTagline(s.tagline);
    setTimingText(s.timingText);
    setFooterLogoUrl(s.footerLogoUrl);
    setUseAsProductFallback(s.useAsProductFallback);
    setSocialRows(s.socialRows);
  }

  function addSocialRow() {
    setSocialRows((rows) => [...rows, { platform: unusedPlatform(rows), url: "" }]);
  }
  function updateSocialRow(index: number, patch: Partial<SocialRow>) {
    setSocialRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeSocialRow(index: number) {
    setSocialRows((rows) => rows.filter((_, i) => i !== index));
  }
  function addTimingLine() {
    const line = `${builder.days}: ${to12h(builder.open)} - ${to12h(builder.close)}`;
    setTimingText((t) => (t.trim() ? `${t.trim()}\n${line}` : line).slice(0, TIMING_MAX));
  }

  const rowError = (row: SocialRow) => (row.url.trim() && !isValidUrl(row.url.trim()) ? "Enter a full link starting with https://" : null);
  const duplicate = (row: SocialRow, i: number) => socialRows.findIndex((r) => r.platform === row.platform) !== i;
  const hasErrors = socialRows.some((r, i) => !!rowError(r) || duplicate(r, i));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (hasErrors) {
      toast.error("Fix the highlighted social links first");
      return;
    }
    setSaving(true);
    try {
      const socialLinks: Partial<Record<SocialPlatformKey, string>> = {};
      for (const row of socialRows) {
        if (row.url.trim()) socialLinks[row.platform] = row.url.trim();
      }

      await api.patch("/cms/restaurant", {
        socialLinks,
        footer: { tagline: tagline.trim(), timingText: timingText.trim() },
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

  const previewSocials = socialRows.filter((r) => r.url.trim() && isValidUrl(r.url.trim()));

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Footer</h1>
      <p className="mt-1 text-sm text-neutral-500">The logo, tagline, opening hours and social links at the bottom of your website. The preview updates as you type.</p>

      <div className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
        The footer&apos;s <b>phone and address</b> come from the customer&apos;s chosen branch automatically; edit them in{" "}
        <Link href="/branches" className="font-medium underline">Branches</Link>. Terms, Privacy and FAQs are edited in{" "}
        <Link href="/settings/pages" className="font-medium underline">Legal Pages</Link>.
      </div>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={!canManage} className="grid grid-cols-1 gap-5 disabled:opacity-70 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <SectionCard n={1} title="Footer logo" description="Can be different from the header logo, e.g. a white version for a dark footer.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[190px_1fr]">
                <ImageUploadField label="Footer Logo" folder="restaurant" value={footerLogoUrl} onChange={setFooterLogoUrl} shape="square" hint="Square, transparent PNG works best" />
                <label className={`flex cursor-pointer items-start gap-3 self-start rounded-lg border p-3 ${useAsProductFallback ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}>
                  <input type="checkbox" checked={useAsProductFallback} onChange={(e) => setUseAsProductFallback(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#ED2320]" />
                  <span>
                    <span className="block text-sm font-medium text-neutral-900">Use as product placeholder</span>
                    <span className="block text-xs text-neutral-500">Products without a photo will show this logo.</span>
                  </span>
                </label>
              </div>
            </SectionCard>

            <SectionCard n={2} title="Tagline" description="A short line under the restaurant name.">
              <input value={tagline} onChange={(e) => setTagline(e.target.value.slice(0, TAGLINE_MAX))} className="input w-full" placeholder={DEFAULT_TAGLINE} required />
              <p className="text-right text-[11px] text-neutral-400">{tagline.length}/{TAGLINE_MAX}</p>
            </SectionCard>

            <SectionCard n={3} title="Opening hours" description="Each line is shown on its own row in the footer's Our Timing column.">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <p className="mb-2 text-xs font-medium text-neutral-500">Quick add a line</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_110px_110px_auto]">
                  <div className="col-span-2 sm:col-span-1">
                    <Select value={builder.days} onValueChange={(v) => setBuilder({ ...builder, days: v })}>
                      <SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DAY_PRESETS.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <input type="time" value={builder.open} onChange={(e) => setBuilder({ ...builder, open: e.target.value })} className="input bg-white" aria-label="Opens" />
                  <input type="time" value={builder.close} onChange={(e) => setBuilder({ ...builder, close: e.target.value })} className="input bg-white" aria-label="Closes" />
                  <button type="button" onClick={addTimingLine} className="col-span-2 rounded-lg border border-brand-red bg-white px-3 py-2 text-sm font-medium text-brand-red hover:bg-red-50 sm:col-span-1">
                    + Add
                  </button>
                </div>
              </div>
              <textarea value={timingText} onChange={(e) => setTimingText(e.target.value.slice(0, TIMING_MAX))} className="input w-full" rows={3} placeholder={DEFAULT_TIMING} required />
              <p className="text-right text-[11px] text-neutral-400">{timingText.length}/{TIMING_MAX}</p>
            </SectionCard>

            <SectionCard n={4} title="Social links" description="Pick a platform and paste the full profile link. Empty rows are ignored.">
              <div className="space-y-2.5">
                {socialRows.map((row, i) => {
                  const err = rowError(row) ?? (duplicate(row, i) ? `${PLATFORM_META[row.platform].label} is already added` : null);
                  return (
                    <div key={i}>
                      <div className="flex gap-2">
                        <Select value={row.platform} onValueChange={(v) => updateSocialRow(i, { platform: v as SocialPlatformKey })}>
                          <SelectTrigger className="w-40 shrink-0">
                            <span className="flex items-center gap-2">
                              <span className="text-brand-red">{PLATFORM_META[row.platform].icon({ size: 14 })}</span>
                              <SelectValue />
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {SOCIAL_PLATFORM_KEYS.map((p) => (
                              <SelectItem key={p} value={p}>{PLATFORM_META[p].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <input
                          value={row.url}
                          onChange={(e) => updateSocialRow(i, { url: e.target.value })}
                          placeholder={PLATFORM_META[row.platform].placeholder}
                          className={`input min-w-0 flex-1 ${err ? "!border-red-400" : ""}`}
                        />
                        {row.url.trim() && isValidUrl(row.url.trim()) && (
                          <a href={row.url.trim()} target="_blank" rel="noreferrer" className="flex shrink-0 items-center rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
                            Test
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => removeSocialRow(i)}
                          aria-label="Remove"
                          className="shrink-0 rounded-lg border border-neutral-300 px-3 text-neutral-500 hover:border-red-400 hover:text-red-600"
                        >
                          <CloseIcon size={13} />
                        </button>
                      </div>
                      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
                    </div>
                  );
                })}
                {socialRows.length === 0 && <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-400">No social links yet.</p>}
              </div>
              {socialRows.length < SOCIAL_PLATFORM_KEYS.length && (
                <button type="button" onClick={addSocialRow} className="w-full rounded-lg border border-dashed border-brand-red py-2 text-sm font-medium text-brand-red hover:bg-red-50">
                  + Add social link
                </button>
              )}
            </SectionCard>
          </div>

          <aside className="xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-neutral-900">Live preview</p>
              <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-[#F2EFE9] p-4">
                <div className="flex flex-col items-center text-center">
                  {footerLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={footerLogoUrl} alt="" className="h-16 w-auto object-contain" />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-lg font-bold text-brand-red">{(restaurant?.name ?? "R").charAt(0).toUpperCase()}</span>
                  )}
                  <p className="mt-2 text-xs font-semibold text-neutral-900">{restaurant?.name ?? "Restaurant"}</p>
                  <p className="mt-1 text-xs text-neutral-500">{tagline || DEFAULT_TAGLINE}</p>
                  {previewSocials.length > 0 && (
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      {previewSocials.map((r) => (
                        <span key={r.platform} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-red shadow-sm">{PLATFORM_META[r.platform].icon({ size: 14 })}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-4 border-t border-neutral-300/60 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-700">Our Timing</p>
                  <div className="mt-1.5 space-y-0.5 text-xs text-neutral-600">
                    {(timingText || DEFAULT_TIMING).split("\n").map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-neutral-400">A simplified preview. The real footer also shows branch phone, address and links.</p>
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
