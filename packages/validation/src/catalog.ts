import { z } from "zod";
import { idSchema, moneyPaisaSchema } from "./common";

export const setBranchAvailabilitySchema = z.object({
  branchId: idSchema,
  isAvailable: z.boolean(),
});
export type SetBranchAvailabilityInput = z.infer<typeof setBranchAvailabilitySchema>;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categoryShape = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  image: z.string().url().optional(),
  banner: z.string().url().optional(),
  sortOrder: z.number().int().default(0),
  mainPageLimit: z.number().int().min(0).nullable().optional(),
});

export const createCategorySchema = categoryShape;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = categoryShape.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categoriesReorderSchema = z.object({ orderedIds: z.array(idSchema).min(1) });
export type CategoriesReorderInput = z.infer<typeof categoriesReorderSchema>;

export const setMainPageProductsSchema = z.object({ productIds: z.array(idSchema) });
export type SetMainPageProductsInput = z.infer<typeof setMainPageProductsSchema>;

// ---------------------------------------------------------------------------
// Choice Sections
// ---------------------------------------------------------------------------

const choiceOptionShape = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(120),
  image: z.string().url().optional(),
  priceAdjustment: moneyPaisaSchema.default(0),
  discountPriceAdjustment: moneyPaisaSchema.nullable().optional(),
  sortOrder: z.number().int().default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});
export type ChoiceOptionInput = z.infer<typeof choiceOptionShape>;

