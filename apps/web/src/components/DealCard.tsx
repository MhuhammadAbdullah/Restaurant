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
      <div className="p-2">
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
      <div className="flex w-full flex-1 flex-col px-4 pb-4 pt-2">
        <p className="font-poppins text-[14px] font-bold uppercase leading-[16px] text-ink sm:text-[16px] sm:leading-[18px] lg:text-[20px] lg:leading-[21px]">
          {deal.name}
        </p>
        {deal.description && (
          <p className="mt-2.5 line-clamp-2 font-poppins text-[10px] font-medium leading-[14px] text-muted sm:text-[11px] sm:leading-[16px] lg:text-[12px] lg:leading-[20px]">
            {deal.description}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between pt-4">
          <span className="font-poppins text-[13px] font-bold uppercase leading-[14px] text-ink sm:text-[15px] sm:leading-[16px] lg:text-[18px] lg:leading-[18px]">
            From {formatPaisa(deal.dealPrice)}
          </span>
          <span
            aria-label="Add to cart"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-red text-white sm:h-9 sm:w-9 sm:rounded-xl lg:h-11 lg:w-11"
          >
            <PlusIcon size={14} className="sm:hidden" />
            <PlusIcon size={18} className="hidden sm:block lg:hidden" />
            <PlusIcon size={22} className="hidden lg:block" />
          </span>
        </div>
      </div>
    </button>
  );
}
