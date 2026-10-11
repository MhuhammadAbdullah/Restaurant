import { Controller, Get, Headers, Logger, UnauthorizedException } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { timingSafeEqual } from "crypto";
import { Public } from "../auth/decorators/public.decorator";
import { EmailsService } from "../emails/emails.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { PaymentsService } from "../payments/payments.service";
import { PermissionSyncService } from "../staff/permission-sync.service";
import { RetentionService } from "../retention/retention.service";

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Background jobs for hosting that cannot keep timers alive (Vercel). Call it from Vercel Cron and/or an outside
 * scheduler every few minutes with `Authorization: Bearer <CRON_SECRET>`. Every job is safe to run any number of times.
 */
@Controller("cron")
export class CronController {
  private readonly logger = new Logger(CronController.name);
  constructor(private readonly moduleRef: ModuleRef) {}

  @Public()
  @Get("run")
  async run(@Headers("authorization") authorization?: string) {
    const secret = process.env.CRON_SECRET;
    const given = authorization?.replace(/^Bearer\s+/i, "") ?? "";
    if (!secret || !sameSecret(given, secret)) throw new UnauthorizedException({ code: "CRON_FORBIDDEN", message: "Not allowed" });

    const get = <T>(token: new (...args: never[]) => T) => this.moduleRef.get(token, { strict: false });
    const results: Record<string, unknown> = {};
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        results[name] = (await fn()) ?? "ok";
      } catch (e) {
        this.logger.error(`${name} failed: ${e instanceof Error ? e.message : e}`);
        results[name] = "failed";
      }
    };
    await step("expirePendingPayments", () => get(PaymentsService).expirePendingPayments());
    await step("reviewEmails", () => get(EmailsService).processReviewQueue());
    await step("expireLoyaltyPoints", () => get(LoyaltyService).expirePoints());
    await step("purgeOldLogs", () => get(RetentionService).purge());
    await step("syncPermissions", () => get(PermissionSyncService).sync());
    return { success: true, data: results };
  }
}
