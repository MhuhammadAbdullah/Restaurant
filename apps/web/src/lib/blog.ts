const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export type BlogSummary = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  category: string;
  authorName: string;
  authorImage: string | null;
  publishedAt: string | null;
  readMinutes: number;
};

export type BlogList = { items: BlogSummary[]; total: number; page: number; pageSize: number; pageCount: number };

export type BlogDetail = {
  post: BlogSummary & { content: string; metaTitle: string | null; metaDescription: string | null; updatedAt: string };
  previous: BlogSummary | null;
  next: BlogSummary | null;
  related: BlogSummary[];
};

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export const getBlogList = (page: number) => get<BlogList>(`/blog/posts?page=${page}&pageSize=9`);
export const getBlogPost = (slug: string) => get<BlogDetail>(`/blog/posts/${encodeURIComponent(slug)}`);
export const getBlogSlugs = () => get<{ slug: string; updatedAt: string }[]>("/blog/slugs");

export function blogDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "Author, September 23, 2026" with whichever parts exist. */
export function blogByline(p: Pick<BlogSummary, "authorName" | "publishedAt">): string {
  return [p.authorName, blogDate(p.publishedAt)].filter(Boolean).join(", ");
}

/** Cloudinary serves a lighter WebP/AVIF at the width asked for. Other addresses pass through. (Server-safe copy of optimizeImage.) */
export function blogImage(url: string, width: number): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/") || /\/upload\/[^/]*(f_auto|q_auto)/.test(url)) return url;
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${width}/`);
}

/** Shown beside the author's name when the post has no author picture of its own. */
export const DEFAULT_AUTHOR_IMAGE = "https://res.cloudinary.com/dgkd8jw6a/image/upload/v1791826885/restaurant/dax5fqbqjia0y160pb7w.webp";
