"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FaArrowLeft, FaArrowUp, FaChevronDown, FaHeadset, FaPhone } from "react-icons/fa6";
import { api } from "../lib/api";
import type { TocItem } from "../lib/markdownToc";

type RestaurantInfo = {
  name: string;
  logoUrl: string | null;
  contactPhone: string | null;
  pages?: { terms: { title: string }; privacy: { title: string }; faqs: { title: string } };
};

/**
 * Deliberately chrome-less: no site Header/Footer (they self-hide on these routes — see
 * NO_CHROME_PATHS in Header/Footer/LocationModal/CartBar). A focused reading page: slim top bar,
 * links between the three info pages, an "On this page" list, and a help card at the end.
 */
export function LegalPageLayout({ title, subtitle, toc, children }: { title: string; subtitle?: string; toc?: TocItem[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: restaurant } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
  });

  const tabs = [
    { href: "/terms", label: restaurant?.pages?.terms.title ?? "Terms & Conditions" },
    { href: "/privacy-policy", label: restaurant?.pages?.privacy.title ?? "Privacy Policy" },
    { href: "/faqs", label: restaurant?.pages?.faqs.title ?? "FAQs" },
  ];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const tocKey = (toc ?? []).map((t) => t.id).join("|");

  // highlight the section being read
  useEffect(() => {
    if (!toc || toc.length === 0) return;
    const els = toc.map((t) => document.getElementById(t.id)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocKey]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    setTocOpen(false);
  }

  const hasToc = !!toc && toc.length > 1;

  return (
    <main className="min-h-screen bg-page">
      {/* top bar */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            {restaurant?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logoUrl} alt={restaurant.name} className="h-11 w-auto object-contain" />
            ) : (
              <span className="font-display text-lg text-brand-red">{restaurant?.name ?? ""}</span>
            )}
          </Link>
          <Link href="/" className="flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink transition hover:border-brand-red hover:text-brand-red">
            <FaArrowLeft size={12} /> Back to menu
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8 sm:pt-10">
        {/* title + links between the info pages */}
        <div>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">{subtitle}</p>}
        </div>
        <nav className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Information pages">
          {tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${active ? "border-brand-red bg-brand-red text-white" : "border-line bg-surface text-ink hover:border-brand-red"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className={`mt-8 grid gap-6 ${hasToc ? "lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10" : ""}`}>
          {hasToc && (
            <aside className="lg:sticky lg:top-6 lg:self-start">
              {/* phones: collapsible; desktop: always open */}
              <button
                type="button"
                onClick={() => setTocOpen((v) => !v)}
                aria-expanded={tocOpen}
                className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink lg:hidden"
              >
                On this page
                <FaChevronDown size={12} className={`transition-transform ${tocOpen ? "rotate-180" : ""}`} />
              </button>
              <div className={`${tocOpen ? "mt-2 block" : "hidden"} rounded-xl border border-line bg-surface p-3 lg:mt-0 lg:block lg:border-0 lg:bg-transparent lg:p-0`}>
                <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wider text-muted lg:block">On this page</p>
                <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">
                  {toc!.map((t) => {
                    const active = activeId === t.id;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => goTo(t.id)}
                          className={`block w-full rounded-lg border-l-2 px-3 py-1.5 text-left text-sm transition ${t.level === 3 ? "pl-6" : ""} ${
                            active ? "border-brand-red bg-brand-red/10 font-semibold text-brand-red" : "border-transparent text-muted hover:text-ink"
                          }`}
                        >
                          {t.text}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>
          )}

          <div className="min-w-0">
            <article className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-8">{children}</article>

            {/* help card */}
            <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
                  <FaHeadset size={18} />
                </span>
                <div>
                  <p className="font-semibold text-ink">Still have a question?</p>
                  <p className="text-sm text-muted">Our team is happy to help with your order, payment or anything else.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {restaurant?.contactPhone && (
                  <a href={`tel:${restaurant.contactPhone}`} className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:border-brand-red hover:text-brand-red">
                    <FaPhone size={12} /> {restaurant.contactPhone}
                  </a>
                )}
                <Link href="/complaints" className="rounded-xl bg-brand-red px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                  Contact us
                </Link>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-muted">
              © {new Date().getFullYear()} {restaurant?.name ?? ""}. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="fixed bottom-5 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red text-white shadow-lg transition hover:opacity-90 sm:right-8"
        >
          <FaArrowUp size={15} />
        </button>
      )}
    </main>
  );
}
