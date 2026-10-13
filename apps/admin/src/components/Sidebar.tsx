"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FaBurger,
  FaCashRegister,
  FaChair,
  FaChartPie,
  FaCirclePlus,
  FaClockRotateLeft,
  FaEnvelope,
  FaEnvelopeOpenText,
  FaPenToSquare,
  FaCommentDots,
  FaFileContract,
  FaFileInvoiceDollar,
  FaChartLine,
  FaGift,
  FaHeartPulse,
  FaImages,
  FaPhotoFilm,
  FaBullhorn,
  FaNewspaper,
  FaBuildingColumns,
  FaBoxesStacked,
  FaCartShopping,
  FaKitchenSet,
  FaLayerGroup,
  FaListCheck,
  FaLocationDot,
  FaMagnifyingGlass,
  FaMagnifyingGlassChart,
  FaMobileScreen,
  FaMotorcycle,
  FaPalette,
  FaPrint,
  FaReceipt,
  FaRobot,
  FaShuffle,
  FaStore,
  FaTableColumns,
  FaTags,
  FaTicket,
  FaUserShield,
  FaUsers,
  FaXmark,
} from "react-icons/fa6";
import type { IconType } from "react-icons";
import { useMe, hasPermission } from "../lib/useMe";
import { useSidebarStore } from "../store/useSidebarStore";
import { api } from "../lib/api";

export type NavItem = { href: string; label: string; permission: string | null; icon: IconType };
export type NavGroup = { label: string; items: NavItem[] };

export const DASHBOARD: NavItem = { href: "/", label: "Dashboard", permission: null, icon: FaChartPie };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/orders", label: "Orders", permission: "orders.view", icon: FaReceipt },
      { href: "/pos", label: "POS", permission: "pos.access", icon: FaCashRegister },
      { href: "/tables", label: "Tables", permission: "tables.view", icon: FaChair },
      { href: "/kitchen", label: "Kitchen", permission: "kitchen.access", icon: FaKitchenSet },
      { href: "/riders", label: "Riders", permission: "riders.view", icon: FaMotorcycle },
      { href: "/reports/finance", label: "Order & Finance Reports", permission: "reports.view", icon: FaFileInvoiceDollar },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/categories", label: "Categories", permission: "categories.view", icon: FaLayerGroup },
      { href: "/products", label: "Products", permission: "products.view", icon: FaBurger },
      { href: "/deals", label: "Deals", permission: "deals.view", icon: FaTags },
      { href: "/choice-sections", label: "Choice Sections", permission: "choiceGroups.view", icon: FaListCheck },
      { href: "/addons", label: "Add-ons", permission: "addonGroups.view", icon: FaCirclePlus },
      { href: "/coupons", label: "Coupons", permission: "coupons.view", icon: FaTicket },
      { href: "/inventory", label: "Inventory", permission: "inventoryStock.view,inventoryRecipes.view,inventoryPurchases.view,inventorySuppliers.view,inventoryTransfers.view,inventoryHistory.view,inventoryReports.view", icon: FaBoxesStacked },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/customers", label: "Customers", permission: "customers.view", icon: FaUsers },
      { href: "/complaints", label: "Complaints", permission: "complaints.view", icon: FaCommentDots },
    ],
  },
  {
    label: "Website",
    items: [
      { href: "/settings/header", label: "Header & Branding", permission: "settings.view", icon: FaPalette },
      { href: "/settings/banners", label: "Hero Banners", permission: "cms.view", icon: FaImages },
      { href: "/media", label: "Media Library", permission: "cms.view", icon: FaPhotoFilm },
      { href: "/settings/popups", label: "Marketing Pop-ups", permission: "cms.view", icon: FaBullhorn },
      { href: "/blog", label: "Blog", permission: "cms.view", icon: FaNewspaper },
      { href: "/bank-discounts", label: "Bank Discounts", permission: "cms.view", icon: FaBuildingColumns },
      { href: "/settings/checkout", label: "Checkout", permission: "settings.view", icon: FaCartShopping },
      { href: "/settings/footer", label: "Footer", permission: "settings.view", icon: FaTableColumns },
      { href: "/settings/app-promo", label: "App Promo & About", permission: "settings.view", icon: FaMobileScreen },
      { href: "/settings/pages", label: "Legal Pages", permission: "settings.view", icon: FaFileContract },
      { href: "/settings/receipts", label: "Receipts", permission: "settings.view", icon: FaPrint },
      { href: "/settings/location-popup", label: "Location Popup", permission: "settings.view", icon: FaLocationDot },
      { href: "/settings/loyalty", label: "Loyalty Program", permission: "settings.view", icon: FaGift },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/emails", label: "Email Templates", permission: "emails.manage", icon: FaEnvelopeOpenText },
      { href: "/emails/compose", label: "Write an Email", permission: "emails.send", icon: FaPenToSquare },
      { href: "/emails/log", label: "Email Log", permission: "emails.view", icon: FaEnvelope },
    ],
  },
  {
    label: "SEO & Marketing",
    items: [
      { href: "/seo", label: "SEO & Meta Tags", permission: "seo.view", icon: FaMagnifyingGlassChart },
      { href: "/seo/tracking", label: "Tracking & Pixels", permission: "seo.view", icon: FaChartLine },
      { href: "/seo/robots", label: "Robots & Sitemap", permission: "seo.view", icon: FaRobot },
      { href: "/seo/redirects", label: "Redirects", permission: "seo.view", icon: FaShuffle },
      { href: "/seo/health", label: "SEO Health", permission: "seo.view", icon: FaHeartPulse },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/branches", label: "Branches", permission: "branches.view", icon: FaStore },
      { href: "/staff", label: "Staff & Access Management", permission: "staff.view", icon: FaUserShield },
      { href: "/audit-logs", label: "Audit Logs", permission: "auditLogs.view", icon: FaClockRotateLeft },
    ],
  },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

