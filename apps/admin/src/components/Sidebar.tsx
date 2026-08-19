"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMe, hasPermission } from "../lib/useMe";
import { useAuthStore } from "../store/useAuthStore";

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

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const logout = useAuthStore((s) => s.logout);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map((g) => [g.label, g.items.some((item) => item.href === pathname)])),
  );

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  const linkClass = (active: boolean) =>
    `block rounded-lg px-3 py-2 text-sm ${active ? "bg-brand-red/10 font-medium text-brand-red" : "text-neutral-600 hover:bg-neutral-50"}`;

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white">
      <div className="p-4">
        <p className="font-semibold text-brand-red">Demo Restaurant</p>
        <p className="text-xs text-neutral-400">Admin Dashboard</p>
      </div>
      <nav className="flex-1 space-y-0.5 px-2 pb-3">
        <Link href={DASHBOARD.href} className={linkClass(pathname === DASHBOARD.href)}>
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
                    <Link key={item.href} href={item.href} className={linkClass(pathname === item.href)}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <p className="text-xs font-medium text-neutral-900">{me?.name}</p>
        <p className="text-xs text-neutral-400">{me?.role}</p>
        <button
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="mt-2 text-xs text-neutral-400 underline"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
