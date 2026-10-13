import Link from "next/link";
import { getSite } from "../lib/seo";
import { SlimHeaderNav } from "./SlimHeaderNav";

/** Slim top bar of the Bank Discounts page: logo on the left; Bank Discounts, Order Online and Locations on the right (in a menu drawer on phones). */
export async function BankDiscountsHeader({ heading }: { heading: string }) {
  const site = await getSite();
  const link = "pb-1 text-sm font-semibold text-ink transition-colors hover:text-brand-red";
  return (
    <header className="bg-surface shadow-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-7">
        <Link href="/" aria-label={site.name} className="flex items-center">
          {site.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.logoUrl} alt={site.name} fetchPriority="high" className="h-11 w-auto max-w-[140px] object-contain sm:h-16 sm:max-w-[160px]" />
          ) : (
            <span className="font-display text-xl text-brand-red">{site.name}</span>
          )}
        </Link>
        <SlimHeaderNav
          title={site.name}
          linkClassName={link}
          links={[
            { label: heading, href: "/bank-discounts", active: true, icon: "bank" },
            { label: "Order Online", href: "/", icon: "order" },
            { label: "Locations", href: "/our-locations", icon: "locations" },
          ]}
        />
      </div>
    </header>
  );
}
