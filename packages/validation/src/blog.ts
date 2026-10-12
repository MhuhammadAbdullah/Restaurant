import { z } from "zod";

export const BLOG_STATUSES = ["DRAFT", "PUBLISHED"] as const;

const urlOrEmpty = z.string().trim().url().max(600).or(z.literal(""));

export const createBlogPostSchema = z.object({
  title: z.string().trim().min(1, "Give the post a title").max(200),
  /** Part of the web address. Left empty, it is made from the title. */
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use only lowercase letters, numbers and dashes")
    .optional()
    .or(z.literal("")),
  excerpt: z.string().trim().max(500).default(""),
  coverImage: urlOrEmpty.default(""),
  content: z.string().max(200_000).default(""),
  category: z.string().trim().max(60).default(""),
  authorName: z.string().trim().max(80).default(""),
  authorImage: urlOrEmpty.default(""),
  status: z.enum(BLOG_STATUSES).default("DRAFT"),
  /** When the post goes live. Empty means right away when published. */
  publishedAt: z.string().datetime().nullable().optional(),
  metaTitle: z.string().trim().max(120).default(""),
  metaDescription: z.string().trim().max(300).default(""),
});
export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;

export const updateBlogPostSchema = createBlogPostSchema.partial();
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;
