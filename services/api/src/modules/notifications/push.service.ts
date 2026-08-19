import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import webpush from "web-push";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Env } from "../../config/env.schema";

type WebPushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/**
 * Order-scoped Web Push (not account-scoped) — a subscription is created from the order-tracking
 * page (registered customer or guest alike) and only ever used to push updates about that one
 * order. No VAPID keys configured → every send is a silent no-op (logged once at boot), never a
 * failure that propagates back to whatever triggered the notification.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly configured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    const publicKey = this.config.get("VAPID_PUBLIC_KEY", { infer: true });
    const privateKey = this.config.get("VAPID_PRIVATE_KEY", { infer: true });
    this.configured = !!publicKey && !!privateKey;
    if (this.configured) {
      webpush.setVapidDetails(this.config.get("VAPID_SUBJECT", { infer: true }), publicKey!, privateKey!);
    } else {
      this.logger.warn("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — push notifications are disabled");
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async subscribe(orderId: string, subscription: WebPushSubscriptionInput): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: { orderId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      update: { orderId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    });
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  async sendToOrder(orderId: string, payload: { title: string; body: string; url?: string }): Promise<void> {
    if (!this.configured) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { orderId } });
    if (subs.length === 0) return;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
        } catch (e) {
          const statusCode = (e as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Browser unsubscribed or the subscription expired — stop retrying it forever.
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          } else {
            this.logger.warn(`Push send failed for order ${orderId}: ${e instanceof Error ? e.message : e}`);
          }
        }
      }),
    );
  }
}
