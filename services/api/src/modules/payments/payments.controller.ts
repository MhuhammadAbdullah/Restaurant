import { Controller, Get, Header, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHmac } from "node:crypto";
import { Public } from "../auth/decorators/public.decorator";
import { PaymentsService } from "./payments.service";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Stand-in for PayFast's hosted checkout page. Only reachable in PAYFAST_MODE=mock.
   * Lets a human (or the frontend, in dev) simulate a successful/failed payment so the full
   * checkout -> gateway -> webhook -> confirmation loop can be exercised without real credentials.
   */
  @Public()
  @Get("mock-payfast/checkout")
  @Header("Content-Type", "text/html")
  mockCheckoutPage(
    @Query("orderId") orderId: string,
    @Query("orderNumber") orderNumber: string,
    @Query("amount") amount: string,
    @Query("providerRef") providerRef: string,
    @Query("returnUrl") returnUrl: string,
    @Query("cancelUrl") cancelUrl: string,
    @Query("notifyUrl") notifyUrl: string,
  ) {
    const secret = "mock-dev-secret";
    const sign = (status: "paid" | "failed") => {
      const params = new URLSearchParams({ orderId, providerRef, amount, status });
      const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
      return createHmac("sha256", secret)
        .update(entries.map(([k, v]) => `${k}=${v}`).join("&"))
        .digest("hex");
    };

    const rupees = (Number(amount) / 100).toLocaleString("en-PK");

    return `<!doctype html><html><head><title>Mock PayFast Checkout</title>
<style>body{font-family:system-ui;max-width:420px;margin:60px auto;text-align:center}
button{display:block;width:100%;padding:14px;margin:10px 0;font-size:16px;border-radius:8px;border:none;cursor:pointer}
.pay{background:#16a34a;color:#fff}.fail{background:#dc2626;color:#fff}.cancel{background:#e5e7eb}</style>
</head><body>
<h2>Demo Restaurant — Mock Checkout</h2>
<p>Order ${orderNumber}<br/><strong>Rs. ${rupees}</strong></p>
<form method="POST" action="${notifyUrl}">
  <input type="hidden" name="orderId" value="${orderId}"/>
  <input type="hidden" name="providerRef" value="${providerRef}"/>
  <input type="hidden" name="amount" value="${amount}"/>
  <input type="hidden" name="status" value="paid"/>
  <input type="hidden" name="signature" value="${sign("paid")}"/>
  <input type="hidden" name="_returnUrl" value="${returnUrl}"/>
  <button class="pay" type="submit">Simulate Successful Payment</button>
</form>
<form method="POST" action="${notifyUrl}">
  <input type="hidden" name="orderId" value="${orderId}"/>
  <input type="hidden" name="providerRef" value="${providerRef}"/>
  <input type="hidden" name="amount" value="${amount}"/>
  <input type="hidden" name="status" value="failed"/>
  <input type="hidden" name="signature" value="${sign("failed")}"/>
  <input type="hidden" name="_returnUrl" value="${cancelUrl}"/>
  <button class="fail" type="submit">Simulate Failed Payment</button>
</form>
<a href="${cancelUrl}"><button class="cancel" type="button">Cancel</button></a>
</body></html>`;
  }

  @Public()
  @Post("webhook/payfast")
  async webhook(@Req() req: Request, @Res() res: Response) {
    // _returnUrl is a mock-checkout-only convenience field for this dev harness — it was never
    // part of the signed payload, so it must not be forwarded into signature verification.
    const { _returnUrl: returnUrl, ...providerFields } = req.body as Record<string, string>;
    const rawBody = new URLSearchParams(providerFields).toString();
    const result = await this.payments.handleWebhook(rawBody, req.headers as Record<string, string>);

    if (returnUrl) {
      res.redirect(303, returnUrl);
      return;
    }
    res.json({ success: true, data: result });
  }

  /**
   * PayFast's Hosted Checkout needs a real form POST to their PostTransaction endpoint (not a
   * plain GET redirect) — this renders that auto-submitting form. PayFastAdapter.initiate builds
   * the query string; the browser never sees or edits these fields, it just lands here for one
   * frame before being bounced straight on to PayFast's own page.
   *
   * The app-wide helmet() CSP (default-src 'self', form-action 'self', no inline scripts) exists
   * for the JSON API and would silently block both the auto-submit script and the cross-origin
   * POST to PayFast on this one HTML page — overridden here, scoped to PayFast's own domain,
   * rather than relaxed globally.
   */
  @Public()
  @Get("payfast-live/redirect")
  @Header("Content-Type", "text/html")
  @Header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; form-action 'self' https://ipguat.apps.net.pk https://*.apps.net.pk;",
  )
  liveRedirectBridge(@Query() query: Record<string, string>) {
    const { actionUrl, ...fields } = query;
    const inputs = Object.entries(fields)
      .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value ?? "")}"/>`)
      .join("\n");
    return `<!doctype html><html><head><title>Redirecting to PayFast…</title></head><body>
<form id="pf" method="POST" action="${escapeHtml(actionUrl ?? "")}">
${inputs}
<noscript><button type="submit">Continue to PayFast</button></noscript>
</form>
<p style="font-family:system-ui;text-align:center;margin-top:40px;color:#666">Redirecting to PayFast…</p>
<script>document.getElementById("pf").submit();</script>
</body></html>`;
  }

  /**
   * PayFast redirects the customer's browser here after payment (both SUCCESS_URL and
   * FAILURE_URL point at this exact same route — see PayFastAdapter.initiate) with a GET carrying
   * basket_id/err_code/validation_hash. Verified server-side via the same handleWebhook path the
   * backend IPN uses, then bounced on to the real destination decided from that verified result.
   */
  @Public()
  @Get("payfast-live/return")
  async liveReturn(@Req() req: Request, @Res() res: Response) {
    const rawBody = new URLSearchParams(req.query as Record<string, string>).toString();
    const result = await this.payments.handleWebhook(rawBody, req.headers as Record<string, string>);
    res.redirect(303, this.payments.buildWebRedirectUrl(result));
  }

  /**
   * The backend-to-backend IPN (CHECKOUT_URL) — PayFast's Merchant Guide documents this as GET;
   * POST is also accepted defensively since guide inconsistently describes it as a "webhook".
   * Same idempotent handleWebhook path as the browser return, so whichever arrives first wins and
   * the other is a no-op.
   */
  @Public()
  @Get("payfast-live/notify")
  async liveNotifyGet(@Req() req: Request) {
    const rawBody = new URLSearchParams(req.query as Record<string, string>).toString();
    const result = await this.payments.handleWebhook(rawBody, req.headers as Record<string, string>);
    return { success: true, data: result };
  }

  @Public()
  @Post("payfast-live/notify")
  async liveNotifyPost(@Req() req: Request) {
    const merged = { ...(req.query as Record<string, string>), ...(req.body as Record<string, string>) };
    const rawBody = new URLSearchParams(merged).toString();
    const result = await this.payments.handleWebhook(rawBody, req.headers as Record<string, string>);
    return { success: true, data: result };
  }
}
