"use client";

import "react-day-picker/style.css";
import { DayPicker, type DateRange } from "react-day-picker";
import { cn } from "../../lib/utils";

export type { DateRange };

const BRAND_STYLE = {
  "--rdp-accent-color": "#ED2320",
  "--rdp-accent-background-color": "#fde8e7",
  "--rdp-today-color": "#ED2320",
  "--rdp-day-height": "36px",
  "--rdp-day-width": "36px",
  "--rdp-day_button-height": "34px",
  "--rdp-day_button-width": "34px",
} as React.CSSProperties;

/** Calendar-grid date picker (react-day-picker) themed to the admin brand red. Full passthrough of
 *  DayPicker's own props (including `mode`) so both range pickers (DateRangePopover) and single-date
 *  pickers (DatePopover) can share this one themed wrapper without fighting DayPicker's
 *  mode-discriminated prop types. */
export function Calendar({ className, ...props }: { className?: string } & React.ComponentProps<typeof DayPicker>) {
  return <DayPicker className={cn("rdp-brand p-3", className)} style={BRAND_STYLE} {...props} />;
}
