import type { MetadataRoute } from "next";
import { getBlogSlugs } from "../lib/blog";
import { getBankDiscounts } from "../lib/bank-discounts";
import { categorySlug, getCategories, getSite, siteUrlOf } from "../lib/seo";

export const revalidate = 300;

const STATIC_PAGES: { key: string; path: string; priority: number }[] = [
  { key: "home", path: "/", priority: 1 },
  { key: "locations", path: "/our-locations", priority: 0.7 },
  { key: "blog", path: "/blog", priority: 0.6 },
  { key: "faqs", path: "/faqs", priority: 0.5 },
  { key: "complaints", path: "/complaints", priority: 0.3 },
  { key: "privacy-policy", path: "/privacy-policy", priority: 0.2 },
  { key: "terms", path: "/terms", priority: 0.2 },
];

/** sitemap.xml: every public page, minus anything set to noindex or excluded in Admin > SEO & Marketing. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { seo } = await getSite();
  if (seo.sitemap?.enabled === false || seo.noindexSite) return [];
  const base = siteUrlOf(seo);
  const excluded = new Set(seo.sitemap?.excluded ?? []);
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_PAGES.filter((p) => !seo.pages?.[p.key]?.noindex && !excluded.has(p.path)).map((p) => ({
    url: `${base}${p.path === "/" ? "" : p.path}`,
    lastModified: now,
    changeFrequency: p.path === "/" ? "daily" : "monthly",
    priority: p.priority,
  }));

  for (const c of await getCategories()) {
    const slug = categorySlug(c);
    const path = `/category/${slug}`;
    if (!slug || seo.pages?.[`category:${slug}`]?.noindex || excluded.has(path)) continue;
    entries.push({ url: `${base}${path}`, lastModified: now, changeFrequency: "daily", priority: 0.8 });
  }

  const bank = await getBankDiscounts();
  if (bank?.enabled && !seo.pages?.["bank-discounts"]?.noindex && !excluded.has("/bank-discounts")) {
    entries.push({ url: `${base}/bank-discounts`, lastModified: now, changeFrequency: "monthly", priority: 0.5 });
  }

  for (const post of (await getBlogSlugs()) ?? []) {
    const path = `/blog/${post.slug}`;
    if (seo.pages?.[`blog:${post.slug}`]?.noindex || excluded.has(path)) continue;
    entries.push({ url: `${base}${path}`, lastModified: new Date(post.updatedAt), changeFrequency: "monthly", priority: 0.5 });
  }

  for (const extra of seo.sitemap?.extraUrls ?? []) {
    const url = /^https?:\/\//.test(extra) ? extra : `${base}${extra.startsWith("/") ? "" : "/"}${extra}`;
    entries.push({ url, lastModified: now });
  }
  return entries;
}
