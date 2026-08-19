"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api } from "../../../lib/api";
import { SkeletonFavouriteCard } from "../../../components/skeletons";

type Favourite = { productId: string; product: { id: string; name: string; basePrice: number; images: { url: string }[] } };

export default function FavouritesPage() {
  const queryClient = useQueryClient();
  const { data: favourites, isLoading } = useQuery({ queryKey: ["favourites"], queryFn: () => api.get<Favourite[]>("/customers/me/favourites") });

  async function remove(productId: string) {
    await api.delete(`/customers/me/favourites/${productId}`);
    await queryClient.invalidateQueries({ queryKey: ["favourites"] });
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonFavouriteCard key={i} />
        ))}
      </div>
    );
  }

  if (!favourites || favourites.length === 0) return <p className="text-sm text-muted">No favourites yet.</p>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {favourites.map((f) => (
        <div key={f.productId} className="rounded-xl border border-line p-3 text-sm">
          {f.product.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.product.images[0].url} alt={f.product.name} className="h-20 w-full rounded-lg object-cover" />
          )}
          <p className="mt-2 font-medium text-ink">{f.product.name}</p>
          <p className="text-brand-red">{formatPaisa(f.product.basePrice)}</p>
          <button onClick={() => remove(f.productId)} className="mt-1 text-xs text-muted">
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
