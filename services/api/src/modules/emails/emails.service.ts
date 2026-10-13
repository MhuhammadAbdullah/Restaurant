import { IS_SERVERLESS } from "../../common/serverless";
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EmailService } from "../../common/email/email.service";
import type { Env } from "../../config/env.schema";
import { TEMPLATE_BY_KEY, TEMPLATE_DEFINITIONS, type TemplateKey } from "./email-templates.defaults";
import { buttonHtml, escapeHtml, fillSubject, fillTemplate, htmlToText, sanitizeEmailHtml, wrapInLayout } from "./email-render";

const DEFAULT_REVIEW_DELAY_MINUTES = 30;
const QUEUE_INTERVAL_MS = 60_000;
const MAX_PER_PASS = 25;
/** A failed email is tried again by the queue (once a minute) until it has been attempted this many times or is a day old. */
const MAX_ATTEMPTS = 5;
const RETRY_MIN_AGE_MS = 2 * 60_000;

export type EmailSettings = { reviewDelayMinutes: number };

type SendContext = { restaurantId: string; to: string; values: Record<string, string>; orderId?: string; complaintId?: string; staffId?: string };
type SendResult = { sent: boolean; skipped?: "DISABLED"; logId?: string };

const PAYMENT_LABEL: Record<string, string> = { COD: "Cash on Delivery", ONLINE: "Online Payment", CASH: "Cash", CARD: "Card", QR: "QR Payment" };
const money = (paisa: number) => `Rs. ${(paisa / 100).toLocaleString("en-PK", { minimumFractionDigits: 2 })}`;
const otpBox = (code: string) => `<div style="display:inline-block;background:#f7f4ef;border:1px dashed #ED2320;border-radius:12px;padding:12px 26px;font-size:32px;font-weight:700;letter-spacing:8px;color:#111;">${escapeHtml(code)}</div>`;
const STATUS_LABEL: Record<string, string> = { OPEN: "Open", UNDER_REVIEW: "Under review", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed", REJECTED: "Rejected" };

@Injectable()
export class EmailsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ------------------------------------------------------------------ queue (post-delivery review email)

  onModuleInit() {
    if (IS_SERVERLESS) return;
    this.timer = setInterval(() => void this.processReviewQueue(), QUEUE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Finds orders that were delivered/completed at least `reviewDelayMinutes` ago and have not been sent a
   * review email yet, and sends it. Scanning (instead of hooking each place an order can become delivered —
   * kitchen, rider, POS, admin) means every path is covered. Only orders finished after the feature's start
   * date are considered, so switching it on never emails the customers of old orders.
   */
  async processReviewQueue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.retryFailed();
      const restaurants = await this.prisma.restaurant.findMany({ select: { id: true, settings: true } });
      for (const r of restaurants) {
        const settings = await this.getSettings(r.id);
        const tpl = await this.prisma.emailTemplate.findUnique({ where: { restaurantId_key: { restaurantId: r.id, key: "ORDER_REVIEW" } } });
        if (tpl && !tpl.enabled) continue;
        // Only recent deliveries are considered: old email logs get deleted (see RetentionService), and without their
        // record an old order could look "not emailed yet".
        const since = new Date(Math.max((await this.reviewEmailsSince(r.id)).getTime(), Date.now() - 3 * 86_400_000));
        const cutoff = new Date(Date.now() - settings.reviewDelayMinutes * 60_000);

        const due = await this.prisma.order.findMany({
          where: {
            restaurantId: r.id,
            status: { in: ["DELIVERED", "COMPLETED"] },
            updatedAt: { gte: since, lte: cutoff },
            OR: [{ contactEmail: { not: null } }, { customer: { email: { not: "" } } }],
          },
          select: { id: true },
          orderBy: { updatedAt: "asc" },
          take: MAX_PER_PASS * 4,
        });
        if (due.length === 0) continue;
        const already = await this.prisma.emailLog.findMany({
          where: { restaurantId: r.id, templateKey: "ORDER_REVIEW", orderId: { in: due.map((o) => o.id) } },
          select: { orderId: true },
        });
        const done = new Set(already.map((l) => l.orderId));
        let sentNow = 0;
        for (const o of due) {
          if (done.has(o.id)) continue;
          if (sentNow >= MAX_PER_PASS) break;
          sentNow++;
          await this.sendReviewEmail(o.id).catch((e) => this.logger.error(`Review email for order ${o.id} failed: ${e instanceof Error ? e.message : e}`));
        }
      }
    } catch (e) {
      this.logger.error(`Review email queue error: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Sends again emails that failed (usually a brief SMTP timeout) or got stuck half-way, so a customer or staff member is not left without
   * their email. Login codes are never retried: they expire in minutes and the user simply asks for a new one.
   */
  private async retryFailed(): Promise<void> {
    const failed = await this.prisma.emailLog.findMany({
      where: {
        // PENDING this long means the server stopped (or restarted) in the middle of sending, so it never finished.
        status: { in: ["FAILED", "PENDING"] },
        attempts: { lt: MAX_ATTEMPTS },
        templateKey: { not: "OTP" },
        html: { not: null },
        createdAt: { gte: new Date(Date.now() - 86_400_000), lte: new Date(Date.now() - RETRY_MIN_AGE_MS) },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    for (const log of failed) {
      await this.deliver({ restaurantId: log.restaurantId, key: log.templateKey, to: log.toEmail, subject: log.subject, html: log.html!, logId: log.id }).catch(() => undefined);
    }
  }

  private async reviewEmailsSince(restaurantId: string): Promise<Date> {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { settings: true } });
    const settings = (r.settings as Record<string, unknown> | null) ?? {};
    const email = (settings.email as Record<string, unknown> | undefined) ?? {};
    if (typeof email.reviewEmailsSince === "string") return new Date(email.reviewEmailsSince);
    const now = new Date().toISOString();
    await this.prisma.restaurant.update({ where: { id: restaurantId }, data: { settings: { ...settings, email: { ...email, reviewEmailsSince: now } } as never } });
    return new Date(now);
  }

  private async sendReviewEmail(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { name: true, email: true } }, branch: true, items: { select: { nameSnapshot: true, quantity: true } } },
    });
    if (!order || !["DELIVERED", "COMPLETED"].includes(order.status)) return;
    const to = order.customer?.email || order.contactEmail;
    if (!to) return;
    // The review link belongs to the branch the order came from, so each customer is sent to the right Google listing.
    const reviewUrl = order.branch.googleReviewUrl || "";
    const web = this.webOrigin();
    const itemsHtml = `<ul style="margin:0 0 14px;padding-left:18px;color:#444;">${order.items.map((i) => `<li>${i.quantity} x ${escapeHtml(i.nameSnapshot)}</li>`).join("")}</ul>`;
    await this.sendTemplate("ORDER_REVIEW", {
      restaurantId: order.restaurantId,
      to,
      orderId,
      values: {
        customer_name: order.customer?.name ?? order.contactName ?? "there",
        order_id: order.orderCode ?? order.orderNumber,
        invoice_no: order.orderNumber.replace(/\D/g, ""),
        branch_name: order.branch.name,
        order_total: money(order.grandTotal),
        order_items_html: itemsHtml,
        review_button: reviewUrl ? buttonHtml("Rate us on Google", reviewUrl) : "",
        review_url: reviewUrl,
        complaint_link: `${web}/complaints`,
      },
    });
  }

  // ------------------------------------------------------------------ settings

  async getSettings(restaurantId: string): Promise<EmailSettings> {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { settings: true } });
    const email = ((r.settings as Record<string, unknown> | null)?.email as Partial<EmailSettings> | undefined) ?? {};
    return {
      reviewDelayMinutes: typeof email.reviewDelayMinutes === "number" ? email.reviewDelayMinutes : DEFAULT_REVIEW_DELAY_MINUTES,
    };
  }

  async saveSettings(restaurantId: string, input: Partial<EmailSettings>): Promise<EmailSettings> {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { settings: true } });
    const settings = (r.settings as Record<string, unknown> | null) ?? {};
    const current = (settings.email as Record<string, unknown> | undefined) ?? {};
    const next = { ...current, ...(input.reviewDelayMinutes !== undefined ? { reviewDelayMinutes: input.reviewDelayMinutes } : {}), };
    await this.prisma.restaurant.update({ where: { id: restaurantId }, data: { settings: { ...settings, email: next } as never } });
    return this.getSettings(restaurantId);
  }

  // ------------------------------------------------------------------ templates

  private def(key: string) {
    const d = TEMPLATE_BY_KEY.get(key as TemplateKey);
    if (!d) throw new NotFoundException({ code: "EMAIL_TEMPLATE_NOT_FOUND", message: "Unknown email template" });
    return d;
  }

  async listTemplates(restaurantId: string) {
    const rows = await this.prisma.emailTemplate.findMany({ where: { restaurantId } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return TEMPLATE_DEFINITIONS.map((d) => {
      const row = byKey.get(d.key);
      return { key: d.key, label: d.label, description: d.description, trigger: d.trigger, enabled: row?.enabled ?? true, customized: !!row, canDisable: d.key !== "OTP", updatedAt: row?.updatedAt ?? null };
    });
  }

  async getTemplate(restaurantId: string, key: string) {
    const d = this.def(key);
    const row = await this.prisma.emailTemplate.findUnique({ where: { restaurantId_key: { restaurantId, key } } });
    return {
      key: d.key,
      label: d.label,
      description: d.description,
      trigger: d.trigger,
      subject: row?.subject ?? d.subject,
      body: row?.body ?? d.body,
      enabled: row?.enabled ?? true,
      customized: !!row,
      canDisable: d.key !== "OTP",
      defaultSubject: d.subject,
      defaultBody: d.body,
      variables: d.variables,
    };
  }

  async saveTemplate(restaurantId: string, key: string, input: { subject: string; body: string; enabled: boolean }, staffId: string) {
    const d = this.def(key);
    const subject = input.subject.trim();
    const body = sanitizeEmailHtml(input.body.trim());
    if (!subject) throw new BadRequestException({ code: "EMAIL_SUBJECT_REQUIRED", message: "The subject cannot be empty" });
    if (!htmlToText(body)) throw new BadRequestException({ code: "EMAIL_BODY_REQUIRED", message: "The email body cannot be empty" });
    // The OTP email must always be able to go out, otherwise nobody can log in.
    const enabled = d.key === "OTP" ? true : input.enabled;
    await this.prisma.emailTemplate.upsert({
      where: { restaurantId_key: { restaurantId, key } },
      create: { restaurantId, key, subject, body, enabled, updatedByStaffId: staffId },
      update: { subject, body, enabled, updatedByStaffId: staffId },
    });
    return this.getTemplate(restaurantId, key);
  }

  async resetTemplate(restaurantId: string, key: string) {
    this.def(key);
    await this.prisma.emailTemplate.deleteMany({ where: { restaurantId, key } });
    return this.getTemplate(restaurantId, key);
  }

  /** Renders a template (the saved one, or an unsaved draft from the editor) with sample or real values, inside the branded layout. */
  private async render(restaurantId: string, key: string, values: Record<string, string>, draft?: { subject?: string; body?: string }) {
    const d = this.def(key);
    const row = await this.prisma.emailTemplate.findUnique({ where: { restaurantId_key: { restaurantId, key } } });
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true, logoUrl: true, contactPhone: true, contactEmail: true } });
    const all = { restaurant_name: restaurant.name, support_phone: restaurant.contactPhone ?? "", ...values };
    const subject = fillSubject(draft?.subject ?? row?.subject ?? d.subject, all);
    const bodyHtml = fillTemplate(sanitizeEmailHtml(draft?.body ?? row?.body ?? d.body), all, d.variables);
    const html = wrapInLayout({ restaurantName: restaurant.name, logoUrl: restaurant.logoUrl, supportPhone: restaurant.contactPhone, supportEmail: restaurant.contactEmail, bodyHtml });
    return { subject, html, text: htmlToText(bodyHtml) };
  }

  async preview(restaurantId: string, key: string, draft?: { subject?: string; body?: string }) {
    const d = this.def(key);
    const sample = { ...d.sample };
    // sample blocks for the "raw" variables, so the preview looks like the real thing
    sample.order_details_html = SAMPLE_ORDER_BLOCK;
    sample.otp_code_box = otpBox(sample.otp_code ?? "482915");
    sample.order_button = buttonHtml("Check Order Status", "#");
    sample.review_button = buttonHtml("Rate us on Google", "#");
    sample.order_items_html = `<ul style="margin:0 0 14px;padding-left:18px;color:#444;"><li>2 x Zinger Burger</li><li>1 x Fries</li></ul>`;
    const out = await this.render(restaurantId, key, sample, draft);
    return { subject: out.subject, html: out.html };
  }

  async sendTest(restaurantId: string, key: string, to: string, staffId: string, draft?: { subject?: string; body?: string }) {
    const out = await this.preview(restaurantId, key, draft);
    const r = await this.deliver({ restaurantId, key, to, subject: `[TEST] ${out.subject}`, html: out.html, staffId });
    if (!r.ok) throw new BadRequestException({ code: "EMAIL_SEND_FAILED", message: `The test email could not be sent: ${r.error}` });
    return { sent: true };
  }

  // ------------------------------------------------------------------ sending

  /** Renders the (customised or default) template and sends it. Logs every attempt. Disabled templates are skipped (never OTP). */
  async sendTemplate(key: TemplateKey, ctx: SendContext, opts: { throwOnError?: boolean } = {}): Promise<SendResult> {
    const row = await this.prisma.emailTemplate.findUnique({ where: { restaurantId_key: { restaurantId: ctx.restaurantId, key } } });
    if (row && !row.enabled && key !== "OTP") {
      this.logger.log(`${key} email skipped (disabled in Email Templates)`);
      return { sent: false, skipped: "DISABLED" };
    }
    const out = await this.render(ctx.restaurantId, key, ctx.values);
    const r = await this.deliver({ restaurantId: ctx.restaurantId, key, to: ctx.to, subject: out.subject, html: out.html, text: out.text, orderId: ctx.orderId, complaintId: ctx.complaintId, staffId: ctx.staffId });
    if (!r.ok && opts.throwOnError) throw new Error(r.error);
    return { sent: r.ok, logId: r.logId };
  }

  private async deliver(p: { restaurantId: string; key: string; to: string; subject: string; html: string; text?: string; orderId?: string; complaintId?: string; staffId?: string; logId?: string }) {
    // Login codes are secrets: the real email goes to the customer, but neither the code nor the message is ever
    // written to the log, so nobody with admin access can read someone's verification code.
    const secret = p.key === "OTP";
    const log = p.logId
      ? await this.prisma.emailLog.update({ where: { id: p.logId }, data: { attempts: { increment: 1 }, status: "PENDING", error: null } })
      : await this.prisma.emailLog.create({
          data: {
            restaurantId: p.restaurantId,
            templateKey: p.key,
            toEmail: p.to,
            subject: secret ? "Verification code (hidden for security)" : p.subject,
            html: secret ? null : p.html,
            orderId: p.orderId,
            complaintId: p.complaintId,
            sentByStaffId: p.staffId,
            attempts: 1,
          },
        });
    try {
      // One quick second try inside the request: most failures are a momentary connection timeout.
      const message = { to: p.to, subject: p.subject, html: p.html, text: p.text ?? htmlToText(p.html) };
      try {
        await this.email.sendRaw(message);
      } catch (first) {
        this.logger.warn(`${p.key} email to ${p.to} failed, trying once more: ${first instanceof Error ? first.message : first}`);
        await new Promise((r) => setTimeout(r, 1500));
        await this.email.sendRaw(message);
      }
      await this.prisma.emailLog.update({ where: { id: log.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
      this.logger.log(`${p.key} email sent to ${p.to}`);
      return { ok: true as const, logId: log.id };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.prisma.emailLog.update({ where: { id: log.id }, data: { status: "FAILED", error: error.slice(0, 500) } });
      this.logger.error(`${p.key} email to ${p.to} failed: ${error}`);
      return { ok: false as const, error, logId: log.id };
    }
  }

  // -- convenience senders used by the rest of the app

  /** OTP must reach the customer or login is impossible, so a failure is raised to the caller. */
  async sendOtp(restaurantId: string, to: string, code: string, purpose: "LOGIN" | "REGISTER") {
    await this.sendTemplate(
      "OTP",
      { restaurantId, to, values: { otp_code: code, otp_code_box: otpBox(code), otp_heading: purpose === "LOGIN" ? "Your login code" : "Verify your email to finish registering", expires_minutes: "5" } },
      { throwOnError: true },
    );
  }

  async sendOrderConfirmation(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { name: true, email: true } }, branch: true, items: { select: { nameSnapshot: true, quantity: true, lineTotal: true } } },
    });
    if (!order) return;
    const to = order.customer?.email || order.contactEmail;
    if (!to) return;
    const link = `${this.webOrigin()}/order-confirmation/${order.orderNumber}`;
    const isDelivery = ["ONLINE_DELIVERY", "DELIVERY"].includes(order.type);
    const isPickup = ["ONLINE_PICKUP", "TAKEAWAY"].includes(order.type);
    await this.sendTemplate("ORDER_CONFIRMATION", {
      restaurantId: order.restaurantId,
      to,
      orderId,
      values: {
        customer_name: order.customer?.name ?? order.contactName ?? "there",
        order_id: order.orderCode ?? order.orderNumber,
        invoice_no: order.orderNumber.replace(/\D/g, ""),
        order_type: order.type.replace(/_/g, " ").replace(/^ONLINE /, ""),
        order_date: order.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }),
        branch_name: order.branch.name,
        order_total: money(order.grandTotal),
        order_details_html: buildOrderDetailsHtml({ order, isDelivery, isPickup }),
        order_button: buttonHtml("Check Order Status", link),
        order_link: link,
      },
    });
  }

  async sendComplaintReply(complaintId: string, message: string, staffId: string): Promise<boolean> {
    const complaint = await this.prisma.complaint.findUnique({ where: { id: complaintId }, include: { customer: { select: { name: true, email: true } } } });
    if (!complaint) return false;
    const to = complaint.customer?.email || complaint.contactEmail;
    if (!to) return false;
    const staff = await this.prisma.staffUser.findUnique({ where: { id: staffId }, select: { name: true } });
    const r = await this.sendTemplate("COMPLAINT_REPLY", {
      restaurantId: complaint.restaurantId,
      to,
      complaintId,
      staffId,
      values: {
        customer_name: complaint.customer?.name ?? complaint.contactName ?? "there",
        complaint_id: complaint.complaintNumber,
        complaint_subject: complaint.subject,
        complaint_status: STATUS_LABEL[complaint.status] ?? complaint.status,
        reply_message: message,
        staff_name: staff?.name ?? "Customer Support",
      },
    });
    return r.sent;
  }

  /** A free-form email written by staff in the Compose screen (not tied to a template). */
  async compose(restaurantId: string, input: { to: string; subject: string; body: string }, staffId: string) {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true, logoUrl: true, contactPhone: true, contactEmail: true } });
    const bodyHtml = sanitizeEmailHtml(input.body);
    if (!htmlToText(bodyHtml)) throw new BadRequestException({ code: "EMAIL_BODY_REQUIRED", message: "Write a message first" });
    const html = wrapInLayout({ restaurantName: restaurant.name, logoUrl: restaurant.logoUrl, supportPhone: restaurant.contactPhone, supportEmail: restaurant.contactEmail, bodyHtml });
    const r = await this.deliver({ restaurantId, key: "CUSTOM", to: input.to, subject: input.subject.trim(), html, staffId });
    if (!r.ok) throw new BadRequestException({ code: "EMAIL_SEND_FAILED", message: `The email could not be sent: ${r.error}` });
    return { sent: true };
  }

  // ------------------------------------------------------------------ log

  async listLogs(restaurantId: string, f: { status?: string; search?: string; page: number; pageSize: number }) {
    const where = {
      restaurantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.search ? { OR: [{ toEmail: { contains: f.search, mode: "insensitive" as const } }, { subject: { contains: f.search, mode: "insensitive" as const } }] } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.emailLog.count({ where }),
      this.prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
        select: { id: true, templateKey: true, toEmail: true, subject: true, status: true, error: true, attempts: true, orderId: true, complaintId: true, sentAt: true, createdAt: true },
      }),
    ]);
    return { total, page: f.page, pageSize: f.pageSize, items };
  }

  // ---------- day-wise archive (admin Email Log) ----------
  // "Day" is the admin's local calendar day: the browser sends its UTC offset (Date.getTimezoneOffset(), minutes).

  private dayRange(from: string, to: string, tzOffsetMin: number) {
    const re = /^(\d{4})-(\d{2})-(\d{2})$/;
    const a = re.exec(from);
    const b = re.exec(to);
    if (!a || !b) throw new BadRequestException({ code: "INVALID_DAY", message: "Dates must be YYYY-MM-DD" });
    const start = new Date(Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3])) + tzOffsetMin * 60_000);
    const end = new Date(Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) + 86_400_000 + tzOffsetMin * 60_000);
    if (end <= start) throw new BadRequestException({ code: "INVALID_RANGE", message: "The end date must not be before the start date" });
    return { start, end };
  }

  /** How many emails exist on each day of a month: powers the archive calendar. No rows are returned. */
  async daysInMonth(restaurantId: string, month: string, tzOffsetMin: number): Promise<{ day: string; count: number }[]> {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) throw new BadRequestException({ code: "INVALID_MONTH", message: "month must be YYYY-MM" });
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const start = new Date(Date.UTC(y, mo - 1, 1) + tzOffsetMin * 60_000);
    const end = new Date(Date.UTC(y, mo, 1) + tzOffsetMin * 60_000);
    const rows = await this.prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char(("createdAt" - make_interval(mins => ${tzOffsetMin}::int)), 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
      FROM email_logs
      WHERE "restaurantId" = ${restaurantId} AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1
      ORDER BY 1`;
    return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
  }

  private rangeWhere(restaurantId: string, from: string, to: string, tzOffsetMin: number, f: { status?: string; templateKey?: string; search?: string }) {
    const { start, end } = this.dayRange(from, to, tzOffsetMin);
    const search = f.search?.trim();
    return {
      restaurantId,
      createdAt: { gte: start, lt: end },
      ...(f.status ? { status: f.status } : {}),
      ...(f.templateKey ? { templateKey: f.templateKey } : {}),
      ...(search ? { OR: [{ toEmail: { contains: search, mode: "insensitive" as const } }, { subject: { contains: search, mode: "insensitive" as const } }] } : {}),
    };
  }

  /** One page of one day's emails, plus counts per status and per kind for that day's filters. Read from the DB only when a day is opened. */
  async listDay(restaurantId: string, day: string, tzOffsetMin: number, f: { status?: string; templateKey?: string; search?: string }, page: number, pageSize: number) {
    const size = Math.min(Math.max(Math.floor(pageSize) || 25, 1), 100);
    const current = Math.max(Math.floor(page) || 1, 1);
    const where = this.rangeWhere(restaurantId, day, day, tzOffsetMin, f);
    const dayOnly = this.rangeWhere(restaurantId, day, day, tzOffsetMin, {});
    const [total, items, statuses, kinds] = await Promise.all([
      this.prisma.emailLog.count({ where }),
      this.prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (current - 1) * size,
        take: size,
        select: { id: true, templateKey: true, toEmail: true, subject: true, status: true, error: true, attempts: true, orderId: true, complaintId: true, sentAt: true, createdAt: true },
      }),
      this.prisma.emailLog.groupBy({ by: ["status"], where: dayOnly, _count: { _all: true } }),
      this.prisma.emailLog.groupBy({ by: ["templateKey"], where: dayOnly, _count: { _all: true } }),
    ]);
    return {
      items,
      total,
      page: current,
      pageSize: size,
      pageCount: Math.max(1, Math.ceil(total / size)),
      facets: {
        statuses: statuses.map((g) => ({ value: g.status, count: g._count._all })),
        kinds: kinds.map((g) => ({ value: g.templateKey, count: g._count._all })).sort((a, b) => a.value.localeCompare(b.value)),
      },
    };
  }

  /** Emails between two dates (inclusive) as CSV, for keeping an offline copy. Message bodies are never included. */
  async exportCsv(restaurantId: string, from: string, to: string, tzOffsetMin: number, f: { status?: string; templateKey?: string; search?: string }): Promise<string> {
    const rows = await this.prisma.emailLog.findMany({
      where: this.rangeWhere(restaurantId, from, to, tzOffsetMin, f),
      orderBy: { createdAt: "asc" },
      take: 50_000,
      select: { createdAt: true, sentAt: true, toEmail: true, templateKey: true, subject: true, status: true, error: true, attempts: true, orderId: true, complaintId: true },
    });
    const cell = (v: unknown) => {
      let t = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // stop spreadsheets running a cell as a formula
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const header = ["Created (UTC)", "Sent (UTC)", "To", "Email type", "Subject", "Status", "Error", "Attempts", "Order ID", "Complaint ID"];
    const lines = rows.map((r) => [r.createdAt.toISOString(), r.sentAt?.toISOString() ?? "", r.toEmail, r.templateKey, r.subject, r.status, r.error ?? "", r.attempts, r.orderId ?? "", r.complaintId ?? ""].map(cell).join(","));
    return [header.join(","), ...lines].join("\n");
  }

  async getLogHtml(restaurantId: string, id: string) {
    const log = await this.prisma.emailLog.findFirst({ where: { id, restaurantId }, select: { html: true, subject: true, toEmail: true } });
    if (!log) throw new NotFoundException({ code: "EMAIL_LOG_NOT_FOUND", message: "Email not found" });
    return log;
  }

  async resend(restaurantId: string, id: string, staffId: string) {
    const log = await this.prisma.emailLog.findFirst({ where: { id, restaurantId } });
    if (!log) throw new NotFoundException({ code: "EMAIL_LOG_NOT_FOUND", message: "Email not found" });
    if (!log.html) throw new BadRequestException({ code: "EMAIL_NOT_RESENDABLE", message: "This email has no saved content to send again" });
    const r = await this.deliver({ restaurantId, key: log.templateKey, to: log.toEmail, subject: log.subject, html: log.html, staffId, logId: log.id });
    if (!r.ok) throw new BadRequestException({ code: "EMAIL_SEND_FAILED", message: `The email could not be sent: ${r.error}` });
    return { sent: true };
  }

  private webOrigin(): string {
    return this.config.get("CORS_ORIGINS", { infer: true }).split(",")[0]!.trim();
  }
}

// ---------------------------------------------------------------------------- order block

const SAMPLE_ORDER_BLOCK = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:12px;margin:0 0 14px;"><tr><td style="padding:16px 18px;font-size:14px;color:#444;">
<strong style="font-size:16px;color:#111;">Order Information</strong><br/>Order Type: Delivery<br/>Date: 11 Oct 2026, 7:15 PM<br/>Delivery Address: House 12, DHA Phase 6, Karachi<br/><br/>
<strong style="font-size:16px;color:#111;">Items</strong><br/>2 x Zinger Burger &mdash; Rs. 1,800.00<br/>1 x Fries &mdash; Rs. 350.00<br/><br/>
<strong style="font-size:16px;color:#111;">Payment Details</strong><br/>Payment Method: Cash on Delivery<br/>Subtotal: Rs. 2,150.00<br/>Tax: Rs. 300.00<br/><strong style="color:#111;">Grand Total: Rs. 2,450.00</strong></td></tr></table>`;

type OrderForBlock = {
  type: string;
  createdAt: Date;
  paymentMethod: string;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  discountAmount: number;
  couponDiscountAmount: number;
  loyaltyDiscountAmount: number;
  grandTotal: number;
  tipAmount: number;
  deliveryAddressSnapshot: string | null;
  deliveryArea: string | null;
  branch: { name: string; address: string | null; phone: string | null };
  items: { nameSnapshot: string; quantity: number; lineTotal: number }[];
};

/** The order information / items / payment cards, as email-safe tables. Used as {{order_details_html}}. */
function buildOrderDetailsHtml({ order, isDelivery, isPickup }: { order: OrderForBlock; isDelivery: boolean; isPickup: boolean }): string {
  const row = (label: string, value: string, opts?: { bold?: boolean; top?: boolean }) =>
    `<tr><td style="padding:5px 0;${opts?.top ? "border-top:1px solid #eee;padding-top:10px;" : ""}${opts?.bold ? "font-weight:700;color:#111;" : "color:#666;"}">${escapeHtml(label)}</td><td style="padding:5px 0;${opts?.top ? "border-top:1px solid #eee;padding-top:10px;" : ""}text-align:right;${opts?.bold ? "font-weight:700;" : ""}color:#111;">${value}</td></tr>`;
  const card = (title: string, inner: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:12px;margin:0 0 14px;"><tr><td style="padding:16px 18px;"><div style="font-size:16px;font-weight:700;color:#111;margin-bottom:10px;">${escapeHtml(title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${inner}</table></td></tr></table>`;

  const address = order.deliveryAddressSnapshot ? `${order.deliveryAddressSnapshot}${order.deliveryArea ? `, ${order.deliveryArea}` : ""}` : null;
  const info =
    row("Order Type", escapeHtml(order.type.replace(/_/g, " ").replace(/^ONLINE /, ""))) +
    row("Date", escapeHtml(order.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }))) +
    (isDelivery && address ? row("Delivery Address", escapeHtml(address)) : "") +
    (isPickup ? row("Collect from", escapeHtml([order.branch.name, order.branch.address].filter(Boolean).join(", ")) + (order.branch.phone ? `<br/>${escapeHtml(order.branch.phone)}` : "")) : "");

  const items = order.items.map((i) => row(`${i.quantity} x ${i.nameSnapshot}`, money(i.lineTotal))).join("");
  const discount = order.discountAmount + order.couponDiscountAmount;
  const pay =
    row("Payment Method", escapeHtml(PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod)) +
    row("Subtotal", money(order.subtotal)) +
    (order.deliveryFee > 0 ? row("Delivery Fee", money(order.deliveryFee)) : "") +
    row("Tax", money(order.taxAmount)) +
    (discount > 0 ? row("Discount", `-${money(discount)}`) : "") +
    (order.loyaltyDiscountAmount > 0 ? row("Loyalty Discount", `-${money(order.loyaltyDiscountAmount)}`) : "") +
    row("Grand Total", money(order.grandTotal), { bold: true, top: true }) +
    (order.tipAmount > 0 ? row("Rider tip", money(order.tipAmount)) : "");

  return card("Order Information", info) + card("Items", items) + card("Payment Details", pay);
}
