"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { PhoneIcon, PinIcon } from "../../components/icons";
import { Skeleton } from "../../components/skeletons";

type BranchDetail = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  address: string;
  city: string;
  area: string;
  openingTime: string;
  closingTime: string;
  status: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  dineInEnabled: boolean;
};

export default function LocationsPage() {
  const { data: branches, isLoading } = useQuery({
    queryKey: ["branches-page"],
    queryFn: () => api.public.get<BranchDetail[]>("/branches"),
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="font-display text-3xl text-brand-red">Our Locations</h1>
      <p className="mt-1 text-sm text-muted">Find a Demo Restaurant branch near you.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32 rounded-md" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="mt-3 h-3 w-4/5 rounded-md" />
              <Skeleton className="mt-2 h-3 w-2/5 rounded-md" />
              <Skeleton className="mt-2 h-3 w-1/2 rounded-md" />
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          ))}
        {!isLoading &&
          branches?.map((b) => (
          <div key={b.id} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">{b.name}</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  b.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-surface-alt text-muted"
                }`}
              >
                {b.status === "ACTIVE" ? "Open" : b.status.replace(/_/g, " ")}
              </span>
            </div>

            <p className="mt-3 flex items-start gap-2 text-sm text-muted">
              <PinIcon size={16} className="mt-0.5 shrink-0" />
              <span>
                {b.address}, {b.area}, {b.city}
              </span>
            </p>
            {b.phone && (
              <a href={`tel:${b.phone}`} className="mt-2 flex items-center gap-2 text-sm text-muted hover:text-brand-red">
                <PhoneIcon size={16} /> {b.phone}
              </a>
            )}
            <p className="mt-2 text-sm text-muted">
              Open {b.openingTime} – {b.closingTime}
            </p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {b.deliveryEnabled && <span className="rounded-full bg-surface-alt px-2.5 py-1 text-ink">Delivery</span>}
              {b.pickupEnabled && <span className="rounded-full bg-surface-alt px-2.5 py-1 text-ink">Pickup</span>}
              {b.dineInEnabled && <span className="rounded-full bg-surface-alt px-2.5 py-1 text-ink">Dine-In</span>}
            </div>
          </div>
        ))}
        {!isLoading && !branches?.length && <p className="text-sm text-muted">No branches available.</p>}
      </div>
    </main>
  );
}
