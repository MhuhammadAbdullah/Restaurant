"use client";

import { formatPaisa } from "@restaurant/utils";
import type { Deal } from "../lib/types";
import { PlusIcon } from "./icons";

export function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative z-0 flex flex-col overflow-hidden rounded-2xl border border-brand-red bg-surface text-left transition duration-200 ease-out hover:z-10 hover:shadow-lg"
    >
      <div className="p-1.5">
        {deal.image ? (
          <div className="aspect-square w-full overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={deal.image}
              alt={deal.name}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            />
          </div>
        ) : (
          <div className="aspect-square w-full rounded-2xl bg-surface-alt" />
        )}
      </div>
      <div className="flex w-full flex-1 flex-col px-2.5 pb-2.5 pt-1 sm:px-3 sm:pb-3 sm:pt-1.5">
        <p className="font-poppins text-[12px] font-bold uppercase leading-[15px] text-ink sm:text-[14px] sm:leading-[17px] lg:text-[16px] lg:leading-[19px]">
          {deal.name}
        </p>
        {deal.description && (
          <p className="mt-1 line-clamp-2 font-poppins text-[9px] font-medium leading-[12px] text-muted sm:text-[10px] sm:leading-[14px] lg:text-[11px] lg:leading-[16px]">
            {deal.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <span className="font-poppins text-[12px] font-bold uppercase leading-[14px] text-ink sm:text-[13px] sm:leading-[15px] lg:text-[15px] lg:leading-[16px]">
            From {formatPaisa(deal.dealPrice)}
          </span>
          <span
            aria-label="Add to cart"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-red text-white sm:h-7 sm:w-7 sm:rounded-lg lg:h-8 lg:w-8"
          >
            <PlusIcon size={10} className="sm:hidden" />
            <PlusIcon size={12} className="hidden sm:block lg:hidden" />
            <PlusIcon size={14} className="hidden lg:block" />
          </span>
        </div>
      </div>
    </button>
  );
}
