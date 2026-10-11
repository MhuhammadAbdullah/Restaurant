"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaHeart, FaTrashCan } from "react-icons/fa6";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { optimizeImage } from "../../../lib/image";
import { SkeletonFavouriteCard } from "../../../components/skeletons";

type Favourite = { productId: string; product: { id: string; name: string; basePrice: number; images: { url: string }[] } };

export default function FavouritesPage() {
  const queryClient = useQueryClient();
  const { data: favourites, isLoading } = useQuery({ queryKey: ["favourites"], queryFn: () => api.get<Favourite[]>("/customers/me/favourites") });

  async function remove(productId: string) {
    try {
      await api.delete(`/customers/me/favourites/${productId}`);
      await queryClient.invalidateQueries({ queryKey: ["favourites"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove the favourite");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">My Favourites</h1>
      <p className="mt-0.5 text-sm text-muted">Dishes you have saved for quick re-ordering.</p>

      {isLoading && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonFavouriteCard key={i} />
          ))}
        </div>
      )}

      {!isLoading && (!favourites || favourites.length === 0) && (
        <div className="mt-5 flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
            <FaHeart size={22} />
          </span>
          <p className="mt-4 text-base font-semibold text-ink">No favourites yet</p>
          <p className="mt-1 text-sm text-muted">Tap the heart on a dish to save it here.</p>
          <Link href="/" className="mt-5 rounded-xl bg-brand-red px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
            Browse the menu
          </Link>
        </div>
      )}

      {!isLoading && favourites && favourites.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {favourites.map((f) => (
            <div key={f.productId} className="overflow-hidden rounded-2xl border border-line bg-surface">
              {f.product.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={optimizeImage(f.product.images[0].url, 500)} alt={f.product.name} loading="lazy" className="aspect-square w-full object-cover" />
              ) : (
                <div className="aspect-square w-full bg-surface-alt" />
              )}
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-ink">{f.product.name}</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-sm font-bold text-brand-red">{formatPaisa(f.product.basePrice)}</p>
                  <button onClick={() => remove(f.productId)} aria-label={`Remove ${f.product.name} from favourites`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                    <FaTrashCan size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
