"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ChevronDownIcon } from "./icons";
import { optimizeImage } from "../lib/image";
import { MarkdownContent } from "./MarkdownContent";

type RestaurantInfo = {
  appPromo: {
    bannerImage: string | null;
    showOnCategoryPages?: boolean;
  };
  aboutContent: {
    enabled: boolean;
    heading: string;
    paragraph: string;
    truncateLength: number;
  };
};

function AppPromoBanner({ bannerImage }: { bannerImage: string }) {
  return (
    // Full width on phones and tablets; on wide screens it stops at a comfortable width and stays centred.
    <section className="mx-auto mt-16 w-full max-w-6xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={optimizeImage(bannerImage, 2400)} alt="Get our mobile app" loading="lazy" className="block w-full rounded-3xl object-cover" />
    </section>
  );
}

/** Text length without the formatting marks, so "Show more" depends on what people actually read. */
function plainLength(markdown: string): number {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~#>]/g, "")
    .trim().length;
}

function AboutTextSection({ about }: { about: RestaurantInfo["aboutContent"] }) {
  const [open, setOpen] = useState(false);
  const needsTruncation = plainLength(about.paragraph) > about.truncateLength;
  // About 95 characters fit on a line, so the collapsed height follows the admin's character limit.
  const collapsedRem = Math.max(2, Math.ceil(about.truncateLength / 95)) * 1.75;

  return (
    <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-8">
      <div className="text-left">
        {about.heading && <h2 className="text-xl font-bold text-ink sm:text-2xl">{about.heading}</h2>}

        <div className="relative overflow-hidden" style={!open && needsTruncation ? { maxHeight: `${collapsedRem}rem` } : undefined}>
          <MarkdownContent content={about.paragraph} />
          {!open && needsTruncation && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-page to-transparent" />}
        </div>

        {needsTruncation && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-3 flex items-center gap-1 text-sm font-semibold text-muted hover:opacity-80">
            {open ? "Show Less" : "Show More"}
            <ChevronDownIcon size={16} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
    </section>
  );
}

/** Renders just above the footer on the homepage. The promo banner shows only once an image is uploaded; the about section is independently admin-toggleable. */
export function HomeFooterPromo({ variant = "home" }: { variant?: "home" | "category" } = {}) {
  const { data: restaurant } = useQuery({
    queryKey: ["cms-restaurant-home-footer-promo"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
  });

  if (!restaurant) return null;

  // Category pages repeat the same banner and About text as the homepage, unless the admin switched that off.
  if (variant === "category" && restaurant.appPromo.showOnCategoryPages === false) return null;

  return (
    <>
      {restaurant.appPromo.bannerImage && <AppPromoBanner bannerImage={restaurant.appPromo.bannerImage} />}
      {restaurant.aboutContent.enabled && <AboutTextSection about={restaurant.aboutContent} />}
    </>
  );
}
