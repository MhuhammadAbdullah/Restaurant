"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useLocationStore } from "../store/useLocationStore";
import type { CartItem, Product } from "../lib/types";
import { CartRecommendationCard } from "./CartRecommendationCard";
import { ProductModal } from "./ProductModal";
import { SkeletonCartRecommendationCard } from "./skeletons";
import { FireIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";

const MAX_RECOMMENDATIONS = 4;

/** "Popular with your order" — category-relevant to the cart's contents, never repeating what's already carted. */
export function CartRecommendations({ items }: { items: CartItem[] }) {
  const branch = useLocationStore((s) => s.branch);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const cartProductIds = items.filter((i) => i.kind === "product").map((i) => i.productId);

  const { data: products } = useQuery({
    queryKey: ["cart-recommendations", branch?.id, cartProductIds],
    queryFn: () =>
      api.public.get<Product[]>(
        `/catalog/recommendations?branchId=${branch!.id}&limit=${MAX_RECOMMENDATIONS}${
          cartProductIds.length > 0 ? `&productIds=${cartProductIds.join(",")}` : ""
        }`,
      ),
    enabled: !!branch,
  });

  async function openProduct(id: string) {
    const detail = await api.public.get<Product>(`/catalog/products/${id}`);
    setActiveProduct(detail);
  }

  function scroll(direction: "prev" | "next") {
    scrollRef.current?.scrollBy({ left: direction === "next" ? 140 : -140, behavior: "smooth" });
  }

  const shown = (products ?? []).slice(0, MAX_RECOMMENDATIONS);
  if (products && shown.length === 0) return null;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 border-l-4 border-brand-red pl-2 text-sm font-semibold text-ink">
          <FireIcon size={16} />
          Popular with your order
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => scroll("prev")}
            aria-label="Scroll left"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red/15 text-brand-red transition hover:bg-brand-red/25"
          >
            <ChevronLeftIcon size={12} />
          </button>
          <button
            onClick={() => scroll("next")}
            aria-label="Scroll right"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white transition hover:opacity-90"
          >
            <ChevronRightIcon size={12} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!products
          ? Array.from({ length: MAX_RECOMMENDATIONS }).map((_, i) => <SkeletonCartRecommendationCard key={i} />)
          : shown.map((p) => <CartRecommendationCard key={p.id} product={p} onClick={() => openProduct(p.id)} />)}
      </div>

      {activeProduct && <ProductModal product={activeProduct} onClose={() => setActiveProduct(null)} />}
    </div>
  );
}
