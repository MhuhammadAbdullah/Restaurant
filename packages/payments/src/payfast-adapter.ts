import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentGateway,
  RefundInput,
  RefundResult,
  WebhookVerifyInput,
  WebhookVerifyResult,
} from "./gateway";

/**
 * PayFast Pakistan's "Hosted Checkout" (redirection) integration — per the Merchant Guide
 * (v2.3, 02-Oct-2024, "PAYFAST Hosted Checkout and I-frame based transactions"), section 3:
 * the browser is form-POSTed to PayFast's PostTransaction endpoint (never a plain GET redirect),
 * the customer pays entirely on PayFast's own page, and PayFast then GETs the merchant back with
 * a SHA256 validation_hash — both as a browser redirect (SUCCESS_URL/FAILURE_URL) and as a
 * separate backend IPN (CHECKOUT_URL). This is a distinct product/doc from PayFast's
 * "API Based Transaction" guide (which collects card/bank details directly on the merchant's own
 * server) — do not conflate the two.
 */
export interface PayFastConfig {
  mode: "live" | "mock";
  merchantId?: string;
  securedKey?: string;
  /** Brand name PayFast's checkout page displays — cosmetic only. */
  merchantName?: string;
  /** PayFast's Transaction API base — defaults to their UAT/sandbox host. Swap for the production host once PayFast provides it, ahead of going live. */
  liveApiBaseUrl?: string;
  /**
   * Our own public base URL for the ONE truly server-to-server route (`/notify`, PayFast's
   * CHECKOUT_URL IPN) — PayFast's servers call this directly, so it must be internet-reachable
   * (e.g. a tunnel to this API), not `localhost`.
   */
  liveBridgeBaseUrl?: string;
  /**
   * Base URL for the two browser-facing bridge routes (`/redirect`, `/return` — SUCCESS_URL/
   * FAILURE_URL). The CUSTOMER'S OWN BROWSER navigates here, not PayFast's servers — during local
   * dev/testing that's the same machine these dev servers run on, so plain `localhost` works fine
   * and deliberately avoids routing real page-loads through a tunnel (ngrok's free tier shows a
   * browser-warning interstitial to real browser navigations, breaking this exact flow).
   */
  liveBrowserBridgeBaseUrl?: string;
  checkoutBaseUrl?: string;
}

const DEFAULT_LIVE_API_BASE = "https://ipguat.apps.net.pk/Ecommerce/api/Transaction";

export class PayFastAdapter implements PaymentGateway {
  readonly providerName = "payfast";

