"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaBagShopping, FaBars, FaBuildingColumns, FaLocationDot, FaNewspaper, FaShareNodes, FaXmark } from "react-icons/fa6";
import { HoverLink } from "./HoverLink";
import { BlogShareIcon } from "./BlogShare";

/** Icons are chosen by name because a server component cannot hand a component to this client one. */
const ICONS = { blog: FaNewspaper, order: FaBagShopping, bank: FaBuildingColumns, locations: FaLocationDot } as const;
export type SlimLink = { label: string; href: string; active?: boolean; icon?: keyof typeof ICONS };

/**
 * The right-hand side of the slim page headers (Blog, Bank Discounts). On a computer the links sit in the bar; on a phone
 * they move into a menu drawer opened with the menu button, so the bar never gets crowded.
 */
export function SlimHeaderNav({ links, title, showShare, linkClassName }: { links: SlimLink[]; title: string; showShare?: boolean; linkClassName: string }) {
  const [open, setOpen] = useState(false);

  // Escape closes the drawer, and the page behind does not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      // the share sheet was closed or the clipboard is blocked: nothing to do
    }
  }

  return (
    <>
      {/* Computer: links in the bar */}
      <nav className="hidden items-center gap-7 sm:flex lg:gap-8" aria-label="Page links">
        {links.map((l) => (
          <HoverLink key={l.href} href={l.href} active={l.active} className={`${linkClassName} ${l.active ? "!text-brand-red" : ""}`}>
            {l.label}
          </HoverLink>
        ))}
        {showShare && <BlogShareIcon title={title} />}
      </nav>

      {/* Phone: a menu button */}
      <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-red/10 text-brand-red transition hover:bg-brand-red/20 sm:hidden">
        <FaBars size={17} />
      </button>

      <div className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 sm:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-72 max-w-[85vw] flex-col bg-surface p-5 text-ink shadow-2xl transition-transform duration-300 ease-in-out sm:hidden ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <p className="truncate font-poppins text-lg font-semibold text-brand-black">{title}</p>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface-alt">
            <FaXmark size={20} />
          </button>
        </div>

        <nav className="mt-5 flex flex-col gap-2" aria-label="Page links">
          {links.map((l) => {
            const Icon = l.icon ? ICONS[l.icon] : null;
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
                className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-sm font-medium transition ${l.active ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-line text-ink hover:border-brand-red hover:text-brand-red"}`}
              >
                {Icon && <Icon size={15} className="shrink-0" aria-hidden="true" />}
                <span className="flex-1">{l.label}</span>
                {l.active && <span className="h-2 w-2 rounded-full bg-brand-red" aria-hidden="true" />}
              </Link>
            );
          })}
          {showShare && (
            <button type="button" onClick={() => void share()} tabIndex={open ? 0 : -1} className="flex items-center gap-3 rounded-lg border border-line px-3 py-3 text-left text-sm font-medium text-ink transition hover:border-brand-red hover:text-brand-red">
              <FaShareNodes size={15} className="shrink-0" aria-hidden="true" />
              <span className="flex-1">Share this page</span>
            </button>
          )}
        </nav>
      </aside>
    </>
  );
}
