import type { Metadata } from "next";
import { slugify } from "./slug";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export type SeoPageMeta = { title?: string; description?: string; image?: string; canonical?: string; noindex?: boolean };

export type SeoConfig = {
  siteUrl?: string;
  titleTemplate?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultImage?: string;
  noindexSite?: boolean;
  business?: { type?: string; priceRange?: string; cuisine?: string; streetAddress?: string; city?: string; region?: string; postalCode?: string; country?: string };
  tracking?: {
    googleSiteVerification?: string;
    bingSiteVerification?: string;
    ga4Id?: string;
    gtmId?: string;
    metaPixelId?: string;
    tiktokPixelId?: string;
    googleAdsId?: string;
    googleAdsPurchaseLabel?: string;
  };
  robots?: { allowAiSearch?: boolean; blockAiTraining?: boolean; disallow?: string[]; customRules?: string };
  sitemap?: { enabled?: boolean; extraUrls?: string[]; excluded?: string[] };
  pages?: Record<string, SeoPageMeta>;
  redirects?: { from: string; to: string; permanent: boolean }[];
};

export type SiteInfo = {
  name: string;
  logoUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  socialLinks: Record<string, string> | null;
  seo: SeoConfig;
};

const FALLBACK: SiteInfo = { name: "Demo Restaurant", logoUrl: null, contactPhone: null, contactEmail: null, socialLinks: null, seo: {} };

/** Server-side site info + SEO settings. Never throws: if the API is down the site still renders with sensible defaults. */
export async function getSite(): Promise<SiteInfo> {
  try {
    const res = await fetch(`${API_URL}/cms/restaurant`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return FALLBACK;
    const json = (await res.json()) as { data?: SiteInfo };
    return json.data ? { ...FALLBACK, ...json.data, seo: json.data.seo ?? {} } : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function siteUrlOf(seo: SeoConfig): string {
  const raw = (seo.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim();
  return raw.replace(/\/+$/, "");
}

/** "%s | {name}" -> "Menu | Demo Restaurant" */
export function applyTitleTemplate(template: string | undefined, title: string, name: string): string {
  return (template || "%s | {name}").replace("%s", title).replace("{name}", name);
}

const DEFAULT_TITLES: Record<string, { title: string; description: string }> = {
  locations: { title: "Our Locations", description: "Find our branches, opening hours and delivery areas near you." },
  blog: { title: "Blog", description: "Articles, tips and news from our kitchen." },
  faqs: { title: "FAQs", description: "Answers to common questions about ordering, delivery and payments." },
  "privacy-policy": { title: "Privacy Policy", description: "How we collect, use and protect your personal information." },
  terms: { title: "Terms & Conditions", description: "The terms that apply when you order from us." },
  complaints: { title: "Feedback & Complaints", description: "Tell us about your experience so we can make it right." },
};

/** Metadata for one of the fixed pages (locations, faqs, ...). Admin overrides win over the built-in defaults. */
export async function pageMetadata(key: string, path: string): Promise<Metadata> {
  const site = await getSite();
  const o = site.seo.pages?.[key] ?? {};
  const d = DEFAULT_TITLES[key] ?? { title: key, description: "" };
  const title = o.title || d.title;
  const description = o.description || d.description || site.seo.defaultDescription;
  const image = o.image || site.seo.defaultImage;
  return {
    title: o.title ? { absolute: o.title } : title,
    description,
    alternates: { canonical: o.canonical || path },
    robots: o.noindex ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url: path, images: image ? [image] : undefined },
  };
}

export type CatalogCategory = { id: string; name: string; description?: string | null; image?: string | null };

export async function getCategories(): Promise<CatalogCategory[]> {
  try {
    const res = await fetch(`${API_URL}/catalog/categories`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: CatalogCategory[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export const categorySlug = (c: { name: string }) => slugify(c.name);

/** Pages that must never be indexed: private, per-user or transactional. */
export const PRIVATE_PATHS = ["/checkout", "/account", "/order-confirmation"];