  constructor(private readonly config: PayFastConfig) {
    if (config.mode === "live") {
      if (!config.merchantId || !config.securedKey) {
        throw new Error("PayFastAdapter: live mode requires merchantId and securedKey");
      }
      if (!config.liveBridgeBaseUrl) {
        throw new Error("PayFastAdapter: live mode requires liveBridgeBaseUrl");
      }
      if (!config.liveBrowserBridgeBaseUrl) {
        throw new Error("PayFastAdapter: live mode requires liveBrowserBridgeBaseUrl");
      }
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

    // "live" — BASKET_ID doubles as our per-attempt Payment.transactionRef, so the redirect/IPN
    // callback (matched on basket_id) resolves straight back to the exact attempt that initiated it.
    const basketId = providerRef;
    const amountRupees = (input.amountPaisa / 100).toFixed(2);
    const apiBase = this.config.liveApiBaseUrl ?? DEFAULT_LIVE_API_BASE;
    const publicBridgeBase = this.config.liveBridgeBaseUrl!;
    const browserBridgeBase = this.config.liveBrowserBridgeBaseUrl!;

    const token = await this.fetchAccessToken(apiBase, basketId, amountRupees, input.currency);
    const orderDate = new Date().toISOString().slice(0, 19).replace("T", " ");

    // SUCCESS_URL and FAILURE_URL are deliberately the SAME bridge route: it independently
    // re-verifies validation_hash + err_code server-side and decides the customer's actual
    // destination from that, rather than trusting which of the two named URLs PayFast happened
    // to redirect to. Both are browser-facing (the customer's own browser navigates here) —
    // CHECKOUT_URL is the one genuinely server-to-server route, so it's the only one that needs
    // the public/tunnel base.
    const formFields = {
      MERCHANT_ID: this.config.merchantId!,
      MERCHANT_NAME: this.config.merchantName ?? "Restaurant",
      TOKEN: token,
      PROCCODE: "00",
      TXNAMT: amountRupees,
      CUSTOMER_MOBILE_NO: input.customerPhone ?? "",
      CUSTOMER_EMAIL_ADDRESS: input.customerEmail ?? "",
      // The Merchant Guide's SIGNATURE/VERSION fields are documented only as "a random string
      // value" (its own working code example hardcodes a literal placeholder) — not a computed
      // hash. Treated literally here rather than inventing an unspecified algorithm.
      SIGNATURE: randomBytes(16).toString("hex"),
      VERSION: "RESTAURANT-1.0",
      TXNDESC: `Order ${input.orderNumber}`.slice(0, 100),
      SUCCESS_URL: `${browserBridgeBase}/return`,
      FAILURE_URL: `${browserBridgeBase}/return`,
      BASKET_ID: basketId,
      ORDER_DATE: orderDate,
      CHECKOUT_URL: `${publicBridgeBase}/notify`,
      CURRENCY_CODE: input.currency,
      TRAN_TYPE: "ECOMM_PURCHASE",
    };

    const bridgeParams = new URLSearchParams({ actionUrl: `${apiBase}/PostTransaction`, ...formFields });
    return { redirectUrl: `${browserBridgeBase}/redirect?${bridgeParams.toString()}`, providerRef: basketId };
  }

  async verifyWebhook(input: WebhookVerifyInput): Promise<WebhookVerifyResult> {
    const params = new URLSearchParams(input.rawBody);

    if (this.config.mode === "mock") {
      const orderId = params.get("orderId") ?? "";
      const providerRef = params.get("providerRef") ?? "";
      const amountPaisa = Number(params.get("amount") ?? 0);
      const status = params.get("status") === "paid" ? "paid" : "failed";
      const signature = params.get("signature") ?? "";
      const expectedSignature = this.computeMockSignature(params, "mock-dev-secret");
      const valid = this.constantTimeEquals(signature, expectedSignature) && orderId.length > 0;
      return { valid, providerRef, orderId, status, amountPaisa, raw: Object.fromEntries(params) };
    }

    // "live" — same field set for both the browser redirect (SUCCESS_URL/FAILURE_URL) and the
    // backend IPN (CHECKOUT_URL). validation_hash = SHA256("basket_id|secured_key|merchant_id|err_code").
    const basketId = params.get("basket_id") ?? "";
    const errCode = params.get("err_code") ?? "";
    const receivedHash = params.get("validation_hash") ?? "";
    const amountStr = params.get("transaction_amount") ?? params.get("merchant_amount") ?? "0";

    const expectedHash = createHash("sha256")
      .update(`${basketId}|${this.config.securedKey}|${this.config.merchantId}|${errCode}`)
      .digest("hex");
    const valid = this.constantTimeEquals(receivedHash, expectedHash) && basketId.length > 0;
    const status = errCode === "000" || errCode === "00" ? "paid" : "failed";
    const amountPaisa = Math.round(Number(amountStr) * 100);

    // No orderId in PayFast's callback — the caller (PaymentsService) resolves the order purely
    // from providerRef (== basket_id == our Payment.transactionRef), which is already unique.
    return { valid, providerRef: basketId, orderId: "", status, amountPaisa, raw: Object.fromEntries(params) };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (this.config.mode === "mock") {
      return { success: true, providerRef: input.providerRef };
    }
    // The Hosted Checkout Merchant Guide doesn't document a refund endpoint for this product —
    // confirm the correct one with PayFast before wiring this up.
    throw new Error("PayFastAdapter: live refund not yet wired — confirm PayFast's refund endpoint for Hosted Checkout first");
  }

  private async fetchAccessToken(apiBase: string, basketId: string, amountRupees: string, currency: string): Promise<string> {
    const res = await fetch(`${apiBase}/GetAccessToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // The Merchant Guide explicitly calls out "Empty user agents are not allowed".
        "User-Agent": "RestaurantPaymentGateway/1.0",
      },
      body: new URLSearchParams({
        MERCHANT_ID: this.config.merchantId!,
        SECURED_KEY: this.config.securedKey!,
        BASKET_ID: basketId,
        TXNAMT: amountRupees,
        CURRENCY_CODE: currency,
      }).toString(),
    });
    if (!res.ok) throw new Error(`PayFast GetAccessToken failed: HTTP ${res.status}`);
    const data = (await res.json()) as { ACCESS_TOKEN?: string };
    if (!data.ACCESS_TOKEN) throw new Error("PayFast GetAccessToken did not return an ACCESS_TOKEN");
    return data.ACCESS_TOKEN;
  }

  private computeMockSignature(params: URLSearchParams, secret: string): string {
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
