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
import { ChevronDownIcon, ComplaintIcon, CloseIcon, PinSolidIcon, UserIcon } from "./icons";
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
  contactButtonLabel: "Contact us",
  complaintButtonLabel: "Submit Your Complaint",
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
  const { branch, orderType, area, openChangeModal } = useLocationStore();
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

  return (
    <>
      <header className="relative z-20 bg-page">
        {/* awning scallops along the top edge: equal-size red and white half-dots side by side */}
        <div
          aria-hidden="true"
          className="h-6 w-full"
          style={{
            backgroundImage: [
              "radial-gradient(circle at 25% 0, #ED2320 0 14.5px, transparent 15px)",
              "radial-gradient(circle at 75% 0, #ffffff 0 14.5px, rgba(0,0,0,0.18) 15px, transparent 20px)",
            ].join(", "),
            backgroundSize: "58px 24px",
            backgroundRepeat: "repeat-x",
          }}
        />
        <div className="mx-auto max-w-7xl px-3 pb-4 pt-7 sm:px-8 sm:pb-6 sm:pt-10">
          <div className="relative flex h-14 items-center justify-between gap-2 rounded-full bg-surface-alt px-3 sm:h-16 sm:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              {branch && (
                <button
                  onClick={openChangeModal}
                  className="flex min-w-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-1.5 text-left text-ink transition hover:bg-surface-alt sm:gap-2 sm:px-2.5 sm:py-1.5"
                >
                  <PinSolidIcon size={22} className="shrink-0 text-brand-red sm:hidden" />
                  <PinSolidIcon size={22} className="hidden shrink-0 text-brand-red sm:block" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="flex items-center gap-1 text-xs font-semibold sm:text-sm">
                      <span className="hidden sm:inline">Change Location</span>
                      <span className="max-w-[70px] truncate sm:hidden">{locationSubtitle || "Location"}</span>
                      <ChevronDownIcon size={14} className="ml-auto hidden shrink-0 text-brand-red sm:block" />
                    </span>
                    <span className="hidden max-w-[200px] truncate text-[11px] text-muted sm:block">{locationSubtitle}</span>
                  </span>
                </button>
              )}
              <span aria-hidden="true" className="hidden h-7 w-px bg-line sm:block" />
              <ContactPopover variant="pill" triggerClassName="flex items-center gap-2.5 text-ink" />
            </div>

            <Link
              href="/"
              className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            >
              {restaurantLoading ? (
                <Skeleton className="h-16 w-28 rounded-md sm:h-24 sm:w-40" />
              ) : restaurant?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={restaurant.logoUrl}
                  alt={restaurant.name}
                  className="h-20 w-auto max-w-[40vw] object-contain sm:h-[7.5rem]"
                />
              ) : (
                <span className="font-display text-xl text-brand-red sm:text-2xl">{restaurant?.name}</span>
              )}
            </Link>

            <div className="flex items-center gap-2 sm:gap-4">
              <Link
                href="/complaints"
                className="hidden items-center gap-3 rounded-xl border border-line bg-surface px-3 py-1.5 text-ink transition hover:bg-surface-alt lg:flex"
              >
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">{header.complaintButtonLabel}</span>
                  <span className="text-[10px] text-muted">From Complaint to Care – Share With Us.</span>
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-red/10 text-brand-red">
                  <ComplaintIcon size={14} />
                </span>
              </Link>
              <span aria-hidden="true" className="hidden h-7 w-px bg-line lg:block" />
              {customer && <CustomerNotificationBell />}
              {header.showCartIcon && (
                <button onClick={openCart} className="relative" aria-label="Open cart">
                  {/* The glyph is a white PNG, so tint it via a mask: red in light mode, white in dark. */}
                  <span
                    role="img"
                    aria-label="Cart"
                    className="block h-9 w-9 bg-brand-red dark:bg-white"
                    style={{
                      WebkitMask: `url(${CART_ICON_URL}) center / contain no-repeat`,
                      mask: `url(${CART_ICON_URL}) center / contain no-repeat`,
                    }}
                  />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-red px-1 text-[11px] font-semibold text-white">
                    {count}
                  </span>
                </button>
              )}
              {header.showHamburgerIcon && (
                <button
                  onClick={() => setMenuOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-red/10 text-brand-red"
                  aria-label="Open menu"
                >
                  <FaBars size={18} />
                </button>
              )}
            </div>
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
          <p className="font-poppins text-lg font-semibold text-brand-black">{restaurant?.name}</p>
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
          <ComplaintIcon size={14} /> Complaint
        </Link>

        <ThemeToggle className="justify-start" />
      </aside>
    </>
  );
}
