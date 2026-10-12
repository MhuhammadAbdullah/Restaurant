import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FaArrowLeft, FaArrowRight, FaRegClock } from "react-icons/fa6";
import { BlogRelated } from "../../../components/BlogRelated";
import { BlogShare } from "../../../components/BlogShare";
import { MarkdownContent } from "../../../components/MarkdownContent";
import { DEFAULT_AUTHOR_IMAGE, blogByline, blogImage, getBlogPost, type BlogSummary } from "../../../lib/blog";
import { getSite } from "../../../lib/seo";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [detail, site] = await Promise.all([getBlogPost(slug), getSite()]);
  if (!detail) return { title: "Post not found" };
  const p = detail.post;
  const title = p.metaTitle || p.title;
  const description = p.metaDescription || p.excerpt;
  const image = p.coverImage ?? site.seo.defaultImage;
  return {
    title,
    description,
    openGraph: { type: "article", title, description, images: image ? [image] : undefined, publishedTime: p.publishedAt ?? undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

/**
 * Previous / next card. When there is no post in that direction (the first or last post), the card shows the current
 * post and its arrow does nothing, so the pair always looks complete.
 */
function NeighbourCard({ post, direction, disabled }: { post: BlogSummary; direction: "previous" | "next"; disabled?: boolean }) {
  const inner = (
    <>
      {post.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={blogImage(post.coverImage, 700)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      )}
      <span className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-black/10" aria-hidden="true" />
      <span className={`relative flex w-full items-center gap-4 ${direction === "next" ? "flex-row-reverse" : ""}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/60 ${disabled ? "opacity-50" : ""}`}>
          {direction === "previous" ? <FaArrowLeft size={13} /> : <FaArrowRight size={13} />}
        </span>
        <span className="min-w-0 flex-1">
          {post.category && <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-brand-red">{post.category}</span>}
          <span className="mt-1 block text-sm font-semibold leading-snug">{post.title}</span>
        </span>
      </span>
    </>
  );
  const box = "group relative flex min-h-[110px] items-center overflow-hidden rounded-xl bg-neutral-900 p-5 text-white";
  if (disabled) {
    return (
      <div className={`${box} cursor-default`} aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <Link href={`/blog/${post.slug}`} className={box} aria-label={direction === "previous" ? "Previous post" : "Next post"}>
      {inner}
    </Link>
  );
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await getBlogPost(slug);
  if (!detail) notFound();
  const { post, previous, next, related } = detail;

  return (
    <main className="pb-20">
      {/* Hero: the cover picture with the title written over it */}
      <header className="relative isolate flex min-h-[300px] items-end overflow-hidden bg-neutral-900 sm:min-h-[400px] lg:min-h-[560px]">
        {post.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={blogImage(post.coverImage, 2000)} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        )}
        <span className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/30 to-black/10" aria-hidden="true" />
        <div className="w-full px-4 pb-8 pt-20 text-white sm:px-8 sm:pb-12 lg:pb-16">
          <div className="md:ml-[12%] lg:ml-[28%] lg:max-w-[760px]">
          {post.category && <p className="font-montserrat text-xs font-bold uppercase leading-[19px] tracking-[0.2em] text-brand-red">{post.category}</p>}
          <h1 className="mt-3 font-montserrat text-3xl font-bold leading-[1.15] sm:text-4xl lg:text-[48px] lg:leading-[48px]">{post.title}</h1>
          <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/85">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={blogImage(post.authorImage || DEFAULT_AUTHOR_IMAGE, 96)} alt="" className="h-8 w-8 rounded-md bg-white/25 object-cover" />
            <span>{blogByline(post)}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <FaRegClock size={11} /> {post.readMinutes} min read
            </span>
          </p>
          </div>
        </div>
      </header>

      {/* Article */}
      <div className="mx-auto mt-8 grid w-full max-w-5xl gap-6 px-4 sm:px-6 lg:grid-cols-[48px_minmax(0,1fr)]">
        <div className="lg:pt-1">
          <BlogShare title={post.title} />
        </div>
        <article className="min-w-0">
          {post.excerpt && <p className="text-[15px] leading-7 text-muted">{post.excerpt}</p>}
          <MarkdownContent content={post.content} variant="blog" />
        </article>
      </div>

      <div className="mx-auto mt-14 grid w-full max-w-5xl gap-4 px-4 sm:grid-cols-2 sm:px-6">
        <NeighbourCard post={previous ?? post} direction="previous" disabled={!previous} />
        <NeighbourCard post={next ?? post} direction="next" disabled={!next} />
      </div>

      {related.length > 0 && <BlogRelated posts={related} />}
    </main>
  );
}
