"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FaHouse, FaRegCircleUser, FaBoxOpen, FaBuilding, FaTag, FaRightFromBracket } from "react-icons/fa6";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { useAuthModalStore } from "../../store/useAuthModalStore";
import { SkeletonAccountLayout } from "../../components/skeletons";

const BASE_NAV = [
  { href: "/account", label: "My Profile", icon: FaRegCircleUser },
  { href: "/account/orders", label: "My Orders", icon: FaBoxOpen },
  { href: "/account/addresses", label: "My Addresses", icon: FaBuilding },
];
const LOYALTY_NAV_ITEM = { href: "/account/loyalty", label: "Loyalty Points", icon: FaTag };

type RestaurantInfo = { name: string; logoUrl: string | null; loyalty?: { enabled: boolean } };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const customer = useAuthStore((s) => s.customer);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const logout = useAuthStore((s) => s.logout);
  const openAuthModal = useAuthModalStore((s) => s.open);
  const pathname = usePathname();
  const router = useRouter();

  const { data: restaurant } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
  });

  useEffect(() => {
    // Wait for the persisted session to load — otherwise every refresh reads the
    // pre-hydration default (customer: null) and opens the auth modal on a logged-in user.
    if (hasHydrated && !customer) openAuthModal("login", "/account");
  }, [hasHydrated, customer, openAuthModal]);

  if (!hasHydrated) return <SkeletonAccountLayout />;
  if (!customer) return null;

  // Defaults to shown while the restaurant config is still loading. Hides the Loyalty Points
  // nav item whenever the program itself is off — no separate visibility toggle anymore, the
  // master switch does double duty (no point showing the page for a program that's disabled).
  const loyaltyEnabled = restaurant?.loyalty?.enabled ?? true;
  const nav = loyaltyEnabled ? [...BASE_NAV, LOYALTY_NAV_ITEM] : BASE_NAV;

  return (
    <div className="min-h-screen bg-page">
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <div className="flex-1" />
        <Link href="/" className="flex items-center">
          {restaurant?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logoUrl} alt={restaurant.name} className="h-14 w-auto object-contain" />
          ) : (
            <span className="font-display text-xl text-brand-red">{restaurant?.name ?? "Restaurant"}</span>
          )}
        </Link>
        <div className="flex-1" />
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-10 sm:px-8 lg:grid-cols-[260px_1fr]">
        <aside className="h-fit rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-red text-sm font-bold text-white">
              {initials(customer.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold uppercase text-ink">{customer.name}</p>
              <p className="text-xs text-muted">{customer.phone}</p>
            </div>
          </div>

          <nav className="mt-3 space-y-1">
            <button
              onClick={() => router.push("/")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-surface-alt"
            >
              <FaHouse size={16} /> Home
            </button>
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg border-r-2 px-3 py-2.5 text-sm font-medium ${
                    active ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-transparent text-ink hover:bg-surface-alt"
                  }`}
                >
                  <Icon size={16} /> {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-3 border-t border-line pt-3">
            <button
              onClick={() => {
                logout();
                router.push("/");
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <FaRightFromBracket size={16} /> Sign Out
            </button>
          </div>
        </aside>

        <div>{children}</div>
      </div>
    </div>
  );
}
