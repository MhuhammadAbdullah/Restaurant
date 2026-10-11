import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/** Email logs and audit logs are kept for this many days, then deleted. Download a day's CSV first if you need to keep it. */
export const LOG_RETENTION_DAYS = 14;

const FIRST_RUN_DELAY_MS = 30_000;
const RUN_EVERY_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.first = setTimeout(() => void this.purge(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.purge(), RUN_EVERY_MS);
    this.first.unref?.();
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  /** Deletes everything older than the retention window. Safe to run any number of times. */
  async purge(): Promise<{ emailLogs: number; auditLogs: number }> {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 86_400_000);
    try {
      const [emails, audits] = await Promise.all([
        this.prisma.emailLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
        this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      ]);
      if (emails.count > 0 || audits.count > 0) {
        this.logger.log(`Deleted ${emails.count} email log(s) and ${audits.count} audit log(s) older than ${LOG_RETENTION_DAYS} days`);
      }
      return { emailLogs: emails.count, auditLogs: audits.count };
    } catch (e) {
      this.logger.error(`Log cleanup failed: ${e instanceof Error ? e.message : e}`);
      return { emailLogs: 0, auditLogs: 0 };
    }
  }
}
