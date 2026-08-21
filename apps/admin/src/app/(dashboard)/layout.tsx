"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "../../store/useAuthStore";
import { toggleSidebarForViewport } from "../../store/useSidebarStore";
import { Sidebar } from "../../components/Sidebar";
import { BranchPicker } from "../../components/BranchPicker";
import { NotificationBell } from "../../components/NotificationBell";
import { NewOrderAlert } from "../../components/NewOrderAlert";
import { MenuIcon, LogoutIcon } from "../../components/icons";
import { useRealtimeOrders } from "../../lib/useRealtime";
import { useMe } from "../../lib/useMe";

/**
 * Riders get a completely separate, minimal shell — no Sidebar, no branch switcher, no admin
 * "new order" bell/toast (that's a front-desk concern, not theirs). Everything else (Owner,
 * Admin, Manager, Kitchen Staff, Cashier, Restaurant Staff) shares the full admin shell below.
 */
function RiderShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const me = useAuthStore((s) => s.staff);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <div>
          <p className="font-semibold text-brand-red">Demo Restaurant</p>
          <p className="text-xs text-neutral-400">{me?.name} · Rider</p>
        </div>
        <button
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="text-xs font-medium text-neutral-400 underline"
        >
          Logout
        </button>
      </header>
      <main className="flex-1 overflow-y-auto p-4">{children}</main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const staff = useAuthStore((s) => s.staff);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const pathname = usePathname();
  const { data: me } = useMe();
  const isRider = me?.role === "Rider";
  // The main dashboard page has its own in-page branch selector (with an "All Branches" option
  // the global header picker doesn't support), so the header picker is redundant there.
  const isDashboardHome = pathname === "/";

  useEffect(() => {
    // Wait for zustand to finish reading localStorage before deciding there's no session —
    // otherwise every hard refresh redirects a still-logged-in staff member to /login.
    if (hasHydrated && !staff) router.push("/login");
  }, [hasHydrated, staff, router]);

  // Riders have no reports/orders-list access — the owner-style overview at "/" would just be
  // empty for them. Send them straight to their own delivery dashboard instead.
  useEffect(() => {
    if (staff && isRider && pathname === "/") router.replace("/rider");
  }, [staff, isRider, pathname, router]);

  useRealtimeOrders();

  if (!hasHydrated || !staff) return null;

  if (isRider) {
    return <RiderShell>{children}</RiderShell>;
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
      <NewOrderAlert />
      <div className="print:hidden">
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6 print:hidden">
          <button
            onClick={toggleSidebarForViewport}
            aria-label="Toggle sidebar"
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <MenuIcon size={18} />
          </button>
          <div className="flex items-center gap-3 sm:gap-4">
            {!isDashboardHome && <BranchPicker />}
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium text-neutral-900">{me?.name}</p>
              <p className="text-xs text-neutral-400">{me?.role}</p>
            </div>
            <NotificationBell />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-brand-red"
            >
              <LogoutIcon size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  );
}
