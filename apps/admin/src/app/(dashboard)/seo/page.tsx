"use client";

import { useEffect, useMemo, useState } from "react";
import { FaTriangleExclamation, FaCircleCheck } from "react-icons/fa6";
import { ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { Switch } from "../../../components/ui/switch";
import { ImageUploadField } from "../../../components/ImageUploadField";
import { Card, Counter, Field, SaveBar, SeoHeader, SerpPreview, useCanManageSeo } from "../../../components/seo/SeoUi";
import { FIXED_PAGES, saveSeo, titleFor, useCategoryPages, useQueryClient, useSeo, webBaseUrl, type SeoConfig, type SeoPageMeta } from "../../../lib/seo";

type Tab = "pages" | "site" | "business";

const BUSINESS_TYPES = [
  ["Restaurant", "Restaurant"],
  ["FastFoodRestaurant", "Fast food restaurant"],
  ["CafeOrCoffeeShop", "Cafe / coffee shop"],
  ["Bakery", "Bakery"],
] as const;

export default function SeoMetaPage() {
  const queryClient = useQueryClient();
  const canManage = useCanManageSeo();
  const { site, seo } = useSeo();
  const categories = useCategoryPages();
  const [tab, setTab] = useState<Tab>("pages");
  const [pages, setPages] = useState<Record<string, SeoPageMeta>>({});
  const [defaults, setDefaults] = useState<SeoConfig>({});
  const [business, setBusiness] = useState<NonNullable<SeoConfig["business"]>>({});
  const [selected, setSelected] = useState("home");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!site) return;
    setPages(seo.pages ?? {});
    setDefaults({ siteUrl: seo.siteUrl ?? "", titleTemplate: seo.titleTemplate ?? "", defaultTitle: seo.defaultTitle ?? "", defaultDescription: seo.defaultDescription ?? "", defaultImage: seo.defaultImage ?? "", noindexSite: !!seo.noindexSite });
    setBusiness(seo.business ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  const allPages = useMemo(() => [...FIXED_PAGES, ...categories], [categories]);
  const current = allPages.find((p) => p.key === selected) ?? allPages[0]!;
  const meta = pages[current.key] ?? {};
  const base = webBaseUrl({ ...seo, siteUrl: defaults.siteUrl });
  const siteName = site?.name ?? "Your restaurant";

  const savedDefaults = { siteUrl: seo.siteUrl ?? "", titleTemplate: seo.titleTemplate ?? "", defaultTitle: seo.defaultTitle ?? "", defaultDescription: seo.defaultDescription ?? "", defaultImage: seo.defaultImage ?? "", noindexSite: !!seo.noindexSite };
  const dirty =
    tab === "pages" ? JSON.stringify(clean(pages)) !== JSON.stringify(clean(seo.pages ?? {})) : tab === "site" ? JSON.stringify(defaults) !== JSON.stringify(savedDefaults) : JSON.stringify(business) !== JSON.stringify(seo.business ?? {});

  function setMeta(patch: Partial<SeoPageMeta>) {
    setPages((p) => ({ ...p, [current.key]: { ...p[current.key], ...patch } }));
  }

  async function save() {
    setSaving(true);
    try {
      if (tab === "pages") await saveSeo(queryClient, { pages: clean(pages) });
      else if (tab === "site") await saveSeo(queryClient, defaults);
      else await saveSeo(queryClient, { business });
      toast.success("SEO settings saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setPages(seo.pages ?? {});
    setDefaults(savedDefaults);
    setBusiness(seo.business ?? {});
  }

  const statusOf = (key: string) => {
    const m = pages[key] ?? {};
    if (m.noindex) return { tone: "bg-neutral-100 text-neutral-500", label: "Hidden" };
    const ok = !!m.title && !!m.description;
    return ok ? { tone: "bg-green-50 text-green-700", label: "Ready" } : { tone: "bg-amber-50 text-amber-700", label: m.title || m.description ? "Partial" : "Default" };
  };

  const previewTitle = meta.title ? meta.title : tab === "pages" && current.key === "home" ? defaults.defaultTitle || siteName : titleFor({ ...seo, titleTemplate: defaults.titleTemplate }, siteName, current.label);

  return (
    <div>
      <SeoHeader title="SEO & Meta Tags" description="Control how each page of your website appears on Google. Write a title and description per page; anything left empty falls back to a sensible default." />

      <div className="mt-5 flex gap-1 border-b border-neutral-200">
        {(
          [
            ["pages", "Page titles & descriptions"],
            ["site", "Site-wide defaults"],
            ["business", "Business info (Google schema)"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === k ? "border-brand-red text-brand-red" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "pages" && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-xl border border-neutral-200 bg-white p-2 lg:self-start">
            <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Pages</p>
            {FIXED_PAGES.map((p) => (
              <PageRow key={p.key} label={p.label} path={p.path} active={current.key === p.key} status={statusOf(p.key)} onClick={() => setSelected(p.key)} />
            ))}
            {categories.length > 0 && <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Categories</p>}
            {categories.map((p) => (
              <PageRow key={p.key} label={p.label} path={p.path} active={current.key === p.key} status={statusOf(p.key)} onClick={() => setSelected(p.key)} />
            ))}
          </div>

          <fieldset disabled={!canManage} className="min-w-0 space-y-4 disabled:opacity-70">
            <SerpPreview url={`${base || "your-website.com"}${current.path === "/" ? "" : current.path}`} title={previewTitle} description={meta.description || (current.key === "home" ? defaults.defaultDescription : "") || ""} />

            <Card title={current.label} description={current.hint}>
              <Field label="Page title" hint="Aim for 30 to 60 characters. Put the most important words first." right={<Counter value={meta.title ?? ""} min={30} max={60} />}>
                <input value={meta.title ?? ""} onChange={(e) => setMeta({ title: e.target.value })} maxLength={120} placeholder={current.key === "home" ? defaults.defaultTitle || siteName : `${current.label} (default)`} className="input w-full" />
              </Field>
              <Field label="Meta description" hint="Aim for 120 to 160 characters. Say what the page offers and why to click." right={<Counter value={meta.description ?? ""} min={120} max={160} />}>
                <textarea value={meta.description ?? ""} onChange={(e) => setMeta({ description: e.target.value })} maxLength={320} rows={3} className="input w-full" placeholder="Order fresh burgers, pizzas and more online. Fast delivery across the city." />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Share image" hint="Shown when the link is shared on WhatsApp, Facebook, X. 1200x630 works best.">
                  <ImageUploadField label="Share image" hideLabel folder="restaurant" value={meta.image ?? ""} onChange={(url) => setMeta({ image: url })} shape="landscape" />
                </Field>
                <div className="space-y-4">
                  <Field label="Canonical address (optional)" hint="Only change this if the same content lives on another address. Leave empty to use the page's own.">
                    <input value={meta.canonical ?? ""} onChange={(e) => setMeta({ canonical: e.target.value })} placeholder={`${base}${current.path === "/" ? "" : current.path}`} className="input w-full" />
                  </Field>
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 p-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-800">Hide this page from Google</p>
                      <p className="text-xs text-neutral-500">Adds &quot;noindex&quot; and removes it from the sitemap.</p>
                    </div>
                    <Switch checked={!!meta.noindex} onCheckedChange={(v) => setMeta({ noindex: v })} aria-label="Hide from Google" />
                  </div>
                </div>
              </div>
            </Card>
          </fieldset>
        </div>
      )}

      {tab === "site" && (
        <fieldset disabled={!canManage} className="mt-5 grid max-w-3xl gap-4 disabled:opacity-70">
          <div className={`rounded-xl border-2 p-5 ${defaults.noindexSite ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50/60"}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                  {defaults.noindexSite ? <FaTriangleExclamation className="text-red-600" /> : <FaCircleCheck className="text-green-600" />}
                  {defaults.noindexSite ? "Website is hidden from Google" : "Website can be found on Google"}
                </p>
                <p className="mt-1 text-xs text-neutral-600">{defaults.noindexSite ? "Search engines are told NOT to index any page. Turn this off before launch." : "Googlebot and other search engines are allowed to crawl and index your public pages."}</p>
              </div>
              <Switch checked={!defaults.noindexSite} onCheckedChange={(v) => setDefaults((d) => ({ ...d, noindexSite: !v }))} aria-label="Allow search engines" />
            </div>
          </div>

          <Card title="Website address" description="Used for canonical links, the sitemap and structured data.">
            <Field label="Website URL" hint="The real public address, with https, no trailing slash. Example: https://www.myrestaurant.com">
              <input value={defaults.siteUrl ?? ""} onChange={(e) => setDefaults((d) => ({ ...d, siteUrl: e.target.value }))} placeholder="https://www.myrestaurant.com" className="input w-full" />
            </Field>
          </Card>

          <Card title="Default title & description" description="Used on the home page and any page you have not written its own for.">
            <Field label="Home page title" right={<Counter value={defaults.defaultTitle ?? ""} min={30} max={60} />}>
              <input value={defaults.defaultTitle ?? ""} onChange={(e) => setDefaults((d) => ({ ...d, defaultTitle: e.target.value }))} placeholder={`${siteName} | Order food online`} maxLength={120} className="input w-full" />
            </Field>
            <Field label="Title format for other pages" hint="%s becomes the page title and {name} your restaurant name. Example result: “Locations | Demo Restaurant”.">
              <input value={defaults.titleTemplate ?? ""} onChange={(e) => setDefaults((d) => ({ ...d, titleTemplate: e.target.value }))} placeholder="%s | {name}" className="input w-full" />
            </Field>
            <Field label="Default description" right={<Counter value={defaults.defaultDescription ?? ""} min={120} max={160} />}>
              <textarea value={defaults.defaultDescription ?? ""} onChange={(e) => setDefaults((d) => ({ ...d, defaultDescription: e.target.value }))} rows={3} maxLength={320} className="input w-full" />
            </Field>
            <Field label="Default share image" hint="Used when a page has no image of its own.">
              <ImageUploadField label="Default share image" hideLabel folder="restaurant" value={defaults.defaultImage ?? ""} onChange={(url) => setDefaults((d) => ({ ...d, defaultImage: url }))} shape="landscape" />
            </Field>
          </Card>
        </fieldset>
      )}

      {tab === "business" && (
        <fieldset disabled={!canManage} className="mt-5 grid max-w-3xl gap-4 disabled:opacity-70">
          <Card title="Business details for Google" description="Helps Google show your restaurant with address, phone, price range and cuisine. Your name, logo, phone, email and social links are taken from the other settings pages automatically.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business type">
                <select value={business.type ?? "Restaurant"} onChange={(e) => setBusiness((b) => ({ ...b, type: e.target.value }))} className="input w-full">
                  {BUSINESS_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Price range" hint="Example: Rs. 500 - 2,000, or $$">
                <input value={business.priceRange ?? ""} onChange={(e) => setBusiness((b) => ({ ...b, priceRange: e.target.value }))} className="input w-full" maxLength={20} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Cuisine" hint="Separate with commas. Example: Pakistani, Fast Food, BBQ">
                  <input value={business.cuisine ?? ""} onChange={(e) => setBusiness((b) => ({ ...b, cuisine: e.target.value }))} className="input w-full" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Street address (head office / main branch)">
                  <input value={business.streetAddress ?? ""} onChange={(e) => setBusiness((b) => ({ ...b, streetAddress: e.target.value }))} className="input w-full" />
                </Field>
              </div>
              <Field label="City">
                <input value={business.city ?? ""} onChange={(e) => setBusiness((b) => ({ ...b, city: e.target.value }))} className="input w-full" />
              </Field>
              <Field label="Province / region">
                <input value={business.region ?? ""} onChange={(e) => setBusiness((b) => ({ ...b, region: e.target.value }))} className="input w-full" />
              </Field>
              <Field label="Postal code">
                <input value={business.postalCode ?? ""} onChange={(e) => setBusiness((b) => ({ ...b, postalCode: e.target.value }))} className="input w-full" />
              </Field>
              <Field label="Country code" hint="Two letters, for example PK">
                <input value={business.country ?? ""} onChange={(e) => setBusiness((b) => ({ ...b, country: e.target.value.toUpperCase().slice(0, 2) }))} className="input w-full" maxLength={2} placeholder="PK" />
              </Field>
            </div>
          </Card>
        </fieldset>
      )}

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={reset} canManage={canManage} />
    </div>
  );
}

/** Drop empty fields so "cleared" pages don't keep stale blanks in the database. */
function clean(pages: Record<string, SeoPageMeta>): Record<string, SeoPageMeta> {
  const out: Record<string, SeoPageMeta> = {};
  for (const [k, v] of Object.entries(pages)) {
    const entry: SeoPageMeta = {
      title: v.title ?? "",
      description: v.description ?? "",
      image: v.image ?? "",
      canonical: v.canonical ?? "",
      noindex: !!v.noindex,
    };
    if (entry.title || entry.description || entry.image || entry.canonical || entry.noindex) out[k] = entry;
  }
  return out;
}

function PageRow({ label, path, active, status, onClick }: { label: string; path: string; active: boolean; status: { tone: string; label: string }; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition ${active ? "bg-brand-red/10" : "hover:bg-neutral-50"}`}>
      <span className="min-w-0">
        <span className={`block truncate text-sm ${active ? "font-semibold text-brand-red" : "font-medium text-neutral-800"}`}>{label}</span>
        <span className="block truncate text-[11px] text-neutral-400">{path}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.tone}`}>{status.label}</span>
    </button>
  );
}
