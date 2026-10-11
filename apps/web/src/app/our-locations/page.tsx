"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { optimizeImage } from "../../lib/image";
import { PinIcon } from "../../components/icons";
import { Skeleton } from "../../components/skeletons";
import { HeroBanner } from "../../components/HeroBanner";

type BranchDetail = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  address: string | null;
  city: string;
  area: string;
  mapUrl: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  imageUrl: string | null;
  openingTime: string;
  closingTime: string;
  status: string;
};

type RestaurantInfo = { name: string; logoUrl: string | null };

/** Where a click on the branch should take the visitor: the saved Google Maps link, else the pin, else a search for the address. */
function mapLink(b: BranchDetail): string {
  if (b.mapUrl) return b.mapUrl;
  if (b.latitude != null && b.longitude != null) return `https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.name, b.address, b.area, b.city].filter(Boolean).join(", "))}`;
}

function BranchCard({ branch, logoUrl }: { branch: BranchDetail; logoUrl: string | null }) {
  const open = branch.status === "ACTIVE";
  return (
    <a
      href={mapLink(branch)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${branch.name} - open location in Google Maps`}
      className="group block rounded-3xl outline-none transition focus-visible:ring-2 focus-visible:ring-brand-red"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-line bg-surface-alt">
        {branch.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizeImage(branch.imageUrl, 800)} alt={`${branch.name} branch`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105" />
        ) : logoUrl ? (
          // no branch photo uploaded: the restaurant logo stands in
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizeImage(logoUrl, 400)} alt="" loading="lazy" className="h-full w-full object-contain p-10 transition-transform duration-500 ease-out group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-brand-red">
            <PinIcon size={40} />
          </div>
        )}
        {!open && <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">{branch.status.replace(/_/g, " ").toLowerCase()}</span>}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 px-1 text-center">
        <PinIcon size={20} className="shrink-0 text-brand-red" />
        <span className="text-lg font-semibold text-ink transition group-hover:text-brand-red">{branch.name}</span>
      </div>
      <p className="mt-0.5 text-center text-xs text-muted">
        {[branch.area, branch.city].filter(Boolean).join(", ")} · {branch.openingTime} – {branch.closingTime}
      </p>
    </a>
  );
}

const INITIAL_CITIES = 3;

export default function LocationsPage() {
  // Starts with the first 3 cities; every click on "Load more" reveals one more.
  const [visibleCities, setVisibleCities] = useState(INITIAL_CITIES);
  const { data: branches, isLoading } = useQuery({
    queryKey: ["branches-page"],
    queryFn: () => api.public.get<BranchDetail[]>("/branches"),
  });
  const { data: restaurant } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
  });

  // One heading per city (the one with the most branches first), with that city's branches underneath.
  const byCity = useMemo(() => {
    const map = new Map<string, BranchDetail[]>();
    for (const b of branches ?? []) map.set(b.city, [...(map.get(b.city) ?? []), b]);
    return [...map.entries()].sort(([cityA, a], [cityB, b]) => b.length - a.length || cityA.localeCompare(cityB));
  }, [branches]);

  return (
    <>
    <HeroBanner page="LOCATIONS" />
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <h1 className="font-poppins text-3xl font-bold text-brand-red">Our Locations</h1>
      <p className="mt-1 text-sm text-muted">Find a {restaurant?.name ?? "restaurant"} branch near you. Tap a branch to open it in Google Maps.</p>

      {isLoading && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
              <Skeleton className="mx-auto mt-3 h-5 w-40 rounded-md" />
            </div>
          ))}
        </div>
      )}

      {!isLoading &&
        byCity.slice(0, visibleCities).map(([city, list]) => (
          <section key={city} className="mt-10">
            <h2 className="font-poppins text-2xl font-bold uppercase text-ink sm:text-3xl">
              {restaurant?.name ? `${restaurant.name} ` : ""}
              {city}
            </h2>
            <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((b) => (
                <BranchCard key={b.id} branch={b} logoUrl={restaurant?.logoUrl ?? null} />
              ))}
            </div>
          </section>
        ))}

      {!isLoading && byCity.length > visibleCities && (
        <div className="mt-10 flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => setVisibleCities((n) => n + 1)}
            className="rounded-lg bg-brand-red px-8 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Load more
          </button>
          <p className="text-xs text-muted">
            Showing {visibleCities} of {byCity.length} cities
          </p>
        </div>
      )}

      {!isLoading && !branches?.length && <p className="mt-6 text-sm text-muted">No branches available.</p>}
    </main>
    </>
  );
}
