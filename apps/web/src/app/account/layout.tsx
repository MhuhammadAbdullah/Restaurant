"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FaArrowLeft, FaBoxOpen, FaCommentDots, FaGift, FaLocationDot, FaRegCircleUser, FaRightFromBracket } from "react-icons/fa6";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { useAuthModalStore } from "../../store/useAuthModalStore";
import { SkeletonAccountLayout } from "../../components/skeletons";

const BASE_NAV = [
  { href: "/account", label: "My Profile", icon: FaRegCircleUser },
  { href: "/account/orders", label: "My Orders", icon: FaBoxOpen },
  { href: "/account/addresses", label: "My Addresses", icon: FaLocationDot },
  { href: "/account/complaints", label: "My Complaints", icon: FaCommentDots },
];
const LOYALTY_NAV_ITEM = { href: "/account/loyalty", label: "Loyalty Points", icon: FaGift };

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

  // Hides the Loyalty Points item whenever the program itself is off.
  const loyaltyEnabled = restaurant?.loyalty?.enabled ?? true;
  const nav = loyaltyEnabled ? [...BASE_NAV, LOYALTY_NAV_ITEM] : BASE_NAV;

  function signOut() {
    logout();
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pb-4 pt-8 sm:px-8 sm:pt-12">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium text-muted transition hover:text-brand-red">
          <FaArrowLeft size={13} /> <span className="hidden sm:inline">Back to menu</span>
        </Link>
        <button onClick={signOut} className="flex items-center gap-2 text-sm font-medium text-muted transition hover:text-brand-red lg:hidden" aria-label="Sign out">
          <FaRightFromBracket size={14} /> <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 pb-12 sm:px-8 lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-7">
        {/* Phones and tablets: a swipeable tab row. Desktop: the side panel below. */}
        <div className="lg:hidden">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-red text-base font-bold text-white">{initials(customer.name)}</span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink">{customer.name}</p>
              <p className="truncate text-xs text-muted">{customer.phone}</p>
            </div>
          </div>
          <nav className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active ? "border-brand-red bg-brand-red text-white" : "border-line bg-surface text-ink hover:border-brand-red"
                  }`}
                >
                  <Icon size={13} /> {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <aside className="hidden h-fit rounded-2xl border border-line bg-surface p-5 lg:block">
          <div className="flex flex-col items-center border-b border-line pb-5 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-red text-xl font-bold text-white">{initials(customer.name)}</span>
            <p className="mt-3 max-w-full truncate text-base font-semibold text-ink">{customer.name}</p>
            <p className="max-w-full truncate text-xs text-muted">{customer.phone}</p>
            {customer.email && <p className="max-w-full truncate text-xs text-muted">{customer.email}</p>}
          </div>

          <nav className="mt-4 space-y-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    active ? "bg-brand-red/10 text-brand-red" : "text-ink hover:bg-surface-alt"
                  }`}
                >
                  <Icon size={15} /> {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 border-t border-line pt-4">
            <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10">
              <FaRightFromBracket size={15} /> Sign Out
            </button>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
