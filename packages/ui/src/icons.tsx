// Header icons (location/contact/complaint/cart/hamburger) used to be
// admin-selectable from a registry here (HEADER_ICON_KEYS / HeaderIcon / IconPicker), but they
// are now fixed, professionally-coded icons (react-icons) directly in each app — see
// apps/web/src/components/Header.tsx and apps/web/src/components/ContactPopover.tsx.
import type { SVGProps } from "react";

/** Lucide Sparkles mark used by the Popular Combo quick-selection UI. */
export function PopularComboIcon({ className = "", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <span className={`relative flex h-4 w-4 shrink-0 items-center justify-center ${className}`} aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" focusable="false" {...props}>
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
        <path d="M4 17v2" />
        <path d="M5 18H3" />
      </svg>
      <span className="absolute -right-0.5 -top-0.5 h-1 w-1 rounded-full bg-current/70" />
    </span>
  );
}
