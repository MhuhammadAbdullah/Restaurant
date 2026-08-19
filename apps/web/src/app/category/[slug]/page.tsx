"use client";

import { use, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { slugify } from "../../../lib/slug";
import { useLocationStore } from "../../../store/useLocationStore";
import type { Category, Deal, Product } from "../../../lib/types";
import { ProductCard } from "../../../components/ProductCard";
import { ProductModal } from "../../../components/ProductModal";
import { DealCard } from "../../../components/DealCard";
import { DealModal } from "../../../components/DealModal";
import { SectionBanner } from "../../../components/SectionBanner";
import { SkeletonGrid, SkeletonProductCard, SkeletonSectionBanner } from "../../../components/skeletons";

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { branch, isResolved } = useLocationStore();
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["categories", branch?.id],
    queryFn: () => api.public.get<Category[]>(`/catalog/categories${branch?.id ? `?branchId=${branch.id}` : ""}`),
    staleTime: 0,
  });

  const category = useMemo(() => categories?.find((c) => slugify(c.name) === slug), [categories, slug]);
  const isDealsCategory = category?.name.toLowerCase() === "deals";

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["category-products", category?.id, branch?.id],
    queryFn: () => api.public.get<Product[]>(`/catalog/products?branchId=${branch?.id}&categoryId=${category?.id}`),
    enabled: !!branch && !!category && !isDealsCategory,
    placeholderData: keepPreviousData,
  });

  const { data: deals, isLoading: dealsLoading } = useQuery({
    queryKey: ["deals", branch?.id],
    queryFn: () => api.public.get<Deal[]>(`/deals?branchId=${branch?.id}`),
    enabled: !!branch && isDealsCategory,
    placeholderData: keepPreviousData,
  });

  const itemsLoading = isDealsCategory ? dealsLoading : productsLoading;

  async function openProduct(productId: string) {
    const detail = await api.public.get<Product>(`/catalog/products/${productId}`);
    setActiveProduct(detail);
  }

  async function openDeal(dealId: string) {
    const detail = await api.public.get<Deal>(`/deals/${dealId}`);
    setActiveDeal(detail);
  }

  const items = isDealsCategory ? deals : products;

  return (
    <main className="min-h-screen bg-page pb-24">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        {categoriesLoading ? <SkeletonSectionBanner /> : <SectionBanner heading={category?.name ?? ""} image={category?.banner ?? category?.image} />}

        {!isResolved ? (
          <p className="p-10 text-center text-muted">Select your location to see the menu.</p>
        ) : categoriesLoading || itemsLoading ? (
          <SkeletonGrid count={8} render={(i) => <SkeletonProductCard key={i} />} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {isDealsCategory
              ? deals?.map((d) => <DealCard key={d.id} deal={d} onClick={() => openDeal(d.id)} />)
              : products?.map((p) => <ProductCard key={p.id} product={p} onClick={() => openProduct(p.id)} />)}
          </div>
        )}

        {isResolved && !categoriesLoading && !itemsLoading && category && items?.length === 0 && (
          <p className="text-sm text-muted">{isDealsCategory ? "No deals available right now." : "No items available in this category yet."}</p>
        )}
        {isResolved && categories && !category && <p className="text-sm text-muted">Category not found.</p>}
      </div>

      {activeProduct && <ProductModal product={activeProduct} onClose={() => setActiveProduct(null)} />}
      {activeDeal && <DealModal deal={activeDeal} onClose={() => setActiveDeal(null)} />}
    </main>
  );
}
