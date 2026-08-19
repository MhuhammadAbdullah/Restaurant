import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PayFastAdapter, type PaymentGateway } from "@restaurant/payments";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { Env } from "../../config/env.schema";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  readonly gateway: PaymentGateway;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly auditLogs: AuditLogService,
  ) {
    const mode = this.config.get("PAYFAST_MODE", { infer: true });
    this.gateway = new PayFastAdapter({
      mode,
      merchantId: this.config.get("PAYFAST_MERCHANT_ID", { infer: true }),
      securedKey: this.config.get("PAYFAST_SECURED_KEY", { infer: true }),
      checkoutBaseUrl: `http://localhost:${this.config.get("PORT", { infer: true })}/api/v1/payments/mock-payfast/checkout`,
    });
  }

  async initiateForOrder(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } });
    const payment = order.payments[0];
    if (!payment) throw new Error(`Order ${orderId} has no payment row`);

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
      cancelUrl: `${webOrigin}/checkout?cancelled=1`,
      notifyUrl: `http://localhost:${port}/api/v1/payments/webhook/payfast`,
    });

    await this.prisma.payment.update({ where: { id: payment.id }, data: { transactionRef: result.providerRef } });
    return result;
  }

  async handleWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>) {
    const result = await this.gateway.verifyWebhook({ rawBody, headers });
    if (!result.valid) {
      this.logger.warn(`Rejected webhook for order ${result.orderId}: invalid signature`);
      return { accepted: false };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: result.orderId },
      orderBy: { createdAt: "desc" },
      include: { order: { select: { restaurantId: true } } },
    });
    if (!payment) {
      this.logger.warn(`Webhook for unknown order ${result.orderId}`);
      return { accepted: false };
    }

    // Idempotent: a already-settled payment ignores duplicate/replayed webhooks.
    if (payment.status === "PAID" || payment.status === "REFUNDED") {
      return { accepted: true, alreadyProcessed: true };
    }

    const newStatus = result.status === "paid" ? "PAID" : "FAILED";
    // Payment success only ever updates paymentStatus — it is not the same thing as Admin
    // reviewing and accepting the order. order.status stays PENDING (or whatever it already was)
    // until an explicit Accept (see OrdersService.updateOrderStatus's isAccepting path).
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: newStatus, webhookPayload: result.raw as object, paidAt: newStatus === "PAID" ? new Date() : null },
      }),
      this.prisma.order.update({
        where: { id: result.orderId },
        data: { paymentStatus: newStatus },
      }),
    ]);

    await this.auditLogs.record({
      restaurantId: payment.order.restaurantId,
      action: "payment.update",
      entityType: "Payment",
      entityId: payment.id,
      oldValue: { status: payment.status },
      newValue: { status: newStatus },
    });

    return { accepted: true, status: newStatus };
  }
}
