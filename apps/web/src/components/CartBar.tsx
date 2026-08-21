"use client";

import { usePathname } from "next/navigation";
import { formatPaisa } from "@restaurant/utils";
import { useCartStore } from "../store/useCartStore";
import { useCartDrawerStore } from "../store/useCartDrawerStore";
import { cartItemLineTotal } from "../lib/types";
import { ArrowRightIcon } from "./icons";

export function CartBar() {
  const items = useCartStore((s) => s.items);
  const openCart = useCartDrawerStore((s) => s.open);
  const pathname = usePathname();
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + cartItemLineTotal(i), 0);

  if (count === 0 || pathname === "/checkout" || ["/terms", "/privacy-policy", "/faqs"].includes(pathname)) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <button
        onClick={openCart}
        className="relative grid w-full max-w-xs grid-cols-[auto_1fr_auto] items-center gap-2 overflow-hidden rounded-xl bg-brand-red px-4 py-3 text-base font-bold text-white shadow-xl"
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full animate-cart-shine bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs">
          {count}
        </span>
        <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
          View Cart
          <ArrowRightIcon size={14} className="animate-ride" />
        </span>
        <span className="whitespace-nowrap">{formatPaisa(total)}</span>
      </button>
    </div>
  );
}
