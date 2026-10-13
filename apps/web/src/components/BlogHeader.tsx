import Link from "next/link";
import { getSite } from "../lib/seo";
import { HoverLink } from "./HoverLink";
import { BlogShareIcon } from "./BlogShare";

/** The slim top bar of the blog pages: logo on the left, Blog / Order Online and a share button on the right. */
export async function BlogHeader() {
  const site = await getSite();
  const link = "pb-1 text-[11px] font-bold uppercase tracking-wider text-muted transition-colors hover:text-brand-red";
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6 sm:py-7">
        <Link href="/" aria-label={site.name} className="flex items-center">
          {site.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.logoUrl} alt={site.name} fetchPriority="high" className="h-12 w-auto max-w-[160px] object-contain sm:h-16" />
          ) : (
            <span className="font-display text-xl text-brand-red">{site.name}</span>
          )}
        </Link>
        <nav className="flex items-center gap-5 sm:gap-7" aria-label="Blog">
          <HoverLink href="/blog" className={link}>Blog</HoverLink>
          <HoverLink href="/" className={link}>Order Online</HoverLink>
          <BlogShareIcon title={site.name} />
        </nav>
      </div>
    </header>
  );
}
