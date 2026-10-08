"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../lib/api";
import { slugify } from "../lib/slug";
import { useLocationStore } from "../store/useLocationStore";
import type { Category, Deal, Product, WebsiteSection } from "../lib/types";
import { ProductCard } from "../components/ProductCard";
import { PopularProductCard } from "../components/PopularProductCard";
import { DealCard } from "../components/DealCard";
import { ProductModal } from "../components/ProductModal";
import { DealModal } from "../components/DealModal";
import { HeroBanner } from "../components/HeroBanner";
import { HomeFooterPromo } from "../components/HomeFooterPromo";
import { SectionBanner } from "../components/SectionBanner";
import { CategoryTabs, type TabItem } from "../components/CategoryTabs";
import { SearchBar } from "../components/SearchBar";
import { ScrollFabs } from "../components/ScrollFabs";
import {
  SkeletonCategoryTabs,
  SkeletonGrid,
  SkeletonProductCard,
  SkeletonPopularCard,
  SkeletonSectionHeading,
  SkeletonProductSection,
  SkeletonSearchBar,
} from "../components/skeletons";

export default function HomePage() {
  const router = useRouter();
  const { branch, isResolved, isBranchOpen } = useLocationStore();
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [activeTab, setActiveTab] = useState("popular");
  const [stuck, setStuck] = useState(false);

  const tabsObserverRef = useRef<IntersectionObserver | null>(null);
  const scrollSpyObserverRef = useRef<IntersectionObserver | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Category sections mount at different times (each fetches its own products), so a section can
  // easily finish loading and mount only *after* a one-time "observe everything" effect already
  // ran — leaving it permanently unwatched and the active tab stuck on whatever was last actually
  // observed. Registering (and observing) each section the instant its ref attaches — regardless
  // of when that happens — makes every section reliably trackable no matter its load timing.
  const registerSection = useCallback((key: string, el: HTMLElement | null) => {
    const prev = sectionRefs.current[key];
    if (prev && scrollSpyObserverRef.current) scrollSpyObserverRef.current.unobserve(prev);
    sectionRefs.current[key] = el;
    if (el && scrollSpyObserverRef.current) scrollSpyObserverRef.current.observe(el);
  }, []);

  // A section's `ref` prop must keep the exact same function identity across renders — React
  // detaches + reattaches a ref whenever the function passed to it changes, which would otherwise
  // unobserve/reobserve every section on every `activeTab` update (i.e. on every scroll), racing
  // the browser's own intersection bookkeeping and leaving the highlighted tab stuck on a stale
  // section. One cached callback per key, reused across renders, keeps the observer stable.
  const sectionRefCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
  function getSectionRefCallback(key: string) {
    let cb = sectionRefCallbacks.current.get(key);
    if (!cb) {
      cb = (el: HTMLElement | null) => registerSection(key, el);
      sectionRefCallbacks.current.set(key, cb);
    }
    return cb;
  }

  const { data: sections, isLoading: sectionsLoading } = useQuery({
    queryKey: ["cms-sections"],
    queryFn: () => api.public.get<WebsiteSection[]>("/cms/sections"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: deals, isLoading: dealsLoading } = useQuery({
    queryKey: ["deals", branch?.id],
    queryFn: () => api.public.get<Deal[]>(`/deals?branchId=${branch?.id}`),
    enabled: !!branch,
    placeholderData: keepPreviousData,
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.public.get<Category[]>("/catalog/categories"),
    staleTime: 0,
  });
  const dealsCategory = categories?.find((c) => c.name.toLowerCase() === "deals");

  const { data: popularProducts, isLoading: popularLoading } = useQuery({
    queryKey: ["popular-products", branch?.id],
    queryFn: () => api.public.get<Product[]>(`/catalog/products?branchId=${branch?.id}&popular=true`),
    enabled: !!branch,
    placeholderData: keepPreviousData,
  });

  const { data: allProducts, isLoading: allProductsLoading } = useQuery({
    queryKey: ["all-products", branch?.id],
    queryFn: () => api.public.get<Product[]>(`/catalog/products?branchId=${branch?.id}`),
    enabled: !!branch,
    placeholderData: keepPreviousData,
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ["search-products", branch?.id, submittedQuery],
    queryFn: () => api.public.get<Product[]>(`/catalog/products?branchId=${branch?.id}&search=${encodeURIComponent(submittedQuery)}`),
    enabled: !!branch && submittedQuery.trim().length > 1,
    placeholderData: keepPreviousData,
  });

  const tabsLoading = categoriesLoading || dealsLoading || sectionsLoading;

  const productSections = useMemo(() => sections?.filter((s) => s.type === "PRODUCT_GRID") ?? [], [sections]);

  const tabs: TabItem[] = useMemo(() => {
    // Popular Items is a curated product selection, not a browsable category — it never gets a
    // category tab of its own, but the section itself always renders below (gated on the admin's
    // selection, not on any category record existing).
    const t: TabItem[] = [];
    if (deals && deals.length > 0) t.push({ key: "deals", label: "Deals", image: dealsCategory?.image });
    productSections.forEach((s) => {
      if (s.categoryId) t.push({ key: s.categoryId, label: s.category?.name ?? "", image: s.category?.image });
    });
    return t;
  }, [deals, productSections, dealsCategory]);

  const cycleWords = useMemo(() => (allProducts ?? []).slice(0, 12).map((p) => p.name), [allProducts]);

  // Detect the exact moment the tabs section scrolls past the top of the viewport — via a
  // zero-height sentinel placed immediately before it — rather than inferring it from a
  // different element (the hero banner) further up the page. That indirection let the two
  // drift out of sync whenever anything (e.g. the "branch closed" notice) changed the gap
  // between them, so the tab bar would render pinned-but-still-in-its-tall-shape for a few
  // scroll pixels and then jerk into its compact "stuck" shape once state caught up.
  //
  // The sentinel only mounts once `isResolved` is true, which can happen after the initial
  // render (location store hydration) — a plain `useRef` + `useEffect([])` would attach the
  // observer before the sentinel exists and never retry. A callback ref fires exactly when the
  // node actually mounts (or unmounts), regardless of when that is, so it can't miss it.
  const tabsSentinelCallbackRef = useCallback((el: HTMLDivElement | null) => {
    tabsObserverRef.current?.disconnect();
    tabsObserverRef.current = null;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // "Not intersecting" alone is ambiguous: it's also true before the user has scrolled
        // far enough to even reach the sentinel (e.g. a tall hero banner pushes it below the
        // fold on load). Only the sentinel having scrolled *above* the viewport — top < 0 —
        // means the tabs section was actually scrolled past.
        setStuck(!entry!.isIntersecting && entry!.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    tabsObserverRef.current = observer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const key = visible[0].target.getAttribute("data-section-key");
          if (key) setActiveTab(key);
        }
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 },
    );
    scrollSpyObserverRef.current = observer;
    // Sections whose refs already attached before this effect ran (ref callbacks fire during
    // commit, before effects) were stored by registerSection but couldn't be observed yet — catch
    // them up now. Anything that mounts later observes itself immediately via registerSection.
    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => {
      observer.disconnect();
      scrollSpyObserverRef.current = null;
    };
  }, []);

  function scrollToSection(key: string) {
    // Highlight immediately on click rather than waiting for the scroll-spy observer to catch up
    // once the smooth-scroll animation settles — the observer still takes over correctly afterward.
    setActiveTab(key);
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function scrollToSearch() {
    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSearchChange(v: string) {
    setSearchQuery(v);
    if (v.trim().length === 0) setSubmittedQuery("");
  }
  function handleSearchSubmit() {
    setSubmittedQuery(searchQuery);
  }

  async function openProduct(id: string) {
    const detail = await api.public.get<Product>(`/catalog/products/${id}`);
    setActiveProduct(detail);
  }

  async function openDeal(id: string) {
    const detail = await api.public.get<Deal>(`/deals/${id}`);
    setActiveDeal(detail);
  }

  return (
    <main className="min-h-screen bg-page pb-24">
      <HeroBanner />

      {!isResolved ? (
        <p className="p-10 text-center text-muted">Select your location to see the menu.</p>
      ) : (
        <>
          {!isBranchOpen && (
            <p className="mx-auto mt-4 max-w-7xl px-4 sm:px-8">
              <span className="block rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-800">
                {branch?.name} is currently closed. You can browse the menu, but ordering opens back up during operating hours.
              </span>
            </p>
          )}
          <div ref={tabsSentinelCallbackRef} className="h-px" />
          {tabsLoading ? <SkeletonCategoryTabs /> : <CategoryTabs tabs={tabs} activeKey={activeTab} onTabClick={scrollToSection} stuck={stuck} />}
          {allProductsLoading ? (
            <SkeletonSearchBar />
          ) : (
            <SearchBar ref={searchRef} value={searchQuery} onChange={handleSearchChange} onSubmit={handleSearchSubmit} cycleWords={cycleWords} />
          )}
          <ScrollFabs visible={stuck} onSearchClick={scrollToSearch} onTopClick={scrollToTop} />

          <div className="mx-auto max-w-7xl px-4 sm:px-8">
            {submittedQuery.trim().length > 1 ? (
              <section>
                <h2 className="mb-4 text-lg font-semibold text-ink">Results for &quot;{submittedQuery}&quot;</h2>
                {searchLoading ? (
                  <SkeletonGrid count={8} render={(i) => <SkeletonProductCard key={i} />} />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      {searchResults?.map((p) => (
                        <ProductCard key={p.id} product={p} onClick={() => openProduct(p.id)} />
                      ))}
                    </div>
                    {searchResults?.length === 0 && <p className="text-sm text-muted">No items match your search.</p>}
                  </>
                )}
              </section>
            ) : (
              <>
                <section
                  ref={getSectionRefCallback("popular")}
                  data-section-key="popular"
                  className="mb-10 scroll-mt-32"
                >
                  {popularLoading ? (
                    <>
                      <SkeletonSectionHeading />
                      <SkeletonGrid count={4} render={(i) => <SkeletonPopularCard key={i} />} />
                    </>
                  ) : (
                    <>
                      <div className="mb-4">
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="https://res.cloudinary.com/dgkd8jw6a/image/upload/v1786367974/popular-icon_qk8csc.svg"
                            alt=""
                            className="h-6 w-6 object-contain sm:h-8 sm:w-8 lg:h-10 lg:w-10"
                          />
                          <h2 className="cursor-pointer whitespace-nowrap text-[24px] font-bold uppercase leading-[36px] text-ink sm:text-[32px] sm:leading-[48px] lg:text-[50px] lg:leading-[75px]">
                            Popular <span className="text-brand-red">Items</span>
                          </h2>
                        </div>
                        <p className="text-[13px] font-normal leading-[20px] text-ink sm:text-[16px] sm:leading-[23px] lg:text-[20px] lg:leading-[29px]">Most ordered right now</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                        {popularProducts?.map((p) => (
                          <PopularProductCard key={p.id} product={p} onClick={() => openProduct(p.id)} />
                        ))}
                      </div>
                      {popularProducts?.length === 0 && <p className="text-sm text-muted">No popular items yet.</p>}
                    </>
                  )}
                </section>

                {dealsLoading && (
                  <section className="mb-10 scroll-mt-32">
                    <SkeletonSectionHeading />
                    <SkeletonGrid count={4} render={(i) => <SkeletonProductCard key={i} />} />
                  </section>
                )}

                {!dealsLoading && deals && deals.length > 0 && (
                  <section
                    ref={getSectionRefCallback("deals")}
                    data-section-key="deals"
                    className="mb-10 scroll-mt-32"
                  >
                    {dealsCategory?.banner || dealsCategory?.image ? (
                      <SectionBanner
                        heading="Popular Deals"
                        image={dealsCategory.banner ?? dealsCategory.image}
                        onClick={() => router.push(`/category/${slugify(dealsCategory.name)}`)}
                      />
                    ) : (
                      <div className="mb-4">
                        <button
                          onClick={() => dealsCategory && router.push(`/category/${slugify(dealsCategory.name)}`)}
                          className="text-lg font-semibold text-ink hover:underline"
                        >
                          Popular Deals
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      {deals.map((d) => (
                        <DealCard key={d.id} deal={d} onClick={() => openDeal(d.id)} />
                      ))}
                    </div>
                  </section>
                )}

                {productSections.map((section) => (
                  <CategoryProductSection
                    key={section.id}
                    section={section}
                    branchId={branch!.id}
                    onOpenProduct={openProduct}
                    sectionRef={section.categoryId ? getSectionRefCallback(section.categoryId) : undefined}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}

      <HomeFooterPromo />

      {activeProduct && <ProductModal product={activeProduct} onClose={() => setActiveProduct(null)} />}
      {activeDeal && <DealModal deal={activeDeal} onClose={() => setActiveDeal(null)} />}
    </main>
  );
}

function CategoryProductSection({
  section,
  branchId,
  onOpenProduct,
  sectionRef,
}: {
  section: WebsiteSection;
  branchId: string;
  onOpenProduct: (id: string) => void;
  sectionRef?: (el: HTMLElement | null) => void;
}) {
  const router = useRouter();
  const { data: products, isLoading } = useQuery({
    queryKey: ["products", "mainPage", section.categoryId, branchId],
    queryFn: () => api.public.get<Product[]>(`/catalog/products?branchId=${branchId}&categoryId=${section.categoryId}&mainPage=true`),
    enabled: !!section.categoryId,
    placeholderData: keepPreviousData,
  });

  if (isLoading) return <SkeletonProductSection />;
  if (!products || products.length === 0) return null;

  return (
    <section ref={sectionRef} data-section-key={section.categoryId ?? undefined} className="mb-10 scroll-mt-32">
      <SectionBanner
        heading={section.heading ?? section.category?.name ?? ""}
        image={section.category?.banner ?? section.category?.image}
        onClick={section.category?.name ? () => router.push(`/category/${slugify(section.category!.name)}`) : undefined}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} onClick={() => onOpenProduct(p.id)} />
        ))}
      </div>
    </section>
  );
}

