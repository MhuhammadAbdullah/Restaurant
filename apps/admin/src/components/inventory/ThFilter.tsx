"use client";

import * as Popover from "@radix-ui/react-popover";
import { FaFilter, FaMagnifyingGlass } from "react-icons/fa6";

export type FilterOption = { value: string; label: string };

/**
 * A table column heading with its own filter: a small funnel opens a box where you type (text filter) or pick a value
 * (list filter). The funnel turns red and shows a dot while the column is filtered; "Clear" removes it.
 */
export function ThFilter({
  label,
  value,
  onChange,
  options,
  placeholder = "Type to filter",
  className = "",
  align = "start",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Give options to filter by picking a value; leave out to filter by typing. */
  options?: FilterOption[];
  placeholder?: string;
  className?: string;
  align?: "start" | "end";
}) {
  const active = value !== "";
  const current = options?.find((o) => o.value === value)?.label;
  return (
    <th className={`px-4 py-3 font-medium ${className}`}>
      <span className="inline-flex items-center gap-1.5">
        {label}
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={`Filter ${label}`}
              title={active ? `${label}: ${current ?? value}` : `Filter ${label}`}
              className={`relative flex h-6 w-6 items-center justify-center rounded-md transition ${active ? "bg-red-50 text-brand-red" : "text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600"}`}
            >
              <FaFilter size={10} />
              {active && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-red ring-2 ring-white" />}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align={align} sideOffset={6} className="z-50 w-56 rounded-xl border border-neutral-200 bg-white p-2.5 text-sm font-normal shadow-lg">
              <p className="px-1 pb-1.5 text-xs font-semibold text-neutral-500">{label}</p>
              {options ? (
                <div className="max-h-60 space-y-0.5 overflow-y-auto">
                  {[{ value: "", label: "All" }, ...options].map((o) => (
                    <Popover.Close asChild key={o.value || "__all"}>
                      <button type="button" onClick={() => onChange(o.value)} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition ${value === o.value ? "bg-brand-red/10 font-medium text-brand-red" : "text-neutral-700 hover:bg-neutral-50"}`}>
                        {o.label}
                        {value === o.value && <span className="text-xs">✓</span>}
                      </button>
                    </Popover.Close>
                  ))}
                </div>
              ) : (
                <div className="relative">
                  <FaMagnifyingGlass size={11} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus className="w-full rounded-lg border border-neutral-300 py-1.5 pl-7 pr-2 text-sm outline-none focus:border-brand-red" />
                </div>
              )}
              {active && (
                <Popover.Close asChild>
                  <button type="button" onClick={() => onChange("")} className="mt-2 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Clear filter</button>
                </Popover.Close>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </span>
    </th>
  );
}

/** A plain heading cell for columns that have no filter, so every table header looks the same. */
export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
}
