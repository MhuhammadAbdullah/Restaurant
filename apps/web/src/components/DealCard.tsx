"use client";

import { formatPaisa } from "@restaurant/utils";
import type { Deal } from "../lib/types";

export function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative z-0 flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-left shadow-sm transition duration-200 ease-out hover:z-10 hover:scale-[1.03] hover:shadow-lg"
    >
      <div className="p-2">
        {deal.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deal.image} alt={deal.name} className="aspect-square w-full rounded-lg object-cover" />
        ) : (
          <div className="aspect-square w-full rounded-lg bg-surface-alt" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-base font-medium text-ink">{deal.name}</p>
        {deal.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{deal.description}</p>}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-base font-semibold text-brand-red">From {formatPaisa(deal.dealPrice)}</span>
          <span className="rounded-lg bg-brand-red px-4 py-1.5 text-sm font-semibold text-white">ADD</span>
        </div>
      </div>
    </button>
  );
}
