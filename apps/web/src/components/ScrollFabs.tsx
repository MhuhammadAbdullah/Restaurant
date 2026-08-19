"use client";

import { SearchIcon, ArrowUpIcon } from "./icons";
import { useCartStore } from "../store/useCartStore";
import { useCartDrawerStore } from "../store/useCartDrawerStore";

// Same cart glyph as the header's cart button — keeps "this opens the cart" recognizable
// wherever it appears on the page.
const CART_ICON_URL =
  "https://res.cloudinary.com/dgkd8jw6a/image/upload/v1786624174/Gemini_Generated_Image_lrzw3wlrzw3wlrzw-removebg-preview_sdff6k.png";

export function ScrollFabs({
  visible,
  onSearchClick,
  onTopClick,
}: {
  visible: boolean;
  onSearchClick: () => void;
  onTopClick: () => void;
}) {
  const items = useCartStore((s) => s.items);
  const openCart = useCartDrawerStore((s) => s.open);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  if (!visible) return null;

  return (
    <>
      <button
        onClick={onSearchClick}
        aria-label="Scroll to search"
        className="fixed bottom-24 left-6 z-40 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red text-white shadow-lg transition hover:opacity-90"
      >
        <SearchIcon size={18} />
      </button>
      <button
        onClick={openCart}
        aria-label="Open cart"
        className="fixed bottom-[9.5rem] right-6 z-40 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red text-white shadow-lg transition hover:opacity-90"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={CART_ICON_URL} alt="" className="h-6 w-6 object-contain" />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-brand-red bg-white text-[10px] font-semibold text-brand-red">
            {count}
          </span>
        )}
      </button>
      <button
        onClick={onTopClick}
        aria-label="Scroll to top"
        className="fixed bottom-24 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red text-white shadow-lg transition hover:opacity-90"
      >
        <ArrowUpIcon size={18} />
      </button>
    </>
  );
}
