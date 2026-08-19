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

  const locationSubtitle = branch
    ? orderType === "DELIVERY"
      ? `${area}, ${city} – eta ${branch.estimatedDeliveryMins} minutes.`
      : `${branch.area}, ${branch.city}`
    : "";
  const locationLabel = orderType === "DELIVERY" ? header.deliveryButtonLabel : header.pickupButtonLabel;

  const navButtonClass =
    "flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-medium text-black transition hover:bg-neutral-100 sm:text-sm";

  return (
    <>
      <header className="relative z-20 bg-brand-red">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/" className="flex items-center">
              {restaurantLoading ? (
                <Skeleton className="h-10 w-28 rounded-md sm:h-12 sm:w-32" />
              ) : restaurant?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={restaurant.logoUrl} alt={restaurant.name} className="h-14 w-auto object-contain sm:h-16" />
              ) : (
                <span className="font-display text-xl text-white sm:text-2xl">{restaurant?.name}</span>
              )}
            </Link>
            {branch && (
              <button
                onClick={openChangeModal}
                className="hidden items-center gap-2.5 rounded-xl bg-white px-3.5 py-2 text-left text-black transition hover:bg-neutral-100 sm:flex"
              >
                <PinIcon size={20} className="shrink-0 text-brand-red" />
                <span className="flex flex-col leading-tight">
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    {locationLabel}
                    <ChevronDownIcon size={14} className="text-brand-red" />
                  </span>
                  <span className="text-xs text-black/60">{locationSubtitle}</span>
                </span>
              </button>
            )}
            <ContactPopover triggerClassName={`hidden ${navButtonClass} sm:flex`} />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/complaints" className={`hidden ${navButtonClass} sm:flex`}>
              <ComplaintIcon size={16} className="text-brand-red" />
              {header.complaintButtonLabel}
            </Link>
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

        {branch && (
          <button
            onClick={() => {
              openChangeModal();
              setMenuOpen(false);
            }}
            className="flex items-center gap-2.5 rounded-xl bg-brand-red px-3.5 py-2.5 text-left text-white sm:hidden"
          >
            <PinIcon size={20} className="shrink-0 text-white" />
            <span className="flex flex-col leading-tight">
              <span className="flex items-center gap-1 text-sm font-semibold">
                {locationLabel}
                <ChevronDownIcon size={14} />
              </span>
              <span className="text-xs text-white/80">{locationSubtitle}</span>
            </span>
          </button>
        )}

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
