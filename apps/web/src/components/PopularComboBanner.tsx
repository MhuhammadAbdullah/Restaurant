"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { DEFAULT_POPULAR_COMBO_CONFIG, type PopularComboConfig } from "@restaurant/validation";
import { PopularComboIcon } from "@restaurant/ui";

type PopularComboSettings = Required<PopularComboConfig>;

export function PopularComboBanner({
  options,
  selected,
  onSelect,
}: {
  options: Array<{ name: string; image?: string | null }>;
  selected: boolean;
  onSelect: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<{ popularCombo?: PopularComboSettings }>("/cms/restaurant"),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const config = {
    heading: data?.popularCombo?.heading?.trim() || DEFAULT_POPULAR_COMBO_CONFIG.heading,
    description: data?.popularCombo?.description?.trim() || DEFAULT_POPULAR_COMBO_CONFIG.description,
    title: data?.popularCombo?.title?.trim() || DEFAULT_POPULAR_COMBO_CONFIG.title,
  };
  if (!options.length) return null;
  return (
    <section className="rounded-2xl bg-[#fde6e6] p-3 sm:p-5 dark:bg-[#3b2526]">
      <p className="font-poppins text-[13px] font-bold leading-4 text-slate-900 dark:text-slate-100 sm:text-sm">{config.heading}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-slate-600 dark:text-slate-300 sm:text-xs">{config.description}</p>
      <button type="button" onClick={onSelect} aria-pressed={selected} style={{ scale: "none", transform: "none" }} className={`popular-combo-button mt-2 flex min-h-12 w-full items-start justify-between gap-2 rounded-xl border bg-white px-2.5 py-2.5 text-left transition-colors duration-150 active:scale-100 active:filter-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2 sm:mt-2.5 sm:min-h-14 sm:gap-3 sm:rounded-2xl sm:px-3 sm:py-3.5 dark:bg-surface ${selected ? "border-brand-red" : "border-brand-red/40 hover:border-brand-red"}`}>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-bold leading-4 text-slate-900 dark:text-slate-100 sm:flex-nowrap sm:text-sm">
            <PopularComboIcon className="shrink-0 text-brand-red" /> <span className="min-w-0 whitespace-normal break-words">{config.title}</span>
            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-semibold text-brand-red dark:bg-brand-red/20 dark:text-red-300 sm:text-[10px]">{options.length} {options.length === 1 ? "item" : "items"}</span>
          </span>
          <span className="flex flex-wrap gap-1.5">
            {options.map((option, index) => (
              <span key={`${option.name}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-1 pr-2 text-[10px] leading-4 text-slate-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200 sm:gap-1.5 sm:py-1 sm:pl-1.5 sm:pr-2.5 sm:text-xs">
                {option.image ? <img src={option.image} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover sm:h-6 sm:w-6" /> : null}
                <span className="max-w-[9rem] truncate sm:max-w-[12rem]">{option.name}</span>
              </span>
            ))}
          </span>
        </span>
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-brand-red bg-brand-red text-white" : "border-slate-400 bg-white dark:bg-surface"}`}>
          {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
        </span>
      </button>
    </section>
  );
}
