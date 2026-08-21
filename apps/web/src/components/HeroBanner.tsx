"use client";

import { forwardRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { SkeletonBanner } from "./skeletons";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

type Banner = {
  id: string;
  image: string;
};

const AUTO_ROTATE_MS = 5000;

export const HeroBanner = forwardRef<HTMLElement>(function HeroBanner(_props, ref) {
  const { data: banners, isLoading } = useQuery({
    queryKey: ["cms-banners"],
    queryFn: () => api.public.get<Banner[]>("/cms/banners"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const [activeIndex, setActiveIndex] = useState(0);

  const slides = banners && banners.length > 0 ? banners : null;

  useEffect(() => {
    setActiveIndex(0);
  }, [slides?.length]);

  useEffect(() => {
    if (!slides || slides.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % slides.length);
    }, AUTO_ROTATE_MS);
    return () => clearInterval(timer);
  }, [slides]);

  if (isLoading) return <SkeletonBanner />;

  function goToPrev() {
    if (!slides) return;
    setActiveIndex((i) => (i - 1 + slides.length) % slides.length);
  }
  function goToNext() {
    if (!slides) return;
    setActiveIndex((i) => (i + 1) % slides.length);
  }

  return (
    <section ref={ref} className="px-4 py-6 sm:px-8">
      <div className="group relative mx-auto aspect-[21/9] max-w-[90rem] overflow-hidden rounded-2xl bg-transparent">
        {slides &&
          slides.map((banner, i) => (
            <div
              key={banner.id}
              className={`absolute inset-0 transition-opacity duration-700 ${
                i === activeIndex ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={banner.image} alt="" className="h-full w-full rounded-2xl object-fit" />
            </div>
          ))}

        {slides && slides.length > 1 && (
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {slides.map((banner, i) => (
              <button
                key={banner.id}
                onClick={() => setActiveIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === activeIndex ? "w-6 bg-brand-red" : "w-2 bg-white/60"}`}
              />
            ))}
          </div>
        )}

        {slides && slides.length > 1 && (
          <>
            <button
              onClick={goToPrev}
              aria-label="Previous banner"
              className="absolute left-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink opacity-0 shadow-md transition duration-200 ease-out hover:bg-white group-hover:opacity-100"
            >
              <ChevronLeftIcon size={18} />
            </button>
            <button
              onClick={goToNext}
              aria-label="Next banner"
              className="absolute right-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink opacity-0 shadow-md transition duration-200 ease-out hover:bg-white group-hover:opacity-100"
            >
              <ChevronRightIcon size={18} />
            </button>
          </>
        )}
      </div>
    </section>
  );
});
