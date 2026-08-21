"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FaBars } from "react-icons/fa6";
import { api } from "../lib/api";
import { useCartStore } from "../store/useCartStore";
import { useCartDrawerStore } from "../store/useCartDrawerStore";
import { useAuthStore } from "../store/useAuthStore";
import { useAuthModalStore } from "../store/useAuthModalStore";
import { useLocationStore } from "../store/useLocationStore";
import { ContactPopover } from "./ContactPopover";
import { CustomerNotificationBell } from "./CustomerNotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { ChevronDownIcon, ComplaintIcon, CloseIcon, PinIcon, UserIcon } from "./icons";
import { CART_ICON_URL } from "../lib/constants";
import { Skeleton } from "./skeletons";

type HeaderConfig = {
  deliveryButtonLabel: string;
  pickupButtonLabel: string;
  contactButtonLabel: string;
  complaintButtonLabel: string;
  showCartIcon: boolean;
  showHamburgerIcon: boolean;
};

type RestaurantInfo = { name: string; logoUrl: string | null; header: HeaderConfig };

const DEFAULT_HEADER: HeaderConfig = {
  deliveryButtonLabel: "Delivery from",
  pickupButtonLabel: "Pick-Up from",
  contactButtonLabel: "Contact",
  complaintButtonLabel: "Submit a Complaint",
  showCartIcon: true,
  showHamburgerIcon: true,
};

/** These pages render their own minimal chrome (see LegalPageLayout) — no site header/footer around them. */
const NO_CHROME_PATHS = ["/terms", "/privacy-policy", "/faqs"];

export function Header() {
  const pathname = usePathname();
  const items = useCartStore((s) => s.items);
  const openCart = useCartDrawerStore((s) => s.open);
  const customer = useAuthStore((s) => s.customer);
  const openAuthModal = useAuthModalStore((s) => s.open);
  const { branch, orderType, city, area, openChangeModal } = useLocationStore();
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: restaurant, isLoading: restaurantLoading } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const header = restaurant?.header ?? DEFAULT_HEADER;

  if (NO_CHROME_PATHS.includes(pathname)) return null;

  const locationSubtitle = branch ? (orderType === "DELIVERY" ? area : branch.area) ?? "" : "";
  const locationLabel = orderType === "DELIVERY" ? header.deliveryButtonLabel : header.pickupButtonLabel;

  const navButtonClass =
    "flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-medium text-black transition hover:bg-neutral-100 sm:text-sm";

  return (
    <>
      <header className="relative z-20 bg-brand-red">
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link href="/" className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center">
            {restaurantLoading ? (
              <Skeleton className="h-10 w-28 rounded-md sm:h-12 sm:w-32" />
            ) : restaurant?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logoUrl} alt={restaurant.name} className="h-14 w-auto object-contain sm:h-16" />
            ) : (
              <span className="font-display text-xl text-white sm:text-2xl">{restaurant?.name}</span>
            )}
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {branch && (
              <button
                onClick={openChangeModal}
                className="flex items-center gap-1 rounded-lg bg-white px-1.5 py-1 text-left text-black transition hover:bg-neutral-100 sm:gap-2.5 sm:px-3.5 sm:py-2"
              >
                <PinIcon size={14} className="shrink-0 text-brand-red sm:hidden" />
                <PinIcon size={20} className="hidden shrink-0 text-brand-red sm:block" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="flex items-center gap-0.5 text-xs font-semibold sm:gap-1 sm:text-sm">
                    <span className="max-w-[62px] truncate sm:max-w-none">{locationLabel}</span>
                    <ChevronDownIcon size={12} className="shrink-0 text-brand-red sm:hidden" />
                    <ChevronDownIcon size={14} className="hidden shrink-0 text-brand-red sm:block" />
                  </span>
                  <span className="block max-w-[90px] truncate text-[10px] text-black/60 sm:max-w-[200px] sm:text-xs">
                    {locationSubtitle}
                  </span>
                </span>
              </button>
            )}
            <ContactPopover triggerClassName={`hidden ${navButtonClass} sm:flex`} />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <ContactPopover triggerClassName={`${navButtonClass} sm:hidden`} />
            {customer && <CustomerNotificationBell />}
            {header.showCartIcon && (
              <button onClick={openCart} className="relative text-white" aria-label="Open cart">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CART_ICON_URL} alt="Cart" className="h-8 w-8 object-contain" />
                {count > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-brand-red bg-white text-[10px] font-semibold text-brand-red">
                    {count}
                  </span>
                )}
              </button>
            )}
            {header.showHamburgerIcon && (
              <button onClick={() => setMenuOpen(true)} className="text-white" aria-label="Open menu">
                <FaBars size={22} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-72 flex-col gap-3 bg-surface p-5 text-ink shadow-2xl transition-transform duration-300 ease-in-out ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="flex items-center justify-between">
          <p className="font-display text-lg text-brand-red">Menu</p>
          <button onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <CloseIcon size={20} />
          </button>
        </div>

        {customer ? (
          <Link
            href="/account"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-lg bg-brand-red px-3 py-2.5 text-sm font-medium text-white"
          >
            <UserIcon size={16} /> My Account ({customer.name.split(" ")[0]})
          </Link>
        ) : (
          <button
            onClick={() => {
              setMenuOpen(false);
              openAuthModal("login");
            }}
            className="flex items-center gap-2 rounded-lg bg-brand-red px-3 py-2.5 text-sm font-medium text-white"
          >
            <UserIcon size={16} /> Login / Register
          </button>
        )}

        <Link
          href="/complaints"
          onClick={() => setMenuOpen(false)}
          className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm"
        >
          <ComplaintIcon size={16} /> Complaint
        </Link>

        <ThemeToggle className="justify-start" />
      </aside>
    </>
  );
}
