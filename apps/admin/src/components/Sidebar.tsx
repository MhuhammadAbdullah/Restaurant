"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMe, hasPermission } from "../lib/useMe";
import { useSidebarStore } from "../store/useSidebarStore";
import { api } from "../lib/api";

type NavItem = { href: string; label: string; permission: string | null };
type NavGroup = { label: string; items: NavItem[] };

const DASHBOARD: NavItem = { href: "/", label: "Dashboard", permission: null };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/orders", label: "Orders", permission: "orders.view" },
      { href: "/pos", label: "POS", permission: "pos.access" },
      { href: "/tables", label: "Tables", permission: "tables.view" },
      { href: "/kitchen", label: "Kitchen", permission: "kitchen.access" },
      { href: "/riders", label: "Riders", permission: "riders.view" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/categories", label: "Categories", permission: "categories.view" },
      { href: "/products", label: "Products", permission: "products.view" },
      { href: "/deals", label: "Deals", permission: "deals.view" },
      { href: "/choice-sections", label: "Choice Sections", permission: "choiceGroups.view" },
      { href: "/addons", label: "Add-ons", permission: "addonGroups.view" },
      { href: "/coupons", label: "Coupons", permission: "coupons.view" },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/customers", label: "Customers", permission: "customers.view" },
      { href: "/complaints", label: "Complaints", permission: "complaints.view" },
    ],
  },
  {
    label: "Website",
    items: [
      { href: "/settings/header", label: "Header & Branding", permission: "settings.view" },
      { href: "/settings/banners", label: "Hero Banners", permission: "cms.view" },
      { href: "/settings/footer", label: "Footer", permission: "settings.view" },
      { href: "/settings/app-promo", label: "App Promo & About", permission: "settings.view" },
      { href: "/settings/pages", label: "Legal Pages", permission: "settings.view" },
      { href: "/settings/receipts", label: "Receipts", permission: "settings.view" },
      { href: "/settings/location-popup", label: "Location Popup", permission: "settings.view" },
      { href: "/settings/loyalty", label: "Loyalty Program", permission: "settings.view" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/branches", label: "Branches", permission: "branches.view" },
      { href: "/staff", label: "Staff & Access Management", permission: "staff.view" },
      { href: "/audit-logs", label: "Audit Logs", permission: "auditLogs.view" },
    ],
  },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

type RestaurantInfo = { name: string; logoUrl: string | null };

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

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map((g) => [g.label, g.items.some((item) => item.href === pathname)])),
  );

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  const linkClass = (active: boolean) =>
    `block rounded-lg px-3 py-2 text-sm ${active ? "bg-brand-red/10 font-medium text-brand-red" : "text-neutral-600 hover:bg-neutral-50"}`;

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
        } lg:translate-x-0 ${collapsed ? "lg:w-0 lg:border-r-0" : "lg:w-56"}`}
      >
        <div className="flex h-full w-64 flex-col overflow-y-auto lg:w-56">
          <div className="flex items-center border-b border-neutral-100 p-4">
            {restaurant?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logoUrl} alt={restaurant.name} className="h-10 w-auto rounded-full object-contain" />
            ) : (
              <p className="font-semibold text-brand-red">{restaurant?.name ?? "Restaurant"}</p>
            )}
          </div>
          <nav className="flex-1 space-y-0.5 px-2 pb-3 pt-3">
            <Link href={DASHBOARD.href} onClick={closeMobile} className={linkClass(pathname === DASHBOARD.href)}>
              {DASHBOARD.label}
            </Link>

            {NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter((item) => !item.permission || hasPermission(me, item.permission));
              if (visibleItems.length === 0) return null;
              const isOpen = !!openGroups[group.label];

              return (
                <div key={group.label} className="pt-1">
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600"
                  >
                    {group.label}
                    <ChevronIcon open={isOpen} />
                  </button>
                  {isOpen && (
                    <div className="mt-0.5 space-y-0.5">
                      {visibleItems.map((item) => (
                        <Link key={item.href} href={item.href} onClick={closeMobile} className={linkClass(pathname === item.href)}>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
