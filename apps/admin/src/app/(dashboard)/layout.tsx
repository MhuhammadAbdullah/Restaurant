"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "../../store/useAuthStore";
import { SESSION_EXPIRED_EVENT, startSessionKeepAlive } from "../../lib/api";
import { toggleSidebarForViewport } from "../../store/useSidebarStore";
import { Sidebar, NAV_GROUPS } from "../../components/Sidebar";
import { BranchPicker } from "../../components/BranchPicker";
import { NotificationBell } from "../../components/NotificationBell";
import { NewOrderAlert } from "../../components/NewOrderAlert";
import { FullscreenToggle, ThemeToggle } from "../../components/HeaderTools";
import { WorkspaceLoader } from "../../components/WorkspaceLoader";
import { MenuIcon, LogoutIcon } from "../../components/icons";
import { useRealtimeOrders } from "../../lib/useRealtime";
import { useMe, hasPermission } from "../../lib/useMe";

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
        <Link href="/profile" className="mr-3 ml-auto text-xs font-medium text-neutral-500 underline hover:text-brand-red">My profile</Link>
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
  const { data: me, isError: meFailed, refetch: refetchMe } = useMe();
  const isRider = me?.role === "Rider";
  // The main dashboard page has its own in-page branch selector (with an "All Branches" option
  // the global header picker doesn't support), so the header picker is redundant there.
  const isDashboardHome = pathname === "/";

  useEffect(() => {
    // Wait for zustand to finish reading localStorage before deciding there's no session —
    // otherwise every hard refresh redirects a still-logged-in staff member to /login.
    if (hasHydrated && !staff) router.push("/login");
  }, [hasHydrated, staff, router]);

  // Keep the login fresh in the background for as long as the dashboard is open.
  useEffect(() => {
    startSessionKeepAlive();
  }, []);

  // The saved login stopped being accepted (it expired, or the account was signed out elsewhere): leave quietly for the login page.
  useEffect(() => {
    const onExpired = () => {
      logout();
      router.replace("/login");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [logout, router]);

  // Riders have no reports/orders-list access — the owner-style overview at "/" would just be
  // empty for them. Send them straight to their own delivery dashboard instead.
  useEffect(() => {
    if (staff && isRider && pathname === "/") router.replace("/rider");
  }, [staff, isRider, pathname, router]);

  useRealtimeOrders();

  // Typing a page's address without permission should say so, not show a broken, empty page.
  // Receipt/ticket print pages are checked by the API per action instead (cashiers and cooks both print).
  const needed =
    pathname.startsWith("/pos/receipt") || pathname.startsWith("/pos/kitchen-ticket")
      ? null
      : NAV_GROUPS.flatMap((g) => g.items)
          .filter((i) => i.permission && (pathname === i.href || pathname.startsWith(`${i.href}/`)))
          .sort((a, b) => b.href.length - a.href.length)[0];
  const blocked = !!me && !!needed && !hasPermission(me, needed.permission!);

  if (!hasHydrated || !staff) return null;

  // Draw nothing of the dashboard until we know who this is and what they may open: just a loading screen,
  // so a cashier never glimpses the owner's pages (and vice versa) while their details arrive.
  if (!me) {
    return (
      <WorkspaceLoader
        failed={meFailed}
        onRetry={() => void refetchMe()}
        onSignOut={() => {
          logout();
          router.push("/login");
        }}
      />
    );
  }

  // A rider's home is /rider. While the redirect from "/" happens, show the loading screen instead of letting the
  // general home page flash for a split second.
  if (isRider && pathname === "/") return <WorkspaceLoader />;

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
            <Link href="/profile" title="My profile" className="hidden rounded-lg px-2 py-1 text-right leading-tight transition hover:bg-neutral-100 sm:block">
              <p className="text-sm font-medium text-neutral-900">{me?.name}</p>
              <p className="text-xs text-neutral-400">{me?.role}</p>
            </Link>
            <div className="flex items-center gap-0.5">
              <FullscreenToggle />
              <ThemeToggle />
              <NotificationBell />
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-brand-red"
            >
              <LogoutIcon size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>
        <main className="relative flex-1 overflow-y-auto p-4 sm:p-6 print:overflow-visible print:p-0">
          {blocked ? (
            <div className="mx-auto mt-16 max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
              <p className="text-lg font-semibold text-neutral-900">You don&apos;t have access to {needed!.label}</p>
              <p className="mt-2 text-sm text-neutral-500">Ask an admin to give you this permission in Staff &amp; Access Management.</p>
              <button onClick={() => router.push("/")} className="mt-5 rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">Back to dashboard</button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
