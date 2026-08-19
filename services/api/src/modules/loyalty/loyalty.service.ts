import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Prisma } from "@restaurant/database";
import { resolveLoyaltyConfig, type LoyaltyConfig } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Single source of truth for "how many points does this many paisa earn, and when do they
 * expire" — orders.service.ts (online + POS + confirmPayment) and customer-otp.service.ts
 * (signup bonus) all call through here instead of each hardcoding the math, so a config change
 * (or an expiry-rule fix) only has to be right in one place.
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getConfig(restaurantId: string): Promise<Required<LoyaltyConfig>> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { settings: true },
    });
    return resolveLoyaltyConfig(restaurant.settings);
  }

  private expiryDate(config: Required<LoyaltyConfig>): Date | null {
    return config.expiryDays > 0 ? new Date(Date.now() + config.expiryDays * 24 * 60 * 60 * 1000) : null;
  }

  /** Awards points for a paid amount, inside an already-open order transaction. No-ops below 1 point. */
  async awardPoints(
    tx: Prisma.TransactionClient,
    params: { customerId: string; orderId: string; orderNumber: string; branchId: string; amountPaisa: number; config: Required<LoyaltyConfig> },
  ): Promise<void> {
    const { customerId, orderId, orderNumber, branchId, amountPaisa, config } = params;
    if (!config.enabled) return;
    const earnedPoints = Math.floor(amountPaisa / config.earnRatePaisaPerPoint);
    if (earnedPoints <= 0) return;

    // Loyalty is earned only by customers who completed real self-service registration —
    // a POS walk-in auto-profile (isGuest: true) never earns points, only registered accounts do.
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { isGuest: true } });
    if (!customer || customer.isGuest) return;

    const loyaltyAccount = await tx.loyaltyAccount.upsert({
      where: { customerId },
      create: { customerId, pointsBalance: 0 },
      update: {},
    });
    await tx.loyaltyTransaction.create({
      data: {
        loyaltyAccountId: loyaltyAccount.id,
        type: "EARNED",
        points: earnedPoints,
        orderId,
        branchId,
        note: `Earned on order ${orderNumber}`,
        expiresAt: this.expiryDate(config),
      },
    });
    await tx.loyaltyAccount.update({ where: { id: loyaltyAccount.id }, data: { pointsBalance: { increment: earnedPoints } } });
  }

  /** One-time bonus right after a new customer + loyaltyAccount row is created. No-ops if disabled or the bonus is 0. */
  async awardSignupBonus(tx: Prisma.TransactionClient, loyaltyAccountId: string, config: Required<LoyaltyConfig>): Promise<void> {
    if (!config.enabled || config.signupBonusPoints <= 0) return;
    await tx.loyaltyTransaction.create({
      data: {
        loyaltyAccountId,
        type: "EARNED",
        points: config.signupBonusPoints,
        note: "Signup bonus",
        expiresAt: this.expiryDate(config),
      },
    });
    await tx.loyaltyAccount.update({ where: { id: loyaltyAccountId }, data: { pointsBalance: { increment: config.signupBonusPoints } } });
  }

  /**
   * Daily sweep: every EARNED lot whose expiresAt has passed and hasn't been processed yet gets
   * debited via a paired EXPIRED transaction, capped at the account's *current* balance so a lot
   * that was already spent (redeemed) doesn't push the balance negative. This isn't full FIFO
   * lot-tracking against redemptions — it's a simpler, still-correct guarantee: each lot expires
   * exactly once, the ledger stays fully auditable, and the balance never goes below zero.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expirePoints(): Promise<{ processed: number }> {
    const dueLots = await this.prisma.loyaltyTransaction.findMany({
      where: { type: "EARNED", expiresAt: { lte: new Date() }, expiredAt: null },
      select: { id: true, points: true, loyaltyAccountId: true, createdAt: true },
    });
    if (dueLots.length === 0) return { processed: 0 };

    for (const lot of dueLots) {
      await this.prisma.$transaction(async (tx) => {
        const account = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: lot.loyaltyAccountId } });
        const amountToExpire = Math.min(lot.points, account.pointsBalance);

        await tx.loyaltyTransaction.update({ where: { id: lot.id }, data: { expiredAt: new Date() } });

        if (amountToExpire > 0) {
          await tx.loyaltyTransaction.create({
            data: {
              loyaltyAccountId: account.id,
              type: "EXPIRED",
              points: -amountToExpire,
              note: `Expired ${amountToExpire} pt(s) earned ${lot.createdAt.toISOString().slice(0, 10)}`,
            },
          });
          await tx.loyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: { decrement: amountToExpire } } });
        }
      });
    }

    this.logger.log(`Expired ${dueLots.length} loyalty lot(s)`);
    return { processed: dueLots.length };
  }
}
