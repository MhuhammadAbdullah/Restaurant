import { z } from "zod";
import { idSchema, moneyPaisaSchema } from "./common";

const dealSlotSchema = z.object({
  id: idSchema.optional(),
  label: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).default(1),
  sortOrder: z.number().int().default(0),
  productIds: z.array(idSchema).min(1),
  choiceGroupIds: z.array(idSchema).default([]),
  addonIds: z.array(idSchema).default([]),
});
export type DealSlotInput = z.infer<typeof dealSlotSchema>;

function checkDealDiscount(dealPrice: number | undefined, originalPrice: number | null | undefined, ctx: z.RefinementCtx) {
  if (dealPrice === undefined || originalPrice == null) return;
  if (originalPrice <= dealPrice) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Regular price must be greater than the deal price",
      path: ["originalPrice"],
    });
  }
}

const dealShape = z.object({
  categoryId: idSchema.optional(),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).optional(),
  image: z.string().url().optional(),
  dealPrice: moneyPaisaSchema,
  originalPrice: moneyPaisaSchema.nullable().optional(),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  slots: z.array(dealSlotSchema).min(1),
});

export const createDealSchema = dealShape.superRefine((data, ctx) => checkDealDiscount(data.dealPrice, data.originalPrice, ctx));
export type CreateDealInput = z.infer<typeof dealShape>;

export const updateDealSchema = dealShape
  .partial()
  .extend({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() })
  .superRefine((data, ctx) => checkDealDiscount(data.dealPrice, data.originalPrice, ctx));
export type UpdateDealInput = z.infer<typeof updateDealSchema>;

const dealSlotChoiceSelectionSchema = z.object({
  choiceGroupId: idSchema,
  choiceOptionId: idSchema,
});

const dealSlotAddonSelectionSchema = z.object({
  addonId: idSchema,
  quantity: z.number().int().min(1).default(1),
});

export const dealSlotSelectionSchema = z.object({
  dealSlotId: idSchema,
  productId: idSchema,
  choices: z.array(dealSlotChoiceSelectionSchema).default([]),
  addons: z.array(dealSlotAddonSelectionSchema).default([]),
});
export type DealSlotSelectionInput = z.infer<typeof dealSlotSelectionSchema>;

export const dealPricePreviewSchema = z.object({
  selections: z.array(dealSlotSelectionSchema).min(1),
});
export type DealPricePreviewInput = z.infer<typeof dealPricePreviewSchema>;
