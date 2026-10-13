import { z } from "zod";

const urlOrEmpty = z.string().trim().url().max(600).or(z.literal(""));

export const createBankDiscountSchema = z.object({
  name: z.string().trim().min(1, "Give the offer a name").max(120),
  image: z.string().trim().url("Add the offer picture").max(600),
  linkUrl: urlOrEmpty.default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});
export type CreateBankDiscountInput = z.infer<typeof createBankDiscountSchema>;

export const updateBankDiscountSchema = createBankDiscountSchema.partial();
export type UpdateBankDiscountInput = z.infer<typeof updateBankDiscountSchema>;

/** The page's own settings: shown or hidden on the website, and its heading texts. */
export const bankDiscountsSettingsSchema = z
  .object({
    enabled: z.boolean(),
    heading: z.string().trim().min(1).max(80),
    subheading: z.string().trim().max(200),
  })
  .partial();
export type BankDiscountsSettings = z.infer<typeof bankDiscountsSettingsSchema>;

export const DEFAULT_BANK_DISCOUNTS_SETTINGS: Required<BankDiscountsSettings> = {
  enabled: false,
  heading: "Bank Discounts",
  subheading: "Enjoy exclusive discounts and offers with our partner banks.",
};

export const reorderBankDiscountsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });
export type ReorderBankDiscountsInput = z.infer<typeof reorderBankDiscountsSchema>;