function checkOptionDiscounts(
  options: { name: string; priceAdjustment?: number; discountPriceAdjustment?: number | null }[] | undefined,
  ctx: z.RefinementCtx,
) {
  options?.forEach((opt, i) => {
    if (opt.discountPriceAdjustment == null) return;
    const regular = opt.priceAdjustment ?? 0;
    if (opt.discountPriceAdjustment <= 0 || opt.discountPriceAdjustment >= regular) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Discount additional price for "${opt.name}" must be greater than 0 and less than the regular additional price`,
        path: ["options", i, "discountPriceAdjustment"],
      });
    }
  });
}

const choiceGroupShape = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  isRequired: z.boolean().default(true),
  selectionType: z.enum(["SINGLE", "MULTIPLE"]).default("SINGLE"),
  minSelect: z.number().int().min(0).default(1),
  maxSelect: z.number().int().min(1).default(1),
  sortOrder: z.number().int().default(0),
  options: z.array(choiceOptionShape).min(1),
});

export const createChoiceGroupSchema = choiceGroupShape.superRefine((data, ctx) => checkOptionDiscounts(data.options, ctx));
export type CreateChoiceGroupInput = z.infer<typeof choiceGroupShape>;

export const updateChoiceGroupSchema = choiceGroupShape
  .partial()
  .extend({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() })
  .superRefine((data, ctx) => checkOptionDiscounts(data.options, ctx));
export type UpdateChoiceGroupInput = z.infer<typeof updateChoiceGroupSchema>;

export const choiceGroupsReorderSchema = z.object({ orderedIds: z.array(idSchema).min(1) });
export type ChoiceGroupsReorderInput = z.infer<typeof choiceGroupsReorderSchema>;

// ---------------------------------------------------------------------------
// Addon Groups — a thin organizational label only (no selection behavior).
// Add-ons are managed as individual product-based entities via /catalog/addons
// (see createAddonSchema below) — a group is just a name admins attach them under.
// ---------------------------------------------------------------------------

export const createAddonGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isRequired: z.boolean().default(false),
  selectionType: z.enum(["SINGLE", "MULTIPLE"]).default("MULTIPLE"),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(5),
});
export type CreateAddonGroupInput = z.infer<typeof createAddonGroupSchema>;

export const updateAddonGroupSchema = createAddonGroupSchema.partial();
export type UpdateAddonGroupInput = z.infer<typeof updateAddonGroupSchema>;

// ---------------------------------------------------------------------------
// Add-ons — individual CRUD (the module admins actually manage day-to-day).
// Every add-on is an existing catalog Product presented inside an Addon Group —
// `name` is that group's custom display name for the product (never renames the
// product itself), and price/discountPrice are independent of the product's own
// basePrice/discountPrice.
// ---------------------------------------------------------------------------

function checkAddonDiscount(price: number | undefined, discountPrice: number | null | undefined, ctx: z.RefinementCtx) {
  if (price === undefined || discountPrice == null) return;
  if (discountPrice <= 0 || discountPrice >= price) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Discount price must be greater than 0 and less than the regular price",
      path: ["discountPrice"],
    });
  }
}

const addonShape = z.object({
  addonGroupId: idSchema,
  productId: idSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  price: moneyPaisaSchema.default(0),
  discountPrice: moneyPaisaSchema.nullable().optional(),
  image: z.string().url().optional(),
  maxQuantity: z.number().int().min(1).default(1),
  sortOrder: z.number().int().default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const createAddonSchema = addonShape.superRefine((data, ctx) => checkAddonDiscount(data.price, data.discountPrice, ctx));
export type CreateAddonInput = z.infer<typeof addonShape>;

export const updateAddonSchema = addonShape
  .partial()
  .superRefine((data, ctx) => checkAddonDiscount(data.price, data.discountPrice, ctx));
export type UpdateAddonInput = z.infer<typeof updateAddonSchema>;

export const addonsReorderSchema = z.object({ orderedIds: z.array(idSchema).min(1) });
export type AddonsReorderInput = z.infer<typeof addonsReorderSchema>;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const productChoiceGroupAssignmentSchema = z.object({
  choiceGroupId: idSchema,
  sortOrder: z.number().int().default(0),
  isRequiredOverride: z.boolean().nullable().optional(),
  minSelectOverride: z.number().int().min(0).nullable().optional(),
  maxSelectOverride: z.number().int().min(1).nullable().optional(),
  defaultChoiceOptionId: idSchema.nullable().optional(),
});
export type ProductChoiceGroupAssignmentInput = z.infer<typeof productChoiceGroupAssignmentSchema>;

function checkProductDiscount(basePrice: number | undefined, discountPrice: number | null | undefined, ctx: z.RefinementCtx) {
  if (basePrice === undefined || discountPrice == null) return;
  if (discountPrice <= 0 || discountPrice >= basePrice) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Discount price must be greater than 0 and less than the regular price",
      path: ["discountPrice"],
    });
  }
}

const productShape = z.object({
  categoryId: idSchema,
  name: z.string().trim().min(1).max(150),
  sku: z.string().trim().max(60).optional(),
  description: z.string().trim().max(4000).optional(),
  shortDescription: z.string().trim().max(300).optional(),
  basePrice: moneyPaisaSchema,
  discountPrice: moneyPaisaSchema.nullable().optional(),
  taxPct: z.number().min(0).max(100).optional(),
  isFeatured: z.boolean().default(false),
  isPopular: z.boolean().default(false),
  tag: z.enum(["HOUSE_FAVORITE", "NEW_ARRIVAL", "BEST_SELLER"]).nullable().optional(),
  isCartRecommendable: z.boolean().default(false),
  showOnMainPage: z.boolean().default(false),
  mainPageSortOrder: z.number().int().default(0),
  prepTimeMinutes: z.number().int().min(0).optional(),
  choiceGroups: z.array(productChoiceGroupAssignmentSchema).default([]),
  addonIds: z.array(idSchema).default([]),
  images: z.array(z.string().url()).default([]),
});

export const createProductSchema = productShape.superRefine((data, ctx) => checkProductDiscount(data.basePrice, data.discountPrice, ctx));
export type CreateProductInput = z.infer<typeof productShape>;

export const updateProductSchema = productShape
  .partial()
  .extend({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() })
  .superRefine((data, ctx) => checkProductDiscount(data.basePrice, data.discountPrice, ctx));
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  branchId: idSchema.optional(),
  categoryId: idSchema.optional(),
  featured: z.coerce.boolean().optional(),
  popular: z.coerce.boolean().optional(),
  mainPage: z.coerce.boolean().optional(),
  search: z.string().trim().max(150).optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
