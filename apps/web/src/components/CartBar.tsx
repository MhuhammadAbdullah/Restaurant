"use client";

import { usePathname } from "next/navigation";
import { formatPaisa } from "@restaurant/utils";
import { useCartStore } from "../store/useCartStore";
import { useCartDrawerStore } from "../store/useCartDrawerStore";
import { cartItemLineTotal } from "../lib/types";
import { ArrowRightIcon } from "./icons";
import { useCartAvailability } from "../lib/outOfStock";
import { useEffect, useState } from "react";
import { useLocationStore } from "../store/useLocationStore";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FreeDeliveryUnlocked } from "./FreeDeliveryBanner";

/** Separate floating-bar version: the centered glass layout above View Cart. */
function FreeDeliveryProgress({ subtotal }: { subtotal: number }) {
  const { orderType } = useLocationStore();
  const { data } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<{ checkout?: { freeDeliveryMinimum?: number } }>("/cms/restaurant"),
  });
  const minimum = data?.checkout?.freeDeliveryMinimum ?? 0;
  if (orderType !== "DELIVERY" || minimum <= 0) return null;

  const remaining = Math.max(0, minimum * 100 - subtotal);
  const progress = Math.min(100, (subtotal / (minimum * 100)) * 100);
  if (remaining === 0) return <FreeDeliveryUnlocked floating className="pointer-events-auto mb-2 w-full" />;

  return (
    <div className="pointer-events-auto mb-2 w-full rounded-full border border-white/85 bg-white/85 px-3 py-2 text-center text-[11px] text-neutral-700 shadow-[0_8px_24px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-neutral-700/90 dark:bg-neutral-900/90 dark:text-neutral-200 sm:px-5 sm:py-2.5 sm:text-xs">
      <div>
        <>Add items worth <b className="text-neutral-900 dark:text-white">Rs. {Math.ceil(remaining / 100)}</b> to get <b className="text-neutral-900 dark:text-white">FREE Delivery</b></>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700 sm:mt-2 sm:h-2">
        <div className="h-full rounded-full bg-gradient-to-r from-[#00d39a] to-[#009f70] transition-[width] duration-500 ease-in-out motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function CartBar() {
  const [scrollFabsVisible, setScrollFabsVisible] = useState(false);
  const items = useCartStore((s) => s.items);
  const openCart = useCartDrawerStore((s) => s.open);
  const pathname = usePathname();
  const { reasonFor } = useCartAvailability();

  useEffect(() => {
    const sync = (event: Event) => setScrollFabsVisible((event as CustomEvent<boolean>).detail);
    window.addEventListener("restaurant-scroll-fabs", sync);
    return () => window.removeEventListener("restaurant-scroll-fabs", sync);
  }, []);
  // Sold-out lines are not counted or charged.
  const orderable = items.filter((i) => !reasonFor(i));
  const count = orderable.reduce((s, i) => s + i.quantity, 0);
  const total = orderable.reduce((s, i) => s + cartItemLineTotal(i), 0);

  if (count === 0 || pathname === "/checkout" || pathname.startsWith("/account") || pathname.startsWith("/complaints") || pathname.startsWith("/blog") || pathname.startsWith("/bank-discounts") || pathname.startsWith("/our-locations") || ["/terms", "/privacy-policy", "/faqs"].includes(pathname)) return null;

  // On home the search button sits to the left, so the bar starts after it on phones.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-4 sm:px-4">
      <div className="w-full sm:max-w-sm">
        <FreeDeliveryProgress subtotal={total} />
        <button
          onClick={openCart}
          className={`pointer-events-auto relative mx-auto grid h-12 w-full grid-cols-[auto_1fr_auto] items-center gap-2 overflow-hidden rounded-xl bg-brand-red px-3 text-sm font-bold text-white shadow-xl transition-[width,transform] duration-300 ease-out sm:h-14 sm:max-w-sm sm:gap-3 sm:px-5 sm:text-base ${pathname === "/" && scrollFabsVisible ? "max-sm:w-[calc(100%-6.5rem)]" : ""}`}
        >
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full animate-cart-shine bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-red sm:h-9 sm:w-9 sm:text-sm">{count}</span>
          <span className="flex items-center justify-center whitespace-nowrap sm:text-lg">View Cart</span>
          <span className="flex items-center gap-1 whitespace-nowrap text-xs sm:gap-2 sm:text-base">
            {formatPaisa(total)}
            <ArrowRightIcon size={16} className="animate-ride sm:!h-5 sm:!w-5" />
          </span>
        </button>
      </div>
    </div>
  );
}
