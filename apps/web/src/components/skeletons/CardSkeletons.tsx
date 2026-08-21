import { Skeleton, SkeletonCircle } from "./Skeleton";

/** Same grid classes used everywhere product/deal cards are listed — keeps skeleton and real grid pixel-identical. */
export function SkeletonGrid({ count, render }: { count: number; render: (i: number) => React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => render(i))}
    </div>
  );
}

/** Mirrors ProductCard.tsx / DealCard.tsx — same border/radius/padding so nothing shifts when real content mounts. */
export function SkeletonProductCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="p-2">
        <Skeleton className="aspect-square w-full rounded-lg" />
      </div>
      <div className="flex flex-1 flex-col p-3">
        <Skeleton className="h-4 w-4/5 rounded-md" />
        <Skeleton className="mt-2 h-3 w-3/5 rounded-md" />
        <div className="mt-auto flex items-center justify-between pt-3">
          <Skeleton className="h-4 w-16 rounded-md" />
          <Skeleton className="h-7 w-14 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Mirrors PopularProductCard.tsx — tall image card with title/price/add-button overlay. */
export function SkeletonPopularCard() {
  return (
    <div className="relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl shadow-sm">
      <Skeleton className="absolute inset-0" />
      <div className="relative z-10 p-3 pr-14">
        <Skeleton className="h-4 w-3/4 rounded-md bg-white/30" />
        <Skeleton className="mt-2 h-3 w-1/2 rounded-md bg-white/20" />
      </div>
      <div className="absolute bottom-3 right-3 z-10">
        <SkeletonCircle size={36} className="bg-white/30" />
      </div>
    </div>
  );
}

/** Mirrors CartRecommendationCard.tsx — square image, price + title below it (not overlaid). */
export function SkeletonCartRecommendationCard() {
  return (
    <div className="w-28 shrink-0">
      <Skeleton className="aspect-square w-full rounded-2xl" />
      <Skeleton className="mt-1.5 h-4 w-3/4 rounded-md" />
      <Skeleton className="mt-1 h-3 w-4/5 rounded-md" />
    </div>
  );
}

/** Mirrors HeroBanner.tsx's rounded, landscape-ratio box. */
export function SkeletonBanner() {
  return (
    <section className="px-4 py-6 sm:px-8">
      <Skeleton className="mx-auto aspect-[21/9] max-w-[90rem] rounded-3xl" />
    </section>
  );
}

/** Mirrors CategoryTabs.tsx's unstuck (icon + label) variant. */
export function SkeletonCategoryTabs({ count = 6 }: { count?: number }) {
  return (
    <div className="px-4 py-2.5 sm:px-8">
      <div className="mx-auto flex max-w-[90rem] items-center justify-center gap-3 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
            <SkeletonCircle size={80} className="rounded-xl" />
            <Skeleton className="h-3 w-12 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic heading placeholder — matches the "Popular Items" / section-title pattern (icon + big heading + subtitle). */
export function SkeletonSectionHeading() {
  return (
    <div className="mb-4">
      <Skeleton className="h-9 w-56 rounded-md" />
      <Skeleton className="mt-2 h-4 w-40 rounded-md" />
    </div>
  );
}

/** Mirrors SectionBanner.tsx's rounded promo-banner strip used above category product sections. */
export function SkeletonSectionBanner() {
  return <Skeleton className="my-[50px] aspect-[21/9] w-full rounded-2xl" />;
}

/** A full category-style section: banner + a grid of product cards. */
export function SkeletonProductSection({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-10">
      <SkeletonSectionBanner />
      <SkeletonGrid count={count} render={(i) => <SkeletonProductCard key={i} />} />
    </div>
  );
}

/** Mirrors SearchBar.tsx's pill — input placeholder + circular search-button placeholder. */
export function SkeletonSearchBar() {
  return (
    <div className="scroll-mt-32 px-4 pb-6 pt-6 sm:px-8">
      <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-5 pr-1.5 shadow-sm">
        <Skeleton className="h-5 w-full max-w-xs rounded-md" />
        <SkeletonCircle size={36} className="shrink-0" />
      </div>
    </div>
  );
}
