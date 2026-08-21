import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3001),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3002"),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  PAYFAST_MODE: z.enum(["live", "mock"]).default("mock"),
  PAYFAST_MERCHANT_ID: z.string().optional(),
  PAYFAST_SECURED_KEY: z.string().optional(),
  PAYFAST_MERCHANT_NAME: z.string().optional(),
  // PayFast's Hosted Checkout Transaction API base — defaults to their UAT/sandbox host; swap for
  // the production host once PayFast provides it.
  PAYFAST_LIVE_API_BASE_URL: z.string().url().optional(),
  // Our own public base URL PayFast's servers redirect/notify back to (SUCCESS_URL/FAILURE_URL/
  // CHECKOUT_URL). Must be internet-reachable for PAYFAST_MODE=live to work at all — localhost
  // needs a tunnel (e.g. ngrok) pointed at this API for sandbox testing.
  PAYFAST_LIVE_BRIDGE_BASE_URL: z.string().url().optional(),

  // Minutes an ONLINE order's payment can sit PENDING before the sweep (PaymentsService.expirePendingPayments)
  // flips it to EXPIRED and hides it from operational Orders/Kitchen/dashboard views.
  PAYMENT_EXPIRY_MINUTES: z.coerce.number().int().positive().default(45),

  // Customer email OTP (login/registration). Both provider configs can sit in .env at once —
  // EMAIL_PROVIDER picks which one is actually used, so switching to the "official" provider
  // later is a one-line config change, not a redeploy of new code.
  EMAIL_PROVIDER: z.enum(["gmail", "resend"]).default("gmail"),
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  // Web Push (browser notifications, order status updates) — optional: if unset, subscribe
  // endpoints still work but sends are skipped (logged), never fail the request that triggered them.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@demo-restaurant.test"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
