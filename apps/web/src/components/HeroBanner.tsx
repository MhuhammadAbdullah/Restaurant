"use client";

import { forwardRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { SkeletonBanner } from "./skeletons";

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

  return (
    <section ref={ref} className="px-4 py-6 sm:px-8">
      <div className="relative mx-auto h-[320px] max-w-[90rem] overflow-hidden rounded-3xl bg-transparent sm:h-[460px] lg:h-[600px]">
        {slides &&
          slides.map((banner, i) => (
            <div
              key={banner.id}
              className={`absolute inset-0 transition-opacity duration-700 ${
                i === activeIndex ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={banner.image} alt="" className="h-full w-full rounded-3xl object-fit" />
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
      </div>
    </section>
  );
});
