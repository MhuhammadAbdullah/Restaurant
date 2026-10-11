"use client";

import { SearchInput } from "./SearchFilterBar";
import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { FaCheck } from "react-icons/fa6";
import { PAKISTAN_CITIES } from "../lib/pakistanCities";

const sameCity = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Searchable city dropdown: your branch cities first, then every Pakistani city. Anything else can still be typed in. */
export function CityCombobox({ value, onChange, yourCities = [], required }: { value: string; onChange: (city: string) => void; yourCities?: string[]; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  // One alphabetical list: every Pakistani city plus any extra city already used by a branch.
  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of [...PAKISTAN_CITIES, ...yourCities]) {
      const k = c.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(c.trim());
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [yourCities]);
  const shown = all.filter((c) => !query || c.toLowerCase().includes(query));
  // Names that start with what was typed come first.
  if (query) shown.sort((a, b) => Number(b.toLowerCase().startsWith(query)) - Number(a.toLowerCase().startsWith(query)));
  const exact = all.some((c) => sameCity(c, q));
  const pick = (c: string) => {
    onChange(c);
    setOpen(false);
    setQ("");
  };
  const item = (c: string, active: boolean) => (
    <button key={c} type="button" onClick={() => pick(c)} className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm ${active ? "bg-red-50 font-medium text-brand-red" : "text-neutral-700 hover:bg-neutral-50"}`}>
      {c}
      {active && <FaCheck size={11} />}
    </button>
  );
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <Popover.Trigger asChild>
        <button type="button" className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-left text-sm hover:border-neutral-400 data-[state=open]:border-brand-red">
          <span className={value ? "truncate text-neutral-900" : "text-neutral-400"}>{value || "Select city"}</span>
          <span className="text-[10px] text-neutral-400">▼</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-[15rem] rounded-xl border border-neutral-200 bg-white p-2 shadow-xl">
          <SearchInput autoFocus value={q} onChange={setQ} placeholder="Search city..." widthClass="mb-2 w-full min-w-0" compact />
          <div className="modal-scroll max-h-64 overflow-y-auto">
            {shown.map((c) => item(c, sameCity(value, c)))}
            {q.trim() && !exact && (
              <button type="button" onClick={() => pick(q.trim())} className="mt-1 w-full rounded-md border border-dashed border-brand-red px-2.5 py-1.5 text-left text-sm font-medium text-brand-red hover:bg-red-50">
                Use “{q.trim()}”
              </button>
            )}
            {shown.length === 0 && !q.trim() && <p className="px-2.5 py-3 text-sm text-neutral-400">No cities</p>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
