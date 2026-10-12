import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";

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

export type SiteInfo = { name: string; logoUrl: string | null; contactPhone: string | null; contactEmail: string | null; seo: SeoConfig };

export const DEFAULT_TITLE_TEMPLATE = "%s | {name}";

/** The storefront's fixed pages. Category pages are added from the live category list. */
export const FIXED_PAGES: { key: string; label: string; path: string; hint: string }[] = [
  { key: "home", label: "Home", path: "/", hint: "The main menu page. This is what most people find on Google." },
  { key: "locations", label: "Locations", path: "/our-locations", hint: "Branches, hours and delivery areas." },
  { key: "faqs", label: "FAQs", path: "/faqs", hint: "Common questions. Often shown as rich answers on Google." },
  { key: "complaints", label: "Feedback & Complaints", path: "/complaints", hint: "Customer feedback form." },
  { key: "privacy-policy", label: "Privacy Policy", path: "/privacy-policy", hint: "Legal page." },
  { key: "terms", label: "Terms & Conditions", path: "/terms", hint: "Legal page." },
];

export const slugify = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function webBaseUrl(seo?: SeoConfig): string {
  const configured = seo?.siteUrl?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NEXT_PUBLIC_WEB_URL) return process.env.NEXT_PUBLIC_WEB_URL.replace(/\/+$/, "");
  return typeof window !== "undefined" && window.location.hostname === "localhost" ? "http://localhost:3000" : "";
}

export function useSeo() {
  const q = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<SiteInfo>("/cms/restaurant") });
  return { site: q.data, seo: (q.data?.seo ?? {}) as SeoConfig, isLoading: q.isLoading };
}

export function useCategoryPages() {
  const { data } = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.get<{ id: string; name: string; status: string; description: string | null; image: string | null }[]>("/catalog/categories/admin/all") });
  return (data ?? []).filter((c) => c.status === "ACTIVE").map((c) => ({ key: `category:${slugify(c.name)}`, label: c.name, path: `/category/${slugify(c.name)}`, hint: "Category page.", description: c.description, image: c.image }));
}

/** Saves one slice of the SEO settings; the API merges it so other screens' values stay untouched. */
export async function saveSeo(queryClient: QueryClient, patch: SeoConfig) {
  await api.patch("/cms/restaurant", { seo: patch });
  await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
}

export { useQueryClient };

export function titleFor(seo: SeoConfig, siteName: string, pageTitle: string): string {
  if (!pageTitle) return siteName;
  return (seo.titleTemplate || DEFAULT_TITLE_TEMPLATE).replace("%s", pageTitle).replace("{name}", siteName);
}
