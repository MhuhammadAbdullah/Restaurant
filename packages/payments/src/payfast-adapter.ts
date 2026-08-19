import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentGateway,
  RefundInput,
  RefundResult,
  WebhookVerifyInput,
  WebhookVerifyResult,
} from "./gateway";

export interface PayFastConfig {
  /**
   * "live" requires real PayFast merchant credentials (merchantId/securedKey) and talks to
   * PayFast's actual checkout + IPN endpoints. "mock" simulates the same redirect + webhook
   * shape locally so the order/payment pipeline can be built and tested before credentials exist.
   *
   * NOTE: the exact IPN field names / signature algorithm below follow the common
   * redirect+server-IPN pattern shared by PK payment gateways, but must be verified against
   * PayFast's current merchant API docs before flipping this to "live".
   */
  mode: "live" | "mock";
  merchantId?: string;
  securedKey?: string;
  checkoutBaseUrl?: string;
}

export class PayFastAdapter implements PaymentGateway {
  readonly providerName = "payfast";

  constructor(private readonly config: PayFastConfig) {
    if (config.mode === "live" && (!config.merchantId || !config.securedKey)) {
      throw new Error("PayFastAdapter: live mode requires merchantId and securedKey");
    }
  }

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const providerRef = `pf_${input.orderId}_${Date.now()}`;

    if (this.config.mode === "mock") {
      const params = new URLSearchParams({
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        amount: String(input.amountPaisa),
        currency: input.currency,
        providerRef,
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
        notifyUrl: input.notifyUrl,
      });
      return {
        redirectUrl: `${this.config.checkoutBaseUrl ?? "http://localhost:3001/mock-payfast/checkout"}?${params.toString()}`,
        providerRef,
      };
    }

    // Live PayFast checkout URL construction goes here once merchant credentials are supplied.
    throw new Error("PayFastAdapter: live mode not yet wired — supply merchant credentials first");
  }

  async verifyWebhook(input: WebhookVerifyInput): Promise<WebhookVerifyResult> {
    const params = new URLSearchParams(input.rawBody);
    const orderId = params.get("orderId") ?? "";
    const providerRef = params.get("providerRef") ?? "";
    const amountPaisa = Number(params.get("amount") ?? 0);
    const status = params.get("status") === "paid" ? "paid" : "failed";
    const signature = params.get("signature") ?? "";

    const secret = this.config.mode === "live" ? this.config.securedKey! : "mock-dev-secret";
    const expectedSignature = this.computeSignature(params, secret);

    const valid = this.constantTimeEquals(signature, expectedSignature) && orderId.length > 0;

    return { valid, providerRef, orderId, status, amountPaisa, raw: Object.fromEntries(params) };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (this.config.mode === "mock") {
      return { success: true, providerRef: input.providerRef };
    }
    throw new Error("PayFastAdapter: live refund not yet wired — supply merchant credentials first");
  }

  private computeSignature(params: URLSearchParams, secret: string): string {
    const entries = [...params.entries()]
      .filter(([key]) => key !== "signature")
      .sort(([a], [b]) => a.localeCompare(b));
    const base = entries.map(([k, v]) => `${k}=${v}`).join("&");
    return createHmac("sha256", secret).update(base).digest("hex");
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
