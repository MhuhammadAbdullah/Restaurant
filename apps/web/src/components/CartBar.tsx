"use client";

import { usePathname } from "next/navigation";
import { formatPaisa } from "@restaurant/utils";
import { useCartStore } from "../store/useCartStore";
import { useCartDrawerStore } from "../store/useCartDrawerStore";
import { cartItemLineTotal } from "../lib/types";

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
        className="grid w-full max-w-md grid-cols-3 items-center rounded-full bg-brand-red px-3 py-3 text-sm font-semibold text-white shadow-xl"
      >
        <span className="flex h-7 w-7 items-center justify-center justify-self-start rounded-full border-2 border-white text-xs">
          {count}
        </span>
        <span className="text-center">View Cart</span>
        <span className="justify-self-end">{formatPaisa(total)}</span>
      </button>
    </div>
  );
}
