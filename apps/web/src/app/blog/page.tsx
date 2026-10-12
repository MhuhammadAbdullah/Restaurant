import type { Metadata } from "next";
import Link from "next/link";
import { FaNewspaper } from "react-icons/fa6";
import { BlogCard } from "../../components/BlogCard";
import { getBlogList } from "../../lib/blog";
import { pageMetadata } from "../../lib/seo";

export const revalidate = 60;

export const generateMetadata = async (): Promise<Metadata> => {
  const base = await pageMetadata("blog", "/blog");
  return { ...base, title: base.title ?? "Blog" };
};

/** Page numbers around the current one: 1 2 3 ... */
function pageNumbers(current: number, count: number): number[] {
  const start = Math.max(1, Math.min(current - 1, count - 2));
  return Array.from({ length: Math.min(3, count) }, (_, i) => start + i);
}

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const list = await getBlogList(Math.max(1, Number(page) || 1));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      {!list || list.items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center sm:py-28">
          <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-brand-red/10">
            <span className="absolute inset-2 rounded-full border-2 border-dashed border-brand-red/30" aria-hidden="true" />
            <FaNewspaper size={38} className="text-brand-red" />
          </span>
          <h1 className="mt-6 text-2xl font-extrabold text-ink">{list ? "Stories are on the way" : "The blog is taking a break"}</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
            {list ? "We are cooking up our first articles. Please check back soon." : "We could not load the blog right now. Please try again in a moment."}
          </p>
          <Link href="/" className="mt-6 rounded-full bg-brand-red px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
            Order online
          </Link>
        </div>
      ) : (
        <>
          <h1 className="sr-only">Blog</h1>
          <div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
            {list.items.map((post) => (
              <BlogCard key={post.id} post={post} />
            ))}
          </div>

          {list.pageCount > 1 && (
            <nav className="mt-14 flex items-center gap-2 text-sm font-semibold" aria-label="Pages">
              {pageNumbers(list.page, list.pageCount).map((n) => (
                <Link
                  key={n}
                  href={n === 1 ? "/blog" : `/blog?page=${n}`}
                  aria-current={n === list.page ? "page" : undefined}
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${n === list.page ? "bg-brand-red text-white" : "text-ink hover:bg-surface-alt"}`}
                >
                  {n}
                </Link>
              ))}
              {list.page < list.pageCount && (
                <Link href={`/blog?page=${list.page + 1}`} className="ml-2 rounded-full border border-line px-5 py-2 text-xs font-bold uppercase tracking-wide text-ink hover:border-brand-red hover:text-brand-red">
                  Next
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
