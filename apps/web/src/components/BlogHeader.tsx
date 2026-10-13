import Link from "next/link";
import { getSite } from "../lib/seo";
import { SlimHeaderNav } from "./SlimHeaderNav";

/** The slim top bar of the blog pages: logo on the left; Blog, Order Online and share on the right (in a menu drawer on phones). */
export async function BlogHeader() {
  const site = await getSite();
  const link = "pb-1 text-[11px] font-bold uppercase tracking-wider text-muted transition-colors hover:text-brand-red";
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-7">
        <Link href="/" aria-label={site.name} className="flex items-center">
          {site.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.logoUrl} alt={site.name} fetchPriority="high" className="h-11 w-auto max-w-[130px] object-contain sm:h-16 sm:max-w-[160px]" />
          ) : (
            <span className="font-display text-xl text-brand-red">{site.name}</span>
          )}
        </Link>
        <SlimHeaderNav
          title={site.name}
          showShare
          linkClassName={link}
          links={[
            { label: "Blog", href: "/blog", icon: "blog" },
            { label: "Order Online", href: "/", icon: "order" },
          ]}
        />
      </div>
    </header>
  );
}
