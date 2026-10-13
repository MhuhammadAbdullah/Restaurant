import { z } from "zod";

/** The kitchen's preparation notes for a product. Instructions only: nothing here touches inventory. */
export const recipeGuideSchema = z.object({
  prepMinutes: z.number().int().min(0).max(1440).nullable().default(null),
  servings: z.string().trim().max(60).default(""),
  ingredients: z.string().max(4000).default(""),
  steps: z.string().max(8000).default(""),
  notes: z.string().max(2000).default(""),
});
export type RecipeGuideInput = z.infer<typeof recipeGuideSchema>;

/** One line per entry; blank lines and leading numbers or bullets are dropped, so pasted lists read cleanly. */
export function guideLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}
