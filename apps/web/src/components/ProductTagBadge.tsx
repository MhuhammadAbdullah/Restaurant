import type { Product } from "../lib/types";

const TAG_LABELS: Record<NonNullable<Product["tag"]>, string> = {
  HOUSE_FAVORITE: "House Favorite",
  NEW_ARRIVAL: "New Arrival",
  BEST_SELLER: "Bestseller",
};

/**
 * Promotional badge the admin can pin on a product card (see Product.tag).
 * Positioned absolutely inside the card, using the compact pill style from the storefront reference.
 */
export function ProductTagBadge({ tag, className = "" }: { tag?: Product["tag"]; className?: string }) {
  if (!tag) return null;

  return (
    <span
      className={`pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#e3b900] bg-[#ffcc00] px-3 py-1 font-poppins text-[11px] font-bold leading-none text-black shadow-sm sm:top-2.5 sm:px-3.5 sm:py-1.5 sm:text-xs ${className}`}
    >
      {TAG_LABELS[tag]}
    </span>
  );
}
