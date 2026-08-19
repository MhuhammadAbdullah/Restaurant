import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const idSchema = z.string().cuid();

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^03\d{9}$/, "Enter a valid Pakistani mobile number (03XXXXXXXXX)");

export const moneyPaisaSchema = z.number().int().nonnegative();
