"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

/** 1 … 4 5 6 … 20 — always the first, last and the neighbours of the current page. */
function pageNumbers(current: number, last: number): (number | "…")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const sorted = [...new Set([1, last, current - 1, current, current + 1])].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/** Shared list pager: "Showing 1–50 of 91", a per-page picker and page buttons. */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  onPageSize,
  itemLabel,
  sizes = [50, 100, 200],
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  itemLabel: string;
  sizes?: number[];
}) {
  if (total === 0) return null;
  const btn = "rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:border-brand-red hover:text-brand-red disabled:opacity-40";
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
      <div className="flex items-center gap-3">
        <span>
          Showing <span className="font-semibold text-neutral-900">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span> of{" "}
          <span className="font-semibold text-neutral-900">{total}</span> {itemLabel}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {sizes.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className={btn}>Previous</button>
          {pageNumbers(page, pageCount).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1.5 text-neutral-400">…</span>
            ) : (
              <button
                key={n}
                onClick={() => onPage(n)}
                className={`min-w-8 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  n === page ? "border-brand-red bg-brand-red text-white" : "border-neutral-300 hover:border-brand-red hover:text-brand-red"
                }`}
              >
                {n}
              </button>
            ),
          )}
          <button onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount} className={btn}>Next</button>
        </div>
      )}
    </div>
  );
}
