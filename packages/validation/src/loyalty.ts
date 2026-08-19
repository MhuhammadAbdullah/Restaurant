import { z } from "zod";

export const loyaltyConfigSchema = z
  .object({
    /**
     * Master switch for the loyalty *program* itself — when off, no points are earned (signup
     * bonus, orders) and none can be redeemed at checkout, regardless of a customer's existing
     * balance. Also controls whether "Loyalty Points" appears in the customer's account sidebar
     * at all (no separate visibility toggle — the master switch does double duty). Admin's manual
     * per-customer point adjustment is independent of this (a deliberate override action, not
     * automatic earning).
     */
    enabled: z.boolean(),
    /** One-time points awarded automatically when a new customer registers. */
    signupBonusPoints: z.number().int().min(0),
    /** Rs. spent (in paisa) to earn 1 point — e.g. 10000 = Rs.100 spent earns 1 point. */
    earnRatePaisaPerPoint: z.number().int().min(1),
    /** Rs. discount (in paisa) 1 point is worth at redemption — e.g. 100 = 1 point = Rs.1. */
    redemptionValuePaisaPerPoint: z.number().int().min(1),
    /** Days after earning before a point expires. 0 = points never expire. */
    expiryDays: z.number().int().min(0),
  })
  .partial();
export type LoyaltyConfig = z.infer<typeof loyaltyConfigSchema>;

export const DEFAULT_LOYALTY_CONFIG: Required<LoyaltyConfig> = {
  enabled: true,
  signupBonusPoints: 0,
  earnRatePaisaPerPoint: 10000, // Rs.100 = 1 point
  redemptionValuePaisaPerPoint: 100, // 1 point = Rs.1
  expiryDays: 0, // never expire
};

/**
 * Restaurant.settings is a free-form JSON bucket — loyalty config lives at settings.loyalty,
 * backfilled with defaults so callers never see missing fields. A plain function (not a service
 * method) so it can be shared by the CMS module (admin read/write) and the order-creation /
 * registration pipelines (which only ever need to read it) without a circular module dependency.
 */
export function resolveLoyaltyConfig(settings: unknown): Required<LoyaltyConfig> {
  const stored = (settings as { loyalty?: LoyaltyConfig } | null | undefined)?.loyalty ?? {};
  return { ...DEFAULT_LOYALTY_CONFIG, ...stored };
}
