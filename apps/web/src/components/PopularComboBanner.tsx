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
    <section className="rounded-2xl bg-[#fde6e6] p-4 sm:p-5">
      <p className="font-poppins text-sm font-bold text-slate-900">{config.heading}</p>
      <p className="mt-0.5 text-xs text-slate-500">{config.description}</p>
      <button type="button" onClick={onSelect} aria-pressed={selected} style={{ scale: "none", transform: "none" }} className={`popular-combo-button mt-2.5 flex min-h-14 w-full items-start justify-between gap-3 rounded-2xl border bg-white px-3 py-3.5 text-left transition-colors duration-150 active:scale-100 active:filter-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2 ${selected ? "border-brand-red" : "border-brand-red/40 hover:border-brand-red"}`}>
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-slate-900">
            <PopularComboIcon className="text-brand-red" /> <span className="min-w-0 truncate">{config.title}</span>
            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-brand-red">{options.length} {options.length === 1 ? "item" : "items"}</span>
          </span>
          <span className="flex flex-wrap gap-1.5">
            {options.map((option, index) => (
              <span key={`${option.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1.5 pr-2.5 text-xs text-slate-700">
                {option.image ? <img src={option.image} alt="" className="h-6 w-6 rounded-full object-cover" /> : null}
                <span className="max-w-[12rem] truncate">{option.name}</span>
              </span>
            ))}
          </span>
        </span>
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-brand-red bg-brand-red text-white" : "border-slate-400 bg-white"}`}>
          {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
        </span>
      </button>
    </section>
  );
}
