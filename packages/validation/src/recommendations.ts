import { z } from "zod";
import { idSchema } from "./common";

export const createRecommendationSchema = z.object({
  branchId: idSchema.optional(),
  sourceProductId: idSchema.optional(),
  recommendedProductId: idSchema,
  score: z.number().min(0).max(1000).optional(),
});
export type CreateRecommendationInput = z.infer<typeof createRecommendationSchema>;
