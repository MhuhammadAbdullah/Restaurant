"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "./icons";
import { optimizeImage } from "../lib/image";

export type TabItem = { key: string; label: string; image?: string | null };

type RowProps = {
  tabs: TabItem[];
  activeKey: string;
  onTabClick: (key: string) => void;
};

/** Large icon-card row — the original, always-in-flow category picker. Unchanged in scroll behavior. */
function CardRow({ tabs, activeKey, onTabClick }: RowProps) {
  const { scrollerRef, canScrollLeft, canScrollRight, scrollBy } = useHorizontalScroll(tabs);

  return (
    <div className="px-4 py-1.5 sm:px-8 sm:py-2.5">
      <div className="relative mx-auto flex max-w-4xl items-center">
        {canScrollLeft && (
          <button
            onClick={() => scrollBy(-1)}
            aria-label="Scroll categories left"
            className="absolute left-0 z-10 flex h-7 w-7 shrink-0 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-line bg-surface shadow-md"
          >
            <ChevronDownIcon size={16} className="rotate-90" />
          </button>
        )}
        <div
          ref={scrollerRef}
          className={`no-scrollbar flex flex-1 items-center justify-start gap-4 sm:gap-6 [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto overflow-x-auto scroll-smooth pt-[5px] transition-[gap] duration-200 ${canScrollLeft ? "pl-8 sm:pl-10" : ""} ${canScrollRight ? "pr-8 sm:pr-10" : ""}`}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabClick(tab.key)}
              className="relative z-0 flex shrink-0 flex-col items-center gap-1 sm:gap-1.5 transition duration-200 ease-out hover:z-10 hover:scale-[1.08]"
            >
              <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl sm:h-20 sm:w-20 sm:rounded-2xl transition duration-200 ease-out hover:drop-shadow-lg">
                {tab.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizeImage(tab.image, 240)} alt={tab.label} loading="lazy" width={80} height={80} className="h-full w-full rounded-xl object-cover sm:rounded-2xl" />
                ) : (
                  <span className="h-full w-full rounded-xl bg-surface-alt sm:rounded-2xl" />
                )}
              </span>
              <span className="text-center text-xs font-semibold text-brand-red sm:text-sm">{tab.label}</span>
            </button>
          ))}
        </div>
        {canScrollRight && (
          <button
            onClick={() => scrollBy(1)}
            aria-label="Scroll categories right"
            className="absolute right-0 z-10 flex h-7 w-7 shrink-0 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-line bg-surface shadow-md"
          >
            <ChevronDownIcon size={16} className="-rotate-90" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Compact pill row — fixed to the viewport, slides down with a smooth transform/opacity transition once `stuck`. */
function PillRow({ tabs, activeKey, onTabClick, stuck }: RowProps & { stuck: boolean }) {
  const { scrollerRef, canScrollLeft, canScrollRight, scrollBy } = useHorizontalScroll(tabs);

  return (
    <div
      className={`fixed inset-x-0 top-0 z-30 border-b border-line bg-surface px-4 py-4 shadow-sm transition-all duration-300 ease-out sm:px-8 ${
        stuck ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
      }`}
    >
      <div className="relative mx-auto flex max-w-[90rem] items-center">
        {canScrollLeft && (
          <button
            onClick={() => scrollBy(-1)}
            aria-label="Scroll categories left"
            className="absolute left-0 z-10 flex h-7 w-7 shrink-0 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-line bg-surface shadow-md"
          >
            <ChevronDownIcon size={16} className="rotate-90" />
          </button>
        )}
        <div
          ref={scrollerRef}
          className={`no-scrollbar flex flex-1 items-center justify-start gap-3 overflow-x-auto scroll-smooth py-2 ${canScrollLeft ? "pl-10" : ""} ${canScrollRight ? "pr-10" : ""}`}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabClick(tab.key)}
              className={`relative z-0 flex shrink-0 items-center justify-center rounded-full border px-4 py-2 text-center text-sm font-medium transition duration-200 ease-out hover:z-10 hover:scale-[1.05] hover:shadow-lg ${
                activeKey === tab.key
                  ? "border-brand-red bg-brand-red text-white"
                  : "border-line text-muted hover:border-brand-red hover:text-brand-red"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {canScrollRight && (
          <button
            onClick={() => scrollBy(1)}
            aria-label="Scroll categories right"
            className="absolute right-0 z-10 flex h-7 w-7 shrink-0 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-line bg-surface shadow-md"
          >
            <ChevronDownIcon size={16} className="-rotate-90" />
          </button>
        )}
      </div>
    </div>
  );
}

function useHorizontalScroll(tabs: TabItem[]) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateScrollState() {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  function scrollBy(dir: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  }

  return { scrollerRef, canScrollLeft, canScrollRight, scrollBy };
}

export function CategoryTabs({
  tabs,
  activeKey,
  onTabClick,
  stuck,
}: {
  tabs: TabItem[];
  activeKey: string;
  onTabClick: (key: string) => void;
  stuck: boolean;
}) {
  return (
    <>
      <CardRow tabs={tabs} activeKey={activeKey} onTabClick={onTabClick} />
      <PillRow tabs={tabs} activeKey={activeKey} onTabClick={onTabClick} stuck={stuck} />
    </>
  );
}
