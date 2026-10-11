"use client";

import { useEffect, useState } from "react";
import { FaBullhorn, FaChartLine, FaFacebook, FaGoogle, FaMagnifyingGlassChart, FaTiktok, FaTag } from "react-icons/fa6";
import type { IconType } from "react-icons";
import { ApiError } from "../../../../lib/api";
import { toast } from "../../../../store/useToastStore";
import { SaveBar, SeoHeader, useCanManageSeo } from "../../../../components/seo/SeoUi";
import { saveSeo, useQueryClient, useSeo, type SeoConfig } from "../../../../lib/seo";

type Tracking = NonNullable<SeoConfig["tracking"]>;

type Integration = {
  group: string;
  icon: IconType;
  tone: string;
  title: string;
  description: string;
  fields: { key: keyof Tracking; label: string; placeholder: string; pattern: RegExp; hint: string }[];
  help: string;
};

const INTEGRATIONS: Integration[] = [
  {
    group: "Search",
    icon: FaMagnifyingGlassChart,
    tone: "bg-blue-50 text-blue-600",
    title: "Google Search Console",
    description: "Verify your site so Google reports how it appears in search and lets you submit the sitemap.",
    fields: [{ key: "googleSiteVerification", label: "Verification code", placeholder: "abc123XYZ_example-code", pattern: /^[A-Za-z0-9_-]*$/, hint: "Search Console > Add property > URL prefix > HTML tag. Copy only the content=\"...\" value, not the whole tag." }],
    help: "After saving, click Verify in Search Console, then submit /sitemap.xml under Sitemaps.",
  },
  {
    group: "Search",
    icon: FaGoogle,
    tone: "bg-sky-50 text-sky-600",
    title: "Bing Webmaster Tools",
    description: "Bing also powers other search engines and several AI assistants.",
    fields: [{ key: "bingSiteVerification", label: "Verification code", placeholder: "0123456789ABCDEF", pattern: /^[A-Za-z0-9_-]*$/, hint: "Bing Webmaster > Add site > HTML Meta Tag. Copy only the content value." }],
    help: "",
  },
  {
    group: "Analytics",
    icon: FaChartLine,
    tone: "bg-amber-50 text-amber-600",
    title: "Google Analytics 4",
    description: "See visitors, where they come from and which pages they use.",
    fields: [{ key: "ga4Id", label: "Measurement ID", placeholder: "G-XXXXXXXXXX", pattern: /^(G-[A-Z0-9]{4,20})?$/, hint: "Analytics > Admin > Data streams > your web stream > Measurement ID." }],
    help: "",
  },
  {
    group: "Analytics",
    icon: FaTag,
    tone: "bg-indigo-50 text-indigo-600",
    title: "Google Tag Manager",
    description: "Optional. Use it if you manage several tags from the Tag Manager dashboard. Avoid loading the same tag in both places.",
    fields: [{ key: "gtmId", label: "Container ID", placeholder: "GTM-XXXXXXX", pattern: /^(GTM-[A-Z0-9]{4,20})?$/, hint: "Tag Manager > your container > the ID at the top." }],
    help: "",
  },
  {
    group: "Advertising",
    icon: FaBullhorn,
    tone: "bg-green-50 text-green-600",
    title: "Google Ads",
    description: "Track ad clicks and enable remarketing audiences.",
    fields: [
      { key: "googleAdsId", label: "Google Ads tag ID", placeholder: "AW-123456789", pattern: /^(AW-\d{6,15})?$/, hint: "Google Ads > Goals > Conversions > Tag setup." },
      { key: "googleAdsPurchaseLabel", label: "Purchase conversion label (optional)", placeholder: "AbC-D_efG-h12", pattern: /^([A-Za-z0-9_-]{4,40})?$/, hint: "The part after the slash in AW-123456789/AbC-D_efG-h12." },
    ],
    help: "",
  },
  {
    group: "Advertising",
    icon: FaFacebook,
    tone: "bg-blue-50 text-blue-700",
    title: "Meta (Facebook & Instagram) Pixel",
    description: "Measure Facebook and Instagram ads and build retargeting audiences.",
    fields: [{ key: "metaPixelId", label: "Pixel ID", placeholder: "123456789012345", pattern: /^(\d{8,20})?$/, hint: "Meta Events Manager > Data sources > your pixel. It is a long number." }],
    help: "",
  },
  {
    group: "Advertising",
    icon: FaTiktok,
    tone: "bg-neutral-100 text-neutral-800",
    title: "TikTok Pixel",
    description: "Measure TikTok ads and build retargeting audiences.",
    fields: [{ key: "tiktokPixelId", label: "Pixel ID", placeholder: "C1ABCDEF2GHIJK3LMNOP", pattern: /^([A-Z0-9]{8,30})?$/, hint: "TikTok Ads Manager > Assets > Events > your Web Events pixel." }],
    help: "",
  },
];

