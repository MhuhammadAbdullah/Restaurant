import { z } from "zod";
import { idSchema } from "./common";
import { orderItemInputSchema } from "./orders";

const couponShape = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((v) => v.toUpperCase()),
  description: z.string().trim().max(500).optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  discountValue: z.number().int().min(1),
  maxDiscountAmount: z.number().int().min(1).optional(),
  minOrderValue: z.number().int().min(0).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  usageLimit: z.number().int().min(1).optional(),
  perCustomerLimit: z.number().int().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  productIds: z.array(idSchema).default([]),
  categoryIds: z.array(idSchema).default([]),
});

export const createCouponSchema = couponShape
  .extend({ discountValue: z.number().int().min(1) })
  .refine((v) => v.discountType !== "PERCENTAGE" || v.discountValue <= 100, {
    message: "Percentage discount cannot exceed 100",
    path: ["discountValue"],
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
    message: "Start date must be before end date",
    path: ["endDate"],
  });
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const updateCouponSchema = couponShape.partial().refine(
  (v) => v.discountType !== "PERCENTAGE" || v.discountValue === undefined || v.discountValue <= 100,
  { message: "Percentage discount cannot exceed 100", path: ["discountValue"] },
);
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

export const previewCouponSchema = z.object({
  branchId: idSchema,
  code: z.string().trim().min(1).max(40),
  items: z.array(orderItemInputSchema).min(1),
});
export type PreviewCouponInput = z.infer<typeof previewCouponSchema>;
