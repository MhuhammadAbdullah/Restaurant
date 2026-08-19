"use client";

import { SearchIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-[220px] flex-1 ${className}`}>
      <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-9 text-sm shadow-sm outline-none transition focus:border-brand-red focus:ring-4 focus:ring-brand-red/10"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500"
        >
          <CloseIcon size={12} />
        </button>
      )}
    </div>
  );
}

const FILTER_SELECT_UNSET = "__unset__";

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const active = value !== "";
  return (
    <Select value={value === "" ? FILTER_SELECT_UNSET : value} onValueChange={(v) => onChange(v === FILTER_SELECT_UNSET ? "" : v)}>
      <SelectTrigger
        className={`rounded-xl py-2.5 pl-3.5 shadow-sm ${active ? "border-brand-red bg-red-50 font-medium text-brand-red" : "border-neutral-200 bg-white text-neutral-700"}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={FILTER_SELECT_UNSET}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2.5">{children}</div>;
}

export function ClearFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-medium text-neutral-400 underline hover:text-brand-red">
      Clear filters
    </button>
  );
}

export function ResultsSummary({ count, total, itemLabel }: { count: number; total: number; itemLabel: string }) {
  const plural = (n: number) => `${itemLabel}${n === 1 ? "" : "s"}`;
  if (count === total) return <p className="text-xs text-neutral-400">{total} {plural(total)}</p>;
  return (
    <p className="text-xs text-neutral-400">
      Showing {count} of {total} {plural(total)}
    </p>
  );
}

export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  const pages: (number | "ellipsis")[] = [];
  const addRange = (from: number, to: number) => {
    for (let i = from; i <= to; i++) pages.push(i);
  };
  if (totalPages <= 7) {
    addRange(1, totalPages);
  } else if (page <= 4) {
    addRange(1, 5);
    pages.push("ellipsis", totalPages);
  } else if (page >= totalPages - 3) {
    pages.push(1, "ellipsis");
    addRange(totalPages - 4, totalPages);
  } else {
    pages.push(1, "ellipsis");
    addRange(page - 1, page + 1);
    pages.push("ellipsis", totalPages);
  }

  const btnBase = "flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm transition";

  return (
    <div className="mt-5 flex items-center justify-center gap-1.5">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className={`${btnBase} border-neutral-200 text-neutral-500 hover:border-brand-red hover:text-brand-red disabled:pointer-events-none disabled:opacity-40`}
      >
        <ChevronLeftIcon size={15} />
      </button>
      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e${i}`} className="px-1 text-sm text-neutral-300">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`${btnBase} ${p === page ? "border-brand-red bg-brand-red text-white" : "border-neutral-200 text-neutral-600 hover:border-brand-red hover:text-brand-red"}`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next page"
        className={`${btnBase} border-neutral-200 text-neutral-500 hover:border-brand-red hover:text-brand-red disabled:pointer-events-none disabled:opacity-40`}
      >
        <ChevronRightIcon size={15} />
      </button>
    </div>
  );
}
