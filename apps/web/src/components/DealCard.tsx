"use client";

import { formatPaisa } from "@restaurant/utils";
import type { Deal } from "../lib/types";
import { PlusIcon } from "./icons";

export function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative z-0 flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-left shadow-sm transition duration-200 ease-out hover:z-10 hover:shadow-lg"
    >
      <div className="p-2">
        {deal.image ? (
          <div className="aspect-square w-full overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={deal.image}
              alt={deal.name}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            />
          </div>
        ) : (
          <div className="aspect-square w-full rounded-lg bg-surface-alt" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="font-poppins text-[14px] font-bold leading-[16px] text-ink sm:text-[16px] sm:leading-[18px] lg:text-[20px] lg:leading-[21px]">
          {deal.name}
        </p>
        {deal.description && (
          <p className="mt-1 line-clamp-2 font-poppins text-[10px] font-medium leading-[14px] text-muted sm:text-[11px] sm:leading-[16px] lg:text-[12px] lg:leading-[20px]">
            {deal.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-poppins text-[13px] font-bold leading-[14px] text-brand-red sm:text-[15px] sm:leading-[16px] lg:text-[18px] lg:leading-[18px]">
            From {formatPaisa(deal.dealPrice)}
          </span>
          <span
            aria-label="Add to cart"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-red text-white sm:hidden"
          >
            <PlusIcon size={16} />
          </span>
          <span className="hidden rounded-lg bg-brand-red px-4 py-1.5 font-poppins text-[12px] font-semibold leading-[13px] text-white sm:block lg:text-[14px] lg:leading-[14px]">
            ADD
          </span>
        </div>
      </div>
    </button>
  );
}
