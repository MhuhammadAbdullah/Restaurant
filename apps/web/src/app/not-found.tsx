import type { Metadata } from "next";
import Link from "next/link";
import { FaBagShopping, FaBuildingColumns, FaCircleQuestion, FaLocationDot, FaNewspaper } from "react-icons/fa6";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

const LINKS = [
  { href: "/", label: "Order online", icon: FaBagShopping },
  { href: "/our-locations", label: "Our locations", icon: FaLocationDot },
  { href: "/bank-discounts", label: "Bank discounts", icon: FaBuildingColumns },
  { href: "/blog", label: "Blog", icon: FaNewspaper },
  { href: "/faqs", label: "FAQs", icon: FaCircleQuestion },
];

/** Shown for any address that does not exist on the site. */
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-page px-4 py-16">
      <div className="w-full max-w-xl text-center">
        <p className="font-display text-[110px] font-bold leading-none text-brand-red sm:text-[150px]" aria-hidden="true">404</p>
        <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">We couldn&apos;t find that page</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted sm:text-base">
          The page may have moved, or the address may have a typo. Your food is still just a few clicks away.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="rounded-full bg-brand-red px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90">Back to the menu</Link>
          <Link href="/our-locations" className="rounded-full border border-line bg-surface px-6 py-3 text-sm font-semibold text-ink transition hover:border-brand-red hover:text-brand-red">Find a branch</Link>
        </div>
        <nav aria-label="Helpful links" className="mt-10 border-t border-line pt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Or try one of these</p>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink transition hover:border-brand-red hover:text-brand-red">
                  <Icon size={13} aria-hidden="true" /> {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
