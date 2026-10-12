import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateBlogPostInput, UpdateBlogPostInput } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

const SUMMARY_SELECT = { id: true, title: true, slug: true, excerpt: true, coverImage: true, category: true, authorName: true, authorImage: true, publishedAt: true, content: true } as const;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

/** About 200 words a minute, never less than one minute. */
const readMinutes = (content: string) => Math.max(1, Math.round(content.trim().split(/\s+/).filter(Boolean).length / 200));

/** Plain-text start of the article (its first normal paragraph), used when the author left the summary empty. */
const plainStart = (content: string) => {
  const para = content.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^(#|[-*+] |\d+\. |>)/.test(p)) ?? "";
  return para.replace(/[*_`~]+/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim().slice(0, 220);
};

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  // ------------------------------------------------------------------ public

  private liveWhere(restaurantId: string) {
    const now = new Date();
    return { restaurantId, status: "PUBLISHED", OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] };
  }

  private summary<T extends { content: string; excerpt: string }>(row: T) {
    const { content, ...rest } = row;
    return { ...rest, excerpt: row.excerpt || plainStart(content), readMinutes: readMinutes(content) };
  }

  async listPublic(page: number, pageSize: number) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const size = Math.min(Math.max(Math.floor(pageSize) || 9, 1), 24);
    const current = Math.max(Math.floor(page) || 1, 1);
    const where = this.liveWhere(restaurantId);
    const [total, rows] = await Promise.all([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({ where, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }], skip: (current - 1) * size, take: size, select: SUMMARY_SELECT }),
    ]);
    return { items: rows.map((r) => this.summary(r)), total, page: current, pageSize: size, pageCount: Math.max(1, Math.ceil(total / size)) };
  }

  /** Every live post's address and last change, for the sitemap. */
  async listSlugs() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.blogPost.findMany({ where: this.liveWhere(restaurantId), select: { slug: true, updatedAt: true }, orderBy: { publishedAt: "desc" } });
  }

  async getPublic(slug: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const where = this.liveWhere(restaurantId);
    const post = await this.prisma.blogPost.findFirst({ where: { ...where, slug } });
    if (!post) throw new NotFoundException({ code: "BLOG_POST_NOT_FOUND", message: "Post not found" });
    const when = post.publishedAt ?? post.createdAt;
    const [newer, older, others] = await Promise.all([
      this.prisma.blogPost.findFirst({ where: { ...where, id: { not: post.id }, publishedAt: { gt: when } }, orderBy: { publishedAt: "asc" }, select: SUMMARY_SELECT }),
      this.prisma.blogPost.findFirst({ where: { ...where, id: { not: post.id }, publishedAt: { lt: when } }, orderBy: { publishedAt: "desc" }, select: SUMMARY_SELECT }),
      this.prisma.blogPost.findMany({ where: { ...where, id: { not: post.id } }, orderBy: [{ publishedAt: "desc" }], take: 12, select: SUMMARY_SELECT }),
    ]);
    // Related: the same category first, then the newest others.
    const related = [...others.filter((o) => o.category && o.category === post.category), ...others.filter((o) => !o.category || o.category !== post.category)].slice(0, 3);
    return {
      post: { ...this.summary(post), excerpt: post.excerpt, content: post.content, metaTitle: post.metaTitle, metaDescription: post.metaDescription, updatedAt: post.updatedAt },
      // As on the blog list (newest first): "previous" is the post above this one, "next" the one below it.
      previous: newer ? this.summary(newer) : null,
      next: older ? this.summary(older) : null,
      related: related.map((r) => this.summary(r)),
    };
  }

  // ------------------------------------------------------------------ admin

  async adminList() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.blogPost.findMany({
      where: { restaurantId },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, title: true, slug: true, coverImage: true, category: true, authorName: true, status: true, publishedAt: true, createdAt: true, updatedAt: true },
    });
  }

  async adminGet(id: string) {
    return this.findOwned(id);
  }

  private async findOwned(id: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post || post.restaurantId !== restaurantId) throw new NotFoundException({ code: "BLOG_POST_NOT_FOUND", message: "Post not found" });
    return post;
  }

  /** A free address for the post: the wanted one, or the title's, with -2, -3... added when already taken. */
  private async freeSlug(restaurantId: string, wanted: string, ignoreId?: string) {
    const base = slugify(wanted) || "post";
    for (let n = 1; n < 200; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      const taken = await this.prisma.blogPost.findFirst({ where: { restaurantId, slug: candidate, ...(ignoreId ? { id: { not: ignoreId } } : {}) }, select: { id: true } });
      if (!taken) return candidate;
    }
    throw new BadRequestException({ code: "BLOG_SLUG_TAKEN", message: "Could not find a free web address for this post" });
  }

  private publishedAtFor(input: { status?: string; publishedAt?: string | null }, current?: Date | null): Date | null | undefined {
    if (input.status === "DRAFT") return input.publishedAt ? new Date(input.publishedAt) : (current ?? null);
    if (input.publishedAt) return new Date(input.publishedAt);
    if (input.publishedAt === null) return input.status === "PUBLISHED" ? new Date() : null;
    // Published without a date: it goes live now, unless it already has a date.
    if (input.status === "PUBLISHED") return current ?? new Date();
    return undefined;
  }

  async create(input: CreateBlogPostInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const slug = await this.freeSlug(restaurantId, input.slug || input.title);
    return this.prisma.blogPost.create({
      data: {
        restaurantId,
        title: input.title,
        slug,
        excerpt: input.excerpt,
        coverImage: input.coverImage || null,
        content: input.content,
        category: input.category,
        authorName: input.authorName,
        authorImage: input.authorImage || null,
        status: input.status,
        publishedAt: this.publishedAtFor(input) ?? null,
        metaTitle: input.metaTitle || null,
        metaDescription: input.metaDescription || null,
      },
    });
  }

  async update(id: string, input: UpdateBlogPostInput) {
    const current = await this.findOwned(id);
    const slug = input.slug !== undefined ? await this.freeSlug(current.restaurantId, input.slug || input.title || current.title, id) : undefined;
    const publishedAt = this.publishedAtFor({ status: input.status ?? current.status, publishedAt: input.publishedAt }, current.publishedAt);
    return this.prisma.blogPost.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(input.excerpt !== undefined ? { excerpt: input.excerpt } : {}),
        ...(input.coverImage !== undefined ? { coverImage: input.coverImage || null } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.authorName !== undefined ? { authorName: input.authorName } : {}),
        ...(input.authorImage !== undefined ? { authorImage: input.authorImage || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
        ...(input.metaTitle !== undefined ? { metaTitle: input.metaTitle || null } : {}),
        ...(input.metaDescription !== undefined ? { metaDescription: input.metaDescription || null } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOwned(id);
    await this.prisma.blogPost.delete({ where: { id } });
  }
}