export default function TrackingPage() {
  const queryClient = useQueryClient();
  const canManage = useCanManageSeo();
  const { site, seo } = useSeo();
  const [form, setForm] = useState<Tracking>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (site) setForm(seo.tracking ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  const saved = seo.tracking ?? {};
  const val = (k: keyof Tracking) => (form[k] ?? "").trim();
  const dirty = INTEGRATIONS.some((i) => i.fields.some((f) => val(f.key) !== (saved[f.key] ?? "")));
  const invalid = INTEGRATIONS.some((i) => i.fields.some((f) => !f.pattern.test(val(f.key))));

  async function save() {
    if (invalid) {
      toast.error("Please fix the highlighted IDs first");
      return;
    }
    setSaving(true);
    try {
      const tracking: Tracking = {};
      for (const i of INTEGRATIONS) for (const f of i.fields) tracking[f.key] = val(f.key);
      await saveSeo(queryClient, { tracking });
      toast.success("Tracking saved. It goes live on the website within a minute.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const groups = ["Search", "Analytics", "Advertising"];
  const connected = INTEGRATIONS.filter((i) => i.fields.some((f) => (saved[f.key] ?? "") !== "")).length;

  return (
    <div>
      <SeoHeader title="Tracking & Pixels" description="Connect Google Search Console, Analytics, Ads and the Meta and TikTok pixels. Paste the ID once and the tag is added to every page of the website automatically. No code needed." />

      <p className="mt-4 text-sm text-neutral-500">
        <span className="font-semibold text-neutral-800">{connected}</span> of {INTEGRATIONS.length} connected
      </p>

      <fieldset disabled={!canManage} className="mt-4 space-y-8 disabled:opacity-70">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{g}</h2>
            <div className="mt-2 grid gap-4 lg:grid-cols-2">
              {INTEGRATIONS.filter((i) => i.group === g).map((i) => {
                const Icon = i.icon;
                const isConnected = i.fields.some((f) => (saved[f.key] ?? "") !== "");
                return (
                  <div key={i.title} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${i.tone}`}>
                          <Icon size={18} />
                        </span>
                        <p className="text-sm font-semibold text-neutral-900">{i.title}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isConnected ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{isConnected ? "Connected" : "Not connected"}</span>
                    </div>
                    <p className="mt-3 text-xs text-neutral-500">{i.description}</p>
                    <div className="mt-3 space-y-3">
                      {i.fields.map((f) => {
                        const bad = !f.pattern.test(val(f.key));
                        return (
                          <label key={f.key} className="block">
                            <span className="text-xs font-medium text-neutral-700">{f.label}</span>
                            <input
                              value={form[f.key] ?? ""}
                              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                              placeholder={f.placeholder}
                              spellCheck={false}
                              className={`input mt-1 w-full font-mono text-[13px] ${bad ? "!border-red-400" : ""}`}
                            />
                            <span className={`mt-1 block text-[11px] ${bad ? "text-red-600" : "text-neutral-400"}`}>{bad ? "This does not look like a valid ID. Check the example above." : f.hint}</span>
                          </label>
                        );
                      })}
                      {i.help && <p className="rounded-md bg-neutral-50 px-3 py-2 text-[11px] text-neutral-500">{i.help}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </fieldset>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setForm(seo.tracking ?? {})} canManage={canManage} />
    </div>
  );
}
