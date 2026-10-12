"use client";

import { usePathname } from "next/navigation";
import { formatPaisa } from "@restaurant/utils";
import { useCartStore } from "../store/useCartStore";
import { useCartDrawerStore } from "../store/useCartDrawerStore";
import { cartItemLineTotal } from "../lib/types";
import { ArrowRightIcon } from "./icons";
import { useCartAvailability } from "../lib/outOfStock";

export function CartBar() {
  const items = useCartStore((s) => s.items);
  const openCart = useCartDrawerStore((s) => s.open);
  const pathname = usePathname();
  const { reasonFor } = useCartAvailability();
  // Sold-out lines are not counted or charged.
  const orderable = items.filter((i) => !reasonFor(i));
  const count = orderable.reduce((s, i) => s + i.quantity, 0);
  const total = orderable.reduce((s, i) => s + cartItemLineTotal(i), 0);

  if (count === 0 || pathname === "/checkout" || pathname.startsWith("/account") || pathname.startsWith("/complaints") || pathname.startsWith("/blog") || pathname.startsWith("/our-locations") || ["/terms", "/privacy-policy", "/faqs"].includes(pathname)) return null;

  // On the home page (where the floating search button sits to its left) the bar starts to the right of that button on phones.
  return (
    <div className={`fixed inset-x-0 bottom-0 z-40 flex justify-center pb-4 pr-4 sm:px-4 ${pathname === "/" ? "pl-[4.75rem]" : "pl-4"}`}>
      <button
        onClick={openCart}
        className="relative grid h-12 w-full grid-cols-[auto_1fr_auto] items-center gap-2 overflow-hidden rounded-xl bg-brand-red px-3 text-base font-bold text-white shadow-xl sm:max-w-xs sm:px-4"
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full animate-cart-shine bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs">
          {count}
        </span>
        <span className="flex items-center justify-center whitespace-nowrap">View Cart</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-sm sm:text-base">
          {formatPaisa(total)}
          <ArrowRightIcon size={14} className="animate-ride" />
        </span>
      </button>
    </div>
  );
}
