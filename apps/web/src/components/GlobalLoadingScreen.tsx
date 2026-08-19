"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useBrandStore } from "../store/useBrandStore";
import { Dots } from "./Dots";

type RestaurantInfo = { name: string; logoUrl: string | null };

// Bundled with the app (apps/web/public) so it paints instantly on the very first visit, before
// the cache (useBrandStore) has anything and before the CMS logo has had a chance to load — the
// admin-configured logo (cached or freshly fetched) still takes priority the moment either is
// available, this is only what shows in the gap before that.
const STATIC_FALLBACK_LOGO = "/logo-fallback.png";

// Shown once per hard page load/refresh (this component only mounts on a full navigation — the
// Next.js App Router keeps the root layout, and this component, mounted across client-side route
// changes, so it never reappears just from clicking around the site).
const MIN_VISIBLE_MS = 700;
const MAX_VISIBLE_MS = 4000;

export function GlobalLoadingScreen() {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(true);

  const cachedName = useBrandStore((s) => s.name);
  const cachedLogoUrl = useBrandStore((s) => s.logoUrl);
  const setBrand = useBrandStore((s) => s.setBrand);

  // Reuses the same query key Header/LocationModal fetch with — this doesn't add a second
  // network request, just reads the same in-flight/cached result.
  const { data: restaurant, isLoading } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
    staleTime: 0,
  });

  // The live fetch's `data` is undefined for most of this screen's visible lifetime — that's the
  // whole reason it's showing. Cache the logo from the last successful load so repeat visits (the
  // vast majority) show it immediately instead of a blank circle while this fetch is in flight.
  useEffect(() => {
    if (restaurant) setBrand(restaurant.name, restaurant.logoUrl);
  }, [restaurant, setBrand]);

  const name = restaurant?.name ?? cachedName;
  const logoUrl = restaurant?.logoUrl ?? cachedLogoUrl ?? STATIC_FALLBACK_LOGO;

  useEffect(() => {
    const minTimer = setTimeout(() => setMinTimeElapsed(true), MIN_VISIBLE_MS);
    // Never block the site indefinitely if the API is slow/unreachable.
    const maxTimer = setTimeout(() => setHidden(true), MAX_VISIBLE_MS);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, []);

  useEffect(() => {
    if (!isLoading && minTimeElapsed) setHidden(true);
  }, [isLoading, minTimeElapsed]);

  useEffect(() => {
    if (!hidden) return;
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [hidden]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-page/70 backdrop-blur-md transition-opacity duration-300 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden={hidden}
    >
      <div className="flex h-24 w-24 animate-logo-zoom items-center justify-center overflow-hidden rounded-full border-4 border-brand-red bg-surface shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name ?? ""} className="h-full w-full object-cover" />
      </div>
      <Dots className="mt-5 h-2.5 w-14 text-brand-red" />
    </div>
  );
}
