import { Controller, Get, Header, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHmac } from "node:crypto";
import { Public } from "../auth/decorators/public.decorator";
import { PaymentsService } from "./payments.service";

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
}
