"use client";

import { SearchIcon, ArrowUpIcon } from "./icons";
import { useCartStore } from "../store/useCartStore";

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
  const count = items.reduce((s, i) => s + i.quantity, 0);

  if (!visible) return null;

  return (
    <>
      <button
        onClick={onSearchClick}
        aria-label="Scroll to search"
        // On phones the search button sits on the same row as the "View Cart" bar, to its left.
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-red text-white shadow-lg transition hover:opacity-90 sm:bottom-24 sm:left-6 sm:h-11 sm:w-11"
      >
        <SearchIcon size={18} />
      </button>
      <button
        onClick={onTopClick}
        aria-label="Scroll to top"
        // On phones it rides just above the "View Cart" bar when the cart has items, otherwise at the bottom edge.
        className={`fixed right-4 z-40 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red text-white shadow-lg transition hover:opacity-90 sm:bottom-24 sm:right-6 ${count > 0 ? "bottom-[4.75rem]" : "bottom-4"}`}
      >
        <ArrowUpIcon size={18} />
      </button>
    </>
  );
}
