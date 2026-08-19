"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ChevronDownIcon } from "./icons";

type RestaurantInfo = {
  appPromo: {
    bannerImage: string | null;
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
    <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bannerImage} alt="" className="w-full rounded-3xl object-cover" />
    </section>
  );
}

function AboutTextSection({ about }: { about: RestaurantInfo["aboutContent"] }) {
  const [open, setOpen] = useState(false);
  const needsTruncation = about.paragraph.length > about.truncateLength;

  const preview = needsTruncation ? about.paragraph.slice(0, about.truncateLength).trimEnd() + "…" : about.paragraph;
  const paragraphs = about.paragraph.split(/\n{2,}/).filter(Boolean);

  return (
    <section className="mx-auto mt-14 max-w-4xl px-4 text-center sm:px-8">
      {about.heading && <h2 className="text-xl font-bold text-ink sm:text-2xl">{about.heading}</h2>}

      <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </div>

      {!open && <p className="mt-4 text-sm leading-relaxed text-muted">{preview}</p>}

      {needsTruncation && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mx-auto mt-3 flex items-center gap-1 text-sm font-semibold text-muted hover:opacity-80"
        >
          {open ? "Show Less" : "Show More"}
          <ChevronDownIcon size={16} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </section>
  );
}

/** Renders just above the footer on the homepage. The promo banner shows only once an image is uploaded; the about section is independently admin-toggleable. */
export function HomeFooterPromo() {
  const { data: restaurant } = useQuery({
    queryKey: ["cms-restaurant-home-footer-promo"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
  });

  if (!restaurant) return null;

  return (
    <>
      {restaurant.appPromo.bannerImage && <AppPromoBanner bannerImage={restaurant.appPromo.bannerImage} />}
      {restaurant.aboutContent.enabled && <AboutTextSection about={restaurant.aboutContent} />}
    </>
  );
}
