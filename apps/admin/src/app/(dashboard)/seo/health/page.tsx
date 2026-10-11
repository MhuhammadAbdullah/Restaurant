"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FaArrowUpRightFromSquare, FaCircleCheck, FaCircleExclamation, FaCircleXmark } from "react-icons/fa6";
import { SeoHeader } from "../../../../components/seo/SeoUi";
import { FIXED_PAGES, useCategoryPages, useSeo, webBaseUrl } from "../../../../lib/seo";

type Status = "pass" | "warn" | "fail";
type Check = { title: string; status: Status; detail: string; fix?: { href: string; label: string } };

const STYLE: Record<Status, { icon: React.ReactNode; row: string }> = {
  pass: { icon: <FaCircleCheck className="text-green-600" />, row: "" },
  warn: { icon: <FaCircleExclamation className="text-amber-500" />, row: "" },
  fail: { icon: <FaCircleXmark className="text-red-500" />, row: "" },
};

export default function SeoHealthPage() {
  const { site, seo } = useSeo();
  const categories = useCategoryPages();
  const base = webBaseUrl(seo);
  const t = seo.tracking ?? {};

  const { automatic, yours } = useMemo(() => {
    const pages = [...FIXED_PAGES, ...categories].filter((p) => !seo.pages?.[p.key]?.noindex);
    const missingTitle = pages.filter((p) => !seo.pages?.[p.key]?.title);
    const missingDesc = pages.filter((p) => !seo.pages?.[p.key]?.description && !(p.key === "home" && seo.defaultDescription));
    const titles = pages.map((p) => (seo.pages?.[p.key]?.title ?? "").trim().toLowerCase()).filter(Boolean);
    const dupTitles = titles.length - new Set(titles).size;
    const longTitles = pages.filter((p) => (seo.pages?.[p.key]?.title ?? "").length > 60).length;
    const redirects = seo.redirects ?? [];
    const from = new Set(redirects.map((r) => r.from.toLowerCase().replace(/\/+$/, "")));
    const chains = redirects.filter((r) => from.has(r.to.toLowerCase().replace(/\/+$/, ""))).length;
    const b = seo.business ?? {};

    const yours: Check[] = [
      seo.noindexSite
        ? { title: "Googlebot can index the site", status: "fail", detail: "The whole website is set to noindex, so Google will not list it.", fix: { href: "/seo", label: "Turn on in Site-wide defaults" } }
        : { title: "Googlebot can index the site", status: "pass", detail: "Search engines are allowed in. No noindex on public pages." },
      /^https:\/\//.test(seo.siteUrl ?? "")
        ? { title: "Website URL is set", status: "pass", detail: `Canonical links and the sitemap use ${seo.siteUrl}.` }
        : { title: "Website URL is set", status: "fail", detail: "Add your real https:// address so canonical URLs and the sitemap point to your domain, not localhost.", fix: { href: "/seo", label: "Set website URL" } },
      missingTitle.length === 0
        ? { title: "Every page has its own title", status: "pass", detail: "All public pages have a custom title." }
        : { title: "Every page has its own title", status: "warn", detail: `${missingTitle.length} page${missingTitle.length === 1 ? " uses" : "s use"} an automatic title: ${missingTitle.slice(0, 4).map((p) => p.label).join(", ")}${missingTitle.length > 4 ? "..." : ""}.`, fix: { href: "/seo", label: "Write titles" } },
      dupTitles > 0
        ? { title: "Page titles are unique", status: "fail", detail: `${dupTitles} title${dupTitles === 1 ? " is" : "s are"} used on more than one page. Each page needs a different title.`, fix: { href: "/seo", label: "Fix titles" } }
        : { title: "Page titles are unique", status: "pass", detail: "No two pages share a title." },
      longTitles > 0
        ? { title: "Titles fit in Google results", status: "warn", detail: `${longTitles} title${longTitles === 1 ? " is" : "s are"} longer than 60 characters and will be cut off.`, fix: { href: "/seo", label: "Shorten titles" } }
        : { title: "Titles fit in Google results", status: "pass", detail: "Titles are 60 characters or fewer." },
      missingDesc.length === 0
        ? { title: "Page descriptions written", status: "pass", detail: "Every page has a description." }
        : { title: "Page descriptions written", status: "warn", detail: `${missingDesc.length} page${missingDesc.length === 1 ? " has" : "s have"} no description yet.`, fix: { href: "/seo", label: "Write descriptions" } },
      b.streetAddress && b.city && b.cuisine
        ? { title: "Business details for Google", status: "pass", detail: "Address, city and cuisine are filled in for the business schema." }
        : { title: "Business details for Google", status: "warn", detail: "Add your address, city and cuisine so Google can show your restaurant details.", fix: { href: "/seo", label: "Add business info" } },
      t.googleSiteVerification
        ? { title: "Added to Google Search Console", status: "pass", detail: "Verification tag is on the site. Make sure you clicked Verify and submitted the sitemap." }
        : { title: "Added to Google Search Console", status: "fail", detail: "Connect Search Console to see search performance and submit your sitemap.", fix: { href: "/seo/tracking", label: "Connect Search Console" } },
      seo.sitemap?.enabled === false
        ? { title: "sitemap.xml available", status: "fail", detail: "The sitemap is turned off.", fix: { href: "/seo/robots", label: "Turn on sitemap" } }
        : { title: "sitemap.xml available", status: "pass", detail: "Generated automatically from your pages and categories." },
      seo.robots?.allowAiSearch === false
        ? { title: "AI search crawlers allowed (OAI-SearchBot)", status: "warn", detail: "ChatGPT search and similar tools cannot read your site.", fix: { href: "/seo/robots", label: "Allow AI search" } }
        : { title: "AI search crawlers allowed (OAI-SearchBot)", status: "pass", detail: "OAI-SearchBot, ChatGPT-User and PerplexityBot are allowed." },
      chains > 0
        ? { title: "No redirect chains", status: "warn", detail: `${chains} redirect${chains === 1 ? " leads" : "s lead"} to another redirect. Point them straight to the final page.`, fix: { href: "/seo/redirects", label: "Fix redirects" } }
        : { title: "No redirect chains", status: "pass", detail: redirects.length ? "All redirects go straight to their final page." : "No redirects set up." },
      t.ga4Id || t.gtmId
        ? { title: "Analytics connected", status: "pass", detail: "Visitor tracking is on." }
        : { title: "Analytics connected", status: "warn", detail: "Connect Google Analytics 4 to see your visitors.", fix: { href: "/seo/tracking", label: "Connect Analytics" } },
    ];

    const automatic: Check[] = [
      { title: "Titles, descriptions and canonical URLs rendered on the server", status: "pass", detail: "Every page sends them in the HTML, so Googlebot sees them without running JavaScript." },
      { title: "Canonical URL on every page", status: "pass", detail: "Each page points to its own clean address." },
      { title: "Private pages hidden", status: "pass", detail: "Checkout, account and order confirmation are noindex and blocked in robots.txt." },
      { title: "Business and breadcrumb structured data", status: "pass", detail: "Restaurant, WebSite and category breadcrumb schema are added automatically." },
      { title: "Image alt text", status: "pass", detail: "Product, deal, category and banner images use their names as alt text." },
      { title: "WebP / AVIF images", status: "pass", detail: "Uploaded images are served in the lightest format each browser supports." },
      { title: "Mobile friendly", status: "pass", detail: "The website is responsive with a proper viewport tag." },
      { title: "Navigation links to every page", status: "pass", detail: "Header and footer link to the menu, locations, FAQs, policies and complaints." },
    ];
    return { automatic, yours };
  }, [seo, categories]);

  const score = Math.round((yours.filter((c) => c.status === "pass").length / yours.length) * 100);
  const psi = base ? `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(base)}` : "https://pagespeed.web.dev/";

  return (
    <div>
      <SeoHeader title="SEO Health" description="A checklist of everything Google looks for. Green items are done. Open any amber or red item to fix it in one click." />

      <div className="mt-5 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded-xl border border-neutral-200 bg-white p-5 text-center lg:self-start">
          <p className={`text-5xl font-bold ${score >= 80 ? "text-green-600" : score >= 50 ? "text-amber-500" : "text-red-500"}`}>{score}%</p>
          <p className="mt-1 text-sm text-neutral-500">{yours.filter((c) => c.status === "pass").length} of {yours.length} checks passed</p>
          <p className="mt-1 text-xs text-neutral-400">{site?.name}</p>
        </div>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <p className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900">Needs your input</p>
            <ul className="divide-y divide-neutral-100">
              {yours.map((c) => (
                <li key={c.title} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 shrink-0">{STYLE[c.status].icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900">{c.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{c.detail}</p>
                  </div>
                  {c.fix && c.status !== "pass" && (
                    <Link href={c.fix.href} className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-brand-red hover:text-brand-red">
                      {c.fix.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <p className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900">Handled automatically</p>
            <ul className="divide-y divide-neutral-100">
              {automatic.map((c) => (
                <li key={c.title} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 shrink-0">{STYLE[c.status].icon}</span>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{c.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-sm font-semibold text-neutral-900">Check speed, layout shift and broken links</p>
            <p className="mt-1 text-xs text-neutral-500">These depend on your live server and change over time, so test them on the real website with Google&apos;s free tool. Aim for loading in under 2.5 seconds (LCP) and a layout shift (CLS) under 0.1.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={psi} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-red px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
                Run PageSpeed test <FaArrowUpRightFromSquare size={10} />
              </a>
              <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:border-brand-red hover:text-brand-red">
                Open Search Console <FaArrowUpRightFromSquare size={10} />
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
