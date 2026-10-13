"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FaArrowUpRightFromSquare, FaBars, FaBuildingColumns, FaNewspaper } from "react-icons/fa6";
import { api } from "../lib/api";
import { useCartStore } from "../store/useCartStore";
import { useCartDrawerStore } from "../store/useCartDrawerStore";
import { useAuthStore } from "../store/useAuthStore";
import { useAuthModalStore } from "../store/useAuthModalStore";
import { useLocationStore } from "../store/useLocationStore";
import { ContactPopover } from "./ContactPopover";
import { HoverLink } from "./HoverLink";
import { InstallAppButton } from "./InstallAppButton";
import { hoverIn, hoverOut, staggerIn } from "../lib/hoverAnimation";
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

const MENU_LINK = "flex items-center gap-2 overflow-hidden rounded-lg border border-line px-3 py-2.5 text-sm transition-colors duration-200 hover:border-brand-red hover:text-brand-red";

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
  const menuRef = useRef<HTMLElement>(null);

  // The menu buttons slide in one after another each time the menu opens.
  useEffect(() => {
    if (menuOpen && menuRef.current) staggerIn(Array.from(menuRef.current.querySelectorAll<HTMLElement>("[data-menu-item]")));
  }, [menuOpen]);

  const { data: restaurant, isLoading: restaurantLoading } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<RestaurantInfo>("/cms/restaurant"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const header = restaurant?.header ?? DEFAULT_HEADER;
  const { data: bankPage } = useQuery({
    queryKey: ["bank-discounts-info"],
    queryFn: () => api.public.get<{ enabled: boolean; heading: string }>("/bank-discounts"),
    staleTime: 30_000,
  });

  if (NO_CHROME_PATHS.includes(pathname) || pathname.startsWith("/blog") || pathname.startsWith("/bank-discounts")) return null;

  const locationSubtitle = branch ? (orderType === "DELIVERY" ? area : branch.area) ?? "" : "";

  return (
    <>
      <header className="relative z-20 bg-page">
        {/* awning scallops along the top edge: equal-size red and white half-dots side by side */}
        <div
          aria-hidden="true"
          className="h-2.5 w-full sm:hidden"
          style={{
            backgroundImage: [
              "radial-gradient(circle at 25% 0, #ED2320 0 5.5px, transparent 6px)",
              "radial-gradient(circle at 75% 0, #ffffff 0 5.5px, rgba(0,0,0,0.18) 6px, transparent 8px)",
            ].join(", "),
            backgroundSize: "24px 10px",
            backgroundRepeat: "repeat-x",
          }}
        />
        <div
          aria-hidden="true"
          className="hidden h-6 w-full sm:block"
          style={{
            backgroundImage: [
              "radial-gradient(circle at 25% 0, #ED2320 0 14.5px, transparent 15px)",
              "radial-gradient(circle at 75% 0, #ffffff 0 14.5px, rgba(0,0,0,0.18) 15px, transparent 20px)",
            ].join(", "),
            backgroundSize: "58px 24px",
            backgroundRepeat: "repeat-x",
          }}
        />
        <div className="mx-auto max-w-7xl px-3 pb-2 pt-4 sm:px-8 sm:pb-6 sm:pt-10">
          <div className="relative flex h-14 items-center justify-between gap-2 sm:h-16 sm:rounded-full sm:bg-surface-alt sm:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              {branch && (
                <button
                  onClick={openChangeModal}
                  className="flex min-w-0 items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-[3px] text-left text-ink transition hover:bg-surface-alt sm:gap-2 sm:px-2.5 sm:py-1.5"
                >
                  <PinSolidIcon size={13} className="shrink-0 text-brand-red sm:hidden" />
                  <PinSolidIcon size={22} className="hidden shrink-0 text-brand-red sm:block" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold sm:gap-1 sm:text-sm">
                      <span className="whitespace-nowrap">Change Location</span>
                      <ChevronDownIcon size={8} className="ml-auto shrink-0 text-brand-red sm:size-[14px]" />
                    </span>
                    <span className="max-w-[66px] truncate text-[9px] text-muted sm:max-w-[200px] sm:text-[11px]">{locationSubtitle}</span>
                  </span>
                </button>
              )}
              <span aria-hidden="true" className="hidden h-7 w-px bg-line sm:block" />
              <div className="hidden sm:block">
                <ContactPopover variant="pill" triggerClassName="flex items-center gap-2.5 text-ink" />
              </div>
            </div>

            <Link
              href="/"
              className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            >
              {restaurantLoading ? (
                <Skeleton className="h-12 w-24 rounded-md sm:h-24 sm:w-40" />
              ) : restaurant?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={restaurant.logoUrl}
                  alt={restaurant.name}
                  fetchPriority="high"
                  className="h-[4.5rem] w-auto max-w-[40vw] object-contain sm:h-[7.5rem] sm:max-w-[40vw]"
                />
              ) : (
                <span className="font-display text-xl text-brand-red sm:text-2xl">{restaurant?.name}</span>
              )}
            </Link>

            <div className="relative z-10 flex shrink-0 items-center gap-1.5 sm:gap-4">
              <div className="sm:hidden">
                <ContactPopover variant="pill" triggerClassName="flex items-center gap-2.5 text-ink" />
              </div>
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
              {customer && (
                <div className="hidden sm:block">
                  <CustomerNotificationBell />
                </div>
              )}
              {header.showCartIcon && (
                <button onClick={openCart} className="relative" aria-label="Open cart">
                  {/* The glyph is a white PNG, so tint it via a mask: brand red in both light and dark mode. */}
                  <span
                    role="img"
                    aria-label="Cart"
                    className="block h-7 w-7 bg-brand-red sm:h-9 sm:w-9"
                    style={{
                      WebkitMask: `url(${CART_ICON_URL}) center / contain no-repeat`,
                      mask: `url(${CART_ICON_URL}) center / contain no-repeat`,
                    }}
                  />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-red px-1 text-[11px] font-semibold text-white ring-2 ring-page">
                    {count}
                  </span>
                </button>
              )}
              {header.showHamburgerIcon && (
                <button
                  onClick={() => setMenuOpen(true)}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-red/10 text-brand-red sm:h-9 sm:w-9 sm:rounded-lg"
                  aria-label="Open menu"
                >
                  <FaBars size={15} className="sm:!h-[18px] sm:!w-[18px]" />
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
        ref={menuRef}
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
          <div data-menu-item>
            <HoverLink
              href="/account"
              onClick={() => setMenuOpen(false)}
              lineClassName="bg-white/80"
              className="flex items-center gap-2 overflow-hidden rounded-lg bg-brand-red px-3 py-2.5 text-sm font-medium text-white transition-shadow duration-200 hover:shadow-md"
            >
              <UserIcon size={16} /> My Account ({customer.name.split(" ")[0]})
            </HoverLink>
          </div>
        ) : (
          <button
            data-menu-item
            onClick={() => {
              setMenuOpen(false);
              openAuthModal("login");
            }}
            onMouseEnter={(e) => hoverIn(e.currentTarget)}
            onMouseLeave={(e) => hoverOut(e.currentTarget)}
            className="relative flex items-center gap-2 overflow-hidden rounded-lg bg-brand-red px-3 py-2.5 text-sm font-medium text-white transition-shadow duration-200 hover:shadow-md"
          >
            <UserIcon size={16} /> Login / Register
            <span data-hover-line aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/80" style={{ transform: "scaleX(0)" }} />
          </button>
        )}

        {/* These open in a new tab; the arrow on the right says so. */}
        <div data-menu-item>
          <HoverLink href="/blog" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)} className={MENU_LINK}>
            <FaNewspaper size={14} /> <span className="flex-1">Blog</span> <span data-hover-icon className="inline-flex"><FaArrowUpRightFromSquare size={12} className="text-muted" aria-hidden="true" /></span>
          </HoverLink>
        </div>

        {bankPage?.enabled && (
          <div data-menu-item>
            <HoverLink href="/bank-discounts" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)} className={MENU_LINK}>
              <FaBuildingColumns size={14} /> <span className="flex-1">{bankPage.heading || "Bank Discounts"}</span> <span data-hover-icon className="inline-flex"><FaArrowUpRightFromSquare size={12} className="text-muted" aria-hidden="true" /></span>
            </HoverLink>
          </div>
        )}

        <div data-menu-item>
          <HoverLink href="/complaints" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)} className={MENU_LINK}>
            <ComplaintIcon size={14} /> <span className="flex-1">Complaint</span> <span data-hover-icon className="inline-flex"><FaArrowUpRightFromSquare size={12} className="text-muted" aria-hidden="true" /></span>
          </HoverLink>
        </div>

        <div data-menu-item className="empty:hidden">
          <InstallAppButton className={`${MENU_LINK} w-full`} onDone={() => setMenuOpen(false)} />
        </div>

        <div data-menu-item>
          <ThemeToggle className="justify-start" />
        </div>

        <p className="mt-auto pt-4 text-center text-xs text-muted">Powered by Muhammad Abdullah</p>
      </aside>
    </>
  );
}
