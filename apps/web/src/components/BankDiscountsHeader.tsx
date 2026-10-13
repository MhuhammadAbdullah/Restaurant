import Link from "next/link";
import { getSite } from "../lib/seo";
import { HoverLink } from "./HoverLink";

/** Slim top bar of the Bank Discounts page: logo on the left, Bank Discounts / Order Online / Locations on the right. */
export async function BankDiscountsHeader({ heading }: { heading: string }) {
  const site = await getSite();
  const link = "pb-1 text-sm font-semibold text-ink transition-colors hover:text-brand-red";
  return (
    <header className="bg-surface shadow-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6 sm:py-7">
        <Link href="/" aria-label={site.name} className="flex items-center">
          {site.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.logoUrl} alt={site.name} fetchPriority="high" className="h-12 w-auto max-w-[160px] object-contain sm:h-16" />
          ) : (
            <span className="font-display text-xl text-brand-red">{site.name}</span>
          )}
        </Link>
        <nav className="flex items-center gap-4 sm:gap-8" aria-label="Bank discounts">
          <HoverLink href="/bank-discounts" active className={`${link} !text-brand-red`}>{heading}</HoverLink>
          <HoverLink href="/" className={link}>Order Online</HoverLink>
          <HoverLink href="/our-locations" className={link}>Locations</HoverLink>
        </nav>
      </div>
    </header>
  );
}
