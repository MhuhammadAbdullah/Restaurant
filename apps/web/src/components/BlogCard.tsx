import Link from "next/link";
import { FaRegClock } from "react-icons/fa6";
import { blogByline, blogImage, type BlogSummary } from "../lib/blog";

/** One article in the blog list and under "Related posts". */
export function BlogCard({ post, compact }: { post: BlogSummary; compact?: boolean }) {
  return (
    <article className="group flex flex-col border-b border-line pb-6">
      <Link href={`/blog/${post.slug}`} className="block overflow-hidden rounded-lg bg-surface-alt" aria-label={post.title}>
        {post.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={blogImage(post.coverImage, 800)}
            alt=""
            loading="lazy"
            className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex aspect-[16/10] w-full items-center justify-center text-sm text-muted">No image</span>
        )}
      </Link>
      {post.category && <p className="mt-5 font-montserrat text-xs font-bold uppercase leading-[19px] tracking-[0.18em] text-brand-red">{post.category}</p>}
      <h2 className={`mt-2 font-extrabold leading-tight text-ink ${compact ? "text-lg" : "text-2xl"}`}>
        <Link href={`/blog/${post.slug}`} className="hover:text-brand-red">{post.title}</Link>
      </h2>
      {!compact && post.excerpt && <p className="mt-3 line-clamp-6 text-sm leading-7 text-muted">{post.excerpt}</p>}
      <p className="mt-4 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span>{blogByline(post)}</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1">
          <FaRegClock size={11} /> {post.readMinutes} min read
        </span>
      </p>
    </article>
  );
}