type RestaurantInfo = { name: string; logoUrl: string | null };

/** A page is "current" on its own path and on any sub-page (e.g. /staff/123 keeps Staff highlighted). */
const isActivePath = (pathname: string, href: string) => (href === "/" || href === "/seo" || href === "/emails" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

export function Sidebar() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: restaurant } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.get<RestaurantInfo>("/cms/restaurant"),
  });
  const mobileOpen = useSidebarStore((s) => s.mobileOpen);
  const collapsed = useSidebarStore((s) => s.collapsed);
  const closeMobile = useSidebarStore((s) => s.closeMobile);

  // Name label shown next to a hovered icon while the sidebar is collapsed. Rendered in a portal because the
  // sidebar clips its own overflow and a plain absolute label would be cut off.
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const showTip = (label: string) => (e: React.SyntheticEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hideTip = () => setTip(null);

  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map((g) => [g.label, g.items.some((item) => isActivePath(pathname, item.href))])),
  );

  // Moving to a page always reveals its group.
  useEffect(() => {
    const group = NAV_GROUPS.find((g) => g.items.some((item) => isActivePath(pathname, item.href)));
    if (group) setOpenGroups((prev) => (prev[group.label] ? prev : { ...prev, [group.label]: true }));
  }, [pathname]);

  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        visibleItems: group.items.filter((item) => (!item.permission || hasPermission(me, item.permission)) && (!q || item.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q))),
      })).filter((g) => g.visibleItems.length > 0),
    [me, q],
  );
  const showDashboard = !q || DASHBOARD.label.toLowerCase().includes(q);
  const nothingFound = q !== "" && groups.length === 0 && !showDashboard;

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  const itemClass = (active: boolean) =>
    `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
      active ? "bg-brand-red/10 font-semibold text-brand-red" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
    }`;

  const renderItem = (item: NavItem) => {
    const active = isActivePath(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} onClick={closeMobile} aria-current={active ? "page" : undefined} className={itemClass(active)}>
        {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand-red" />}
        <Icon size={15} className={`shrink-0 ${active ? "text-brand-red" : "text-neutral-400 group-hover:text-neutral-600"}`} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  const initials = (me?.name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

  return (
    <>
      <div
        onClick={closeMobile}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-neutral-200 bg-white shadow-xl transition-transform duration-300 ease-in-out lg:static lg:shadow-none lg:transition-[width] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 ${collapsed ? "lg:w-16" : "lg:w-60"}`}
      >
        {/* Collapsed on desktop: a slim rail with just the page icons, so any page is still one click away. */}
        <div className={`hidden h-full w-16 flex-col items-center ${collapsed ? "lg:flex" : ""}`}>
          <div className="flex h-[61px] w-full shrink-0 items-center justify-center border-b border-neutral-100">
            {!restaurant ? (
              <span className="h-9 w-9 animate-pulse rounded-full bg-neutral-200" />
            ) : restaurant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logoUrl} alt="" className="h-9 w-9 rounded-full object-contain ring-1 ring-neutral-200" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-red text-sm font-bold text-white">{(restaurant?.name ?? "R").charAt(0).toUpperCase()}</span>
            )}
          </div>
          <nav className="modal-scroll flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden px-2 py-3">
            {[DASHBOARD, ...NAV_GROUPS.flatMap((g, gi) => [{ divider: gi } as const, ...g.items.filter((item) => !item.permission || hasPermission(me, item.permission))])].map((entry, idx) => {
              if ("divider" in entry) return <span key={`d${entry.divider}`} className="my-1 h-px w-6 shrink-0 bg-neutral-200" />;
              const active = isActivePath(pathname, entry.href);
              const Icon = entry.icon;
              return (
                <Link
                  key={entry.href + idx}
                  href={entry.href}
                  onMouseEnter={showTip(entry.label)}
                  onFocus={showTip(entry.label)}
                  onMouseLeave={hideTip}
                  onBlur={hideTip}
                  onClick={hideTip}
                  aria-label={entry.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? "bg-brand-red/10 text-brand-red" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"}`}
                >
                  {active && <span className="absolute inset-y-2 -left-2 w-[3px] rounded-r-full bg-brand-red" />}
                  <Icon size={16} />
                </Link>
              );
            })}
          </nav>
          {me && (
            <Link href="/profile" aria-label="My profile" className="flex w-full shrink-0 justify-center border-t border-neutral-100 py-3" onMouseEnter={showTip(`My profile: ${me.name} (${me.role})`)} onMouseLeave={hideTip}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold ${pathname === "/profile" ? "bg-brand-red text-white" : "bg-neutral-100 text-neutral-600"}`}>{initials || "?"}</span>
            </Link>
          )}
        </div>

        <div className={`h-full w-64 flex-col lg:w-60 ${collapsed ? "flex lg:hidden" : "flex"}`}>
          {/* Brand */}
          <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-4 py-3.5">
            {!restaurant ? (
              <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-neutral-200" />
            ) : restaurant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-contain ring-1 ring-neutral-200" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-red text-sm font-bold text-white">{(restaurant?.name ?? "R").charAt(0).toUpperCase()}</span>
            )}
            <div className="min-w-0">
              {restaurant ? (
                <p className="truncate text-sm font-semibold text-neutral-900">{restaurant.name}</p>
              ) : (
                <span className="block h-3.5 w-28 animate-pulse rounded bg-neutral-200" />
              )}
              <p className="text-[11px] text-neutral-400">Admin panel</p>
            </div>
          </div>

          {/* Quick filter for the menu */}
          <div className="shrink-0 px-3 pb-1 pt-3">
            <div className="relative">
              <FaMagnifyingGlass size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a page..."
                aria-label="Find a page"
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 pl-8 pr-7 text-xs placeholder:text-neutral-400 focus:border-brand-red focus:bg-white focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700">
                  <FaXmark size={11} />
                </button>
              )}
            </div>
          </div>

          <nav className="modal-scroll flex-1 space-y-1 overflow-y-auto px-2 pb-3 pt-2">
            {showDashboard && renderItem(DASHBOARD)}

            {groups.map((group) => {
              const isOpen = q !== "" || !!openGroups[group.label];
              const hasActive = group.visibleItems.some((item) => isActivePath(pathname, item.href));
              return (
                <div key={group.label} className="pt-2">
                  <button
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 hover:text-neutral-700"
                  >
                    <span className="flex items-center gap-2">
                      {group.label}
                      {!isOpen && hasActive && <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />}
                    </span>
                    {q === "" && <ChevronIcon open={isOpen} />}
                  </button>
                  {isOpen && <div className="mt-0.5 space-y-0.5">{group.visibleItems.map(renderItem)}</div>}
                </div>
              );
            })}

            {nothingFound && <p className="px-3 py-6 text-center text-xs text-neutral-400">No page matches “{query}”.</p>}
          </nav>

          {/* Signed-in user */}
          {me && (
            <Link href="/profile" onClick={closeMobile} title="My profile" className={`flex shrink-0 items-center gap-3 border-t border-neutral-100 px-4 py-3 transition hover:bg-neutral-50 ${pathname === "/profile" ? "bg-brand-red/5" : ""}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${pathname === "/profile" ? "bg-brand-red text-white" : "bg-neutral-100 text-neutral-600"}`}>{initials || "?"}</span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-semibold text-neutral-800">{me.name}</p>
                <p className="truncate text-[11px] text-neutral-400">{me.role} · My profile</p>
              </div>
            </Link>
          )}
        </div>
      </aside>
      {collapsed && tip && typeof document !== "undefined" &&
        createPortal(
          <div role="tooltip" style={{ top: tip.top, left: tip.left }} className="pointer-events-none fixed z-[70] hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg lg:block">
            {tip.label}
          </div>,
          document.body,
        )}
    </>
  );
}
