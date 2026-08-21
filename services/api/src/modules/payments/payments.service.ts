import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PayFastAdapter, type PaymentGateway } from "@restaurant/payments";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { OrdersService } from "../orders/orders.service";
import type { Env } from "../../config/env.schema";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  readonly gateway: PaymentGateway;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly auditLogs: AuditLogService,
    @Inject(forwardRef(() => OrdersService)) private readonly orders: OrdersService,
  ) {
    const mode = this.config.get("PAYFAST_MODE", { infer: true });
    const port = this.config.get("PORT", { infer: true });
    this.gateway = new PayFastAdapter({
      mode,
      merchantId: this.config.get("PAYFAST_MERCHANT_ID", { infer: true }),
      securedKey: this.config.get("PAYFAST_SECURED_KEY", { infer: true }),
      merchantName: this.config.get("PAYFAST_MERCHANT_NAME", { infer: true }),
      liveApiBaseUrl: this.config.get("PAYFAST_LIVE_API_BASE_URL", { infer: true }),
      // PayFast's servers call this directly (the CHECKOUT_URL IPN) — must be internet-reachable
      // (a tunnel, in local sandbox testing) even though the browser-facing routes below don't need one.
      liveBridgeBaseUrl: this.config.get("PAYFAST_LIVE_BRIDGE_BASE_URL", { infer: true }) ?? `http://localhost:${port}/api/v1/payments/payfast-live`,
      // The customer's own browser hits these two (redirect + return) — same machine as this dev
      // server during local testing, so plain localhost is correct and deliberately avoids
      // routing real page-loads through a tunnel (see PayFastConfig's doc comment).
      liveBrowserBridgeBaseUrl: `http://localhost:${port}/api/v1/payments/payfast-live`,
      checkoutBaseUrl: `http://localhost:${port}/api/v1/payments/mock-payfast/checkout`,
    });
  }

  /**
   * Initiates a gateway session for whichever Payment row is the order's current attempt — the
   * one just created by createOnlineOrder, or (on a retry) the fresh row retryOnlinePayment just
   * inserted. Never `order.payments[0]`: once a failed/expired attempt can be retried, an order
   * legitimately accumulates multiple Payment rows, and the first one is the stalest, not the
   * current one.
   */
  async initiateForOrder(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) throw new Error(`Order ${orderId} has no pending payment row to initiate`);

    const port = this.config.get("PORT", { infer: true });
    const webOrigin = this.config.get("CORS_ORIGINS", { infer: true }).split(",")[0];

    const result = await this.gateway.initiate({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountPaisa: payment.amount,
      currency: "PKR",
      customerEmail: order.contactEmail ?? undefined,
      customerPhone: order.contactPhone ?? undefined,
      returnUrl: `${webOrigin}/order-confirmation/${order.orderNumber}`,
      // Failed/cancelled payment goes to the home page, not back into checkout — the order
      // itself is untouched (still PENDING, hidden from staff), and the customer can find it
      // again via their order history / the confirmation link to retry. (Live mode ignores this
      // and routes through its own /return bridge instead — see PayFastAdapter.initiate.)
      cancelUrl: `${webOrigin}/`,
      notifyUrl: `http://localhost:${port}/api/v1/payments/webhook/payfast`,
    });

    await this.prisma.payment.update({ where: { id: payment.id }, data: { transactionRef: result.providerRef } });
    return result;
  }

  async handleWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>) {
    const result = await this.gateway.verifyWebhook({ rawBody, headers });
    if (!result.valid) {
      this.logger.warn(`Rejected webhook for attempt ${result.providerRef}: invalid signature`);
      return { accepted: false as const };
    }

    // Resolved purely by the attempt's transactionRef (== providerRef) — already globally
    // unique, and the only identifier PayFast's live callback actually carries (it has no
    // concept of our internal orderId).
    const payment = await this.prisma.payment.findFirst({
      where: { transactionRef: result.providerRef },
      include: { order: { select: { id: true, orderNumber: true, restaurantId: true } } },
    });
    if (!payment) {
      this.logger.warn(`Webhook for unknown attempt ${result.providerRef}`);
      return { accepted: false as const };
    }
    const orderId = payment.order.id;

    // Idempotent: an already-settled payment ignores duplicate/replayed webhooks.
    if (payment.status === "PAID" || payment.status === "REFUNDED") {
      return { accepted: true as const, alreadyProcessed: true, status: payment.status, orderNumber: payment.order.orderNumber };
    }

    // A late/duplicate webhook for an attempt that's no longer the order's current one (a retry
    // has since started, or already resolved) must never overwrite the order's live
    // paymentStatus — only the specific Payment row it names is updated in that case.
    const latestPayment = await this.prisma.payment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" }, select: { id: true } });
    const isCurrentAttempt = latestPayment?.id === payment.id;

    const newStatus = result.status === "paid" ? "PAID" : "FAILED";
    // Payment success only ever updates paymentStatus — it is not the same thing as Admin
    // reviewing and accepting the order. order.status stays PENDING (or whatever it already was)
    // until an explicit Accept (see OrdersService.updateOrderStatus's isAccepting path).
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: newStatus, webhookPayload: result.raw as object, paidAt: newStatus === "PAID" ? new Date() : null },
      }),
      ...(isCurrentAttempt ? [this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: newStatus } })] : []),
    ]);

    await this.auditLogs.record({
      restaurantId: payment.order.restaurantId,
      action: "payment.update",
      entityType: "Payment",
      entityId: payment.id,
      oldValue: { status: payment.status },
      newValue: { status: newStatus },
    });

    // Only a fresh, current-attempt PAID confirmation makes the order "placed" from the
    // restaurant's perspective — see OrdersService.onlinePaymentConfirmed / order-visibility.ts.
    if (newStatus === "PAID" && isCurrentAttempt) {
      await this.orders.onlinePaymentConfirmed(orderId);
    }

    return { accepted: true as const, status: newStatus, orderNumber: payment.order.orderNumber };
  }

  /**
   * Where PayFast's live SUCCESS_URL/FAILURE_URL bridge (see PaymentsController) sends the
   * customer's browser next — decided from the just-verified result, never from which of the two
   * (identical) URLs PayFast happened to redirect to.
   */
  buildWebRedirectUrl(result: { accepted: boolean; status?: string; orderNumber?: string }): string {
    const webOrigin = this.config.get("CORS_ORIGINS", { infer: true }).split(",")[0];
    if (result.accepted && result.status === "PAID" && result.orderNumber) {
      return `${webOrigin}/order-confirmation/${result.orderNumber}`;
    }
    return `${webOrigin}/`;
  }

  /**
   * Sweeps ONLINE payments abandoned mid-checkout (browser closed, no gateway response ever
   * arrived) — PAYFAST_MODE=mock's "Cancel" link and a customer simply never returning both leave
   * a Payment row PENDING forever otherwise. Only the order's CURRENT attempt is ever expired: an
   * old failed attempt aging out must not re-hide an order whose retry is still legitimately
   * pending or already succeeded.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirePendingPayments(): Promise<{ processed: number }> {
    const minutes = this.config.get("PAYMENT_EXPIRY_MINUTES", { infer: true });
    const cutoff = new Date(Date.now() - minutes * 60_000);

    const stalePending = await this.prisma.payment.findMany({
      where: { status: "PENDING", method: "ONLINE", createdAt: { lte: cutoff } },
      orderBy: { createdAt: "desc" },
      select: { id: true, orderId: true },
    });
    if (stalePending.length === 0) return { processed: 0 };

    // One candidate per order — findMany above is already newest-first, so the first entry seen
    // per orderId is that order's newest stale-pending attempt.
    const candidateByOrder = new Map<string, string>();
    for (const p of stalePending) if (!candidateByOrder.has(p.orderId)) candidateByOrder.set(p.orderId, p.id);

    let processed = 0;
    for (const [orderId, paymentId] of candidateByOrder) {
      const latest = await this.prisma.payment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (latest?.id !== paymentId) continue; // a newer attempt exists — leave this stale one as-is, don't touch the order

      const [{ count }] = await this.prisma.$transaction([
        this.prisma.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "EXPIRED" } }),
        this.prisma.order.updateMany({ where: { id: orderId, paymentStatus: "PENDING" }, data: { paymentStatus: "EXPIRED" } }),
      ]);
      if (count > 0) processed++;
    }

    if (processed > 0) this.logger.log(`Expired ${processed} stale online payment(s)`);
    return { processed };
  }
}
