"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMe, hasPermission } from "../../../lib/useMe";

/** Each tab is a page with its own permission, so a person only sees (and can only open) the ones they were given. */
const TABS = [
  { href: "/inventory", label: "Stock", permission: "inventoryStock.view" },
  { href: "/inventory/recipes", label: "Recipes", permission: "inventoryRecipes.view" },
  { href: "/inventory/purchases", label: "Purchases", permission: "inventoryPurchases.view" },
  { href: "/inventory/suppliers", label: "Suppliers", permission: "inventorySuppliers.view" },
  { href: "/inventory/transfers", label: "Transfers", permission: "inventoryTransfers.view" },
  { href: "/inventory/movements", label: "History", permission: "inventoryHistory.view" },
  { href: "/inventory/reports", label: "Reports", permission: "inventoryReports.view" },
];

const isActive = (href: string, pathname: string) => (href === "/inventory" ? pathname === "/inventory" : pathname.startsWith(href));

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const tabs = me ? TABS.filter((t) => hasPermission(me, t.permission)) : [];
  const current = TABS.find((t) => isActive(t.href, pathname));
  const blocked = !!me && !!current && !hasPermission(me, current.permission);

  // Opening a page by its address without its permission goes to the first page the person may use.
  useEffect(() => {
    if (blocked && tabs[0]) router.replace(tabs[0].href);
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Inventory</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-500">
        Your stock book for each branch: record what comes in, what goes out and what is wasted, buy from suppliers and move stock between branches. Recipes here are the kitchen's cooking instructions and do not change stock.
      </p>
      <nav className="no-scrollbar mt-4 flex gap-1 overflow-x-auto border-b border-neutral-200" aria-label="Inventory sections">
        {tabs.map((t) => {
          const active = isActive(t.href, pathname);
          return (
            <Link key={t.href} href={t.href} className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition ${active ? "border-brand-red text-brand-red" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}>
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-5">
        {me && tabs.length === 0 ? <p className="rounded-lg bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">You do not have access to any Inventory page. Ask the owner to give you one.</p> : blocked ? null : children}
      </div>
    </div>
  );
}
