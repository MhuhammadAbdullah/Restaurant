"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar } from "./calendar";
import { ChevronDownIcon, CloseIcon } from "../icons";

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calendar-grid replacement for a single, independently-optional `<input type="date">` (e.g. a
 *  coupon/banner's Start Date or End Date, which may be set without the other). For a from/to pair
 *  that should always move together, use DateRangePopover instead. */
export function DatePopover({ value, onChange, placeholder = "Pick a date" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-left text-sm text-neutral-700 transition hover:border-brand-red data-[state=open]:border-brand-red"
        >
          <span className={value ? "" : "text-neutral-400"}>{value || placeholder}</span>
          <span className="flex shrink-0 items-center gap-1">
            {value && (
              <span
                role="button"
                aria-label="Clear date"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="rounded-full p-0.5 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500"
              >
                <CloseIcon size={10} />
              </span>
            )}
            <ChevronDownIcon size={10} className="text-neutral-400" />
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 rounded-xl border border-neutral-200 bg-white shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onChange(date ? toDateInput(date) : "");
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
