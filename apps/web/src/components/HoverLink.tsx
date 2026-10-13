"use client";

import Link from "next/link";
import { hoverIn, hoverOut } from "../lib/hoverAnimation";

/**
 * A link with the GSAP hover underline: a line fills from left to right on hover. `active` keeps it filled
 * (the current page). Anything inside marked `data-hover-icon` also nudges on hover.
 */
export function HoverLink({
  href,
  className = "",
  lineClassName = "bg-brand-red",
  active,
  target,
  rel,
  onClick,
  children,
}: {
  href: string;
  className?: string;
  lineClassName?: string;
  active?: boolean;
  target?: string;
  rel?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      onClick={onClick}
      className={`relative ${className}`}
      onMouseEnter={(e) => hoverIn(e.currentTarget)}
      onMouseLeave={(e) => hoverOut(e.currentTarget, active)}
      onFocus={(e) => hoverIn(e.currentTarget)}
      onBlur={(e) => hoverOut(e.currentTarget, active)}
    >
      {children}
      <span data-hover-line aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left ${lineClassName}`} style={{ transform: `scaleX(${active ? 1 : 0})` }} />
    </Link>
  );
}
