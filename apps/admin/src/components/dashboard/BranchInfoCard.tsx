"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FaBicycle, FaBagShopping, FaClock, FaEnvelope, FaLocationDot, FaMapLocationDot, FaPhone, FaStore, FaUtensils } from "react-icons/fa6";
import { formatPaisa } from "@restaurant/utils";
import { api } from "../../lib/api";

type Branch = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string;
  area: string;
  mapUrl: string | null;
  imageUrl?: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  openingTime: string;
  closingTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  deliveryFee: number;
  minimumOrder: number;
  estimatedDeliveryMins: number;
  status: "ACTIVE" | "INACTIVE" | "TEMPORARILY_CLOSED";
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  dineInEnabled: boolean;
};

function to12h(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
/** Inside opening hours (and outside the break) right now? Handles closing after midnight. */
function isOpenNow(b: Branch): boolean {
  if (b.status !== "ACTIVE") return false;
  const now = new Date();
  const t = now.getHours() * 60 + now.getMinutes();
  const o = mins(b.openingTime);
  const c = mins(b.closingTime);
  const inside = o <= c ? t >= o && t < c : t >= o || t < c;
  if (!inside) return false;
  if (b.breakStart && b.breakEnd) {
    const bs = mins(b.breakStart);
    const be = mins(b.breakEnd);
    if (bs <= be ? t >= bs && t < be : t >= bs || t < be) return false;
  }
  return true;
}
function statusOf(b: Branch): { label: string; chip: string; dot: string } {
  if (b.status === "TEMPORARILY_CLOSED") return { label: "Temporarily closed", chip: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
  if (b.status === "INACTIVE") return { label: "Inactive", chip: "bg-neutral-100 text-neutral-500", dot: "bg-neutral-400" };
  return isOpenNow(b) ? { label: "Open now", chip: "bg-green-50 text-green-700", dot: "bg-green-500" } : { label: "Closed now", chip: "bg-red-50 text-red-700", dot: "bg-red-500" };
}
const mapsHref = (b: Branch) =>
  b.mapUrl || (b.latitude != null && b.longitude != null ? `https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.name, b.address, b.area, b.city].filter(Boolean).join(", "))}`);

function Detail({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-sm text-neutral-700">
      <span className="mt-0.5 shrink-0 text-neutral-400">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * Details of the branch the person is looking at: a single branch shows everything about it; when several are in
 * scope (All branches) it shows a compact overview of each one. `scopeIds` limits the list to the branches the
 * signed-in person may see.
 */
export function BranchInfoCard({ branchId, scopeIds, greeting }: { branchId: string; scopeIds?: string[]; greeting?: { name: string; role?: string } }) {
  const { data } = useQuery({ queryKey: ["branches-public"], queryFn: () => api.get<Branch[]>("/branches"), staleTime: 60_000 });

  const inScope = useMemo(() => (data ?? []).filter((b) => !scopeIds || scopeIds.includes(b.id)).sort((a, b) => a.name.localeCompare(b.name)), [data, scopeIds]);
  const branch = branchId ? inScope.find((b) => b.id === branchId) : inScope.length === 1 ? inScope[0] : undefined;

  if (!data) return <div className="h-40 animate-pulse rounded-xl border border-neutral-200 bg-white" />;

  // ---- one branch: full details ----
  if (branch) {
    const st = statusOf(branch);
    return (
      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-gradient-to-r from-brand-red/5 to-transparent px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {branch.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branch.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red"><FaStore size={22} /></span>
            )}
            <div className="min-w-0">
              {greeting && (
                <p className="text-xs font-medium text-brand-red">
                  Welcome back, {greeting.name.split(" ")[0]}
                  {greeting.role ? ` · ${greeting.role}` : ""}
                </p>
              )}
              <h2 className="truncate text-lg font-semibold text-neutral-900">{branch.name}</h2>
              <p className="text-xs text-neutral-500">
                {branch.area}, {branch.city} · Code {branch.code}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${st.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
          </span>
        </div>

        <div className="grid gap-x-8 gap-y-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
          <Detail icon={<FaClock size={13} />}>
            {to12h(branch.openingTime)} – {to12h(branch.closingTime)}
            {branch.breakStart && branch.breakEnd && <span className="block text-xs text-neutral-400">Break {to12h(branch.breakStart)} – {to12h(branch.breakEnd)}</span>}
          </Detail>
          {branch.phone && <Detail icon={<FaPhone size={13} />}><a href={`tel:${branch.phone}`} className="hover:text-brand-red">{branch.phone}</a></Detail>}
          {branch.email && <Detail icon={<FaEnvelope size={13} />}><span className="break-all">{branch.email}</span></Detail>}
          {branch.address && (
            <Detail icon={<FaLocationDot size={13} />}>
              {branch.address}
              <a href={mapsHref(branch)} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-xs font-medium text-brand-red hover:underline">
                <FaMapLocationDot size={11} /> Open in Maps
              </a>
            </Detail>
          )}
          <div className="flex flex-wrap items-center gap-1.5 md:col-span-2 xl:col-span-1">
            {branch.dineInEnabled && <span className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"><FaUtensils size={10} /> Dine-in</span>}
            {branch.pickupEnabled && <span className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"><FaBagShopping size={10} /> Pickup</span>}
            {branch.deliveryEnabled && (
              <span className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                <FaBicycle size={11} /> Delivery · {branch.deliveryFee > 0 ? formatPaisa(branch.deliveryFee) : "free"} · ~{branch.estimatedDeliveryMins} min{branch.minimumOrder > 0 ? ` · min ${formatPaisa(branch.minimumOrder)}` : ""}
              </span>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ---- several branches: an overview ----
  if (inScope.length === 0) return null;
  const openCount = inScope.filter(isOpenNow).length;
  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red"><FaStore size={17} /></span>
          <div>
            {greeting && <p className="text-xs font-medium text-brand-red">Welcome back, {greeting.name.split(" ")[0]}{greeting.role ? ` · ${greeting.role}` : ""}</p>}
            <h2 className="text-base font-semibold text-neutral-900">All branches</h2>
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          {inScope.length} branches · <span className="font-medium text-green-700">{openCount} open now</span>. Pick one above to see its details.
        </p>
      </div>
      <div className="grid gap-x-6 gap-y-1 px-5 py-3 sm:grid-cols-2 xl:grid-cols-3">
        {inScope.map((b) => {
          const st = statusOf(b);
          return (
            <div key={b.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                <span className="truncate font-medium text-neutral-800">{b.name}</span>
              </span>
              <span className="shrink-0 text-xs text-neutral-400">{b.city}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
