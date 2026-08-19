"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type RestaurantInfo = { name: string; logoUrl: string | null };

/**
 * Deliberately chrome-less: no site Header/Footer (they self-hide on these routes — see
 * NO_CHROME_PATHS in Header/Footer/LocationModal/CartBar). Matches a dedicated legal/info
 * page pattern — centered logo, single focused reading card, minimal distraction.
 */
export function LegalPageLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const { data: restaurant } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
  });

  return (
    <main className="min-h-screen bg-page px-4 py-10 sm:px-8">
      <div className="mx-auto flex justify-center">
        <Link href="/" className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-brand-red">
          {restaurant?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logoUrl} alt={restaurant.name} className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center font-display text-sm leading-tight text-white">{restaurant?.name ?? ""}</span>
          )}
        </Link>
      </div>

      <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <nav className="flex items-center gap-1.5 text-sm text-muted">
          <Link href="/" className="hover:text-ink">
            Home
          </Link>
          <span aria-hidden="true">›</span>
          <span className="font-medium text-brand-red">{title}</span>
        </nav>

        <h1 className="mt-4 text-2xl font-bold text-ink sm:text-3xl">{title}</h1>

        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
