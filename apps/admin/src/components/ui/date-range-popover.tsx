"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar, type DateRange } from "./calendar";
import { ChevronDownIcon } from "../icons";

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calendar-grid replacement for the old native `<input type="date">` pair — used by every "Custom Range" date filter. */
export function DateRangePopover({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected: DateRange = { from: from ? new Date(`${from}T00:00:00`) : undefined, to: to ? new Date(`${to}T00:00:00`) : undefined };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 transition hover:border-brand-red data-[state=open]:border-brand-red"
        >
          {from && to ? `${from} to ${to}` : "Pick dates"}
          <ChevronDownIcon size={10} className="text-neutral-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 rounded-xl border border-neutral-200 bg-white shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={selected}
            onSelect={(range) => {
              if (!range?.from) return;
              onChange(toDateInput(range.from), toDateInput(range.to ?? range.from));
              if (range.from && range.to) setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
