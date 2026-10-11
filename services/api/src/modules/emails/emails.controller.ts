import { Body, Controller, Get, Param, Post, Put, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { EmailsService } from "./emails.service";

const saveTemplateSchema = z.object({ subject: z.string().max(300), body: z.string().max(60_000), enabled: z.boolean().default(true) });
const draftSchema = z.object({ subject: z.string().max(300).optional(), body: z.string().max(60_000).optional() });
const testSchema = draftSchema.extend({ to: z.string().trim().email() });
const settingsSchema = z.object({
  reviewDelayMinutes: z.number().int().min(0).max(10_080).optional(),
});
const composeSchema = z.object({ to: z.string().trim().email(), subject: z.string().trim().min(1).max(300), body: z.string().min(1).max(60_000) });

@Controller("emails")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class EmailsController {
  constructor(private readonly emails: EmailsService) {}

  @RequirePermission("emails.view", "emails.manage", "emails.send")
  @Get("templates")
  async templates(@CurrentStaff() staff: StaffJwtPayload) {
    return { success: true, data: await this.emails.listTemplates(staff.restaurantId) };
  }

  @RequirePermission("emails.view", "emails.manage")
  @Get("templates/:key")
  async template(@CurrentStaff() staff: StaffJwtPayload, @Param("key") key: string) {
    return { success: true, data: await this.emails.getTemplate(staff.restaurantId, key) };
  }

  @RequirePermission("emails.manage")
  @Put("templates/:key")
  async save(@CurrentStaff() staff: StaffJwtPayload, @Param("key") key: string, @Body(new ZodValidationPipe(saveTemplateSchema)) body: z.infer<typeof saveTemplateSchema>) {
    return { success: true, data: await this.emails.saveTemplate(staff.restaurantId, key, body, staff.sub) };
  }

  @RequirePermission("emails.manage")
  @Post("templates/:key/reset")
  async reset(@CurrentStaff() staff: StaffJwtPayload, @Param("key") key: string) {
    return { success: true, data: await this.emails.resetTemplate(staff.restaurantId, key) };
  }

  @RequirePermission("emails.view", "emails.manage")
  @Post("templates/:key/preview")
  async preview(@CurrentStaff() staff: StaffJwtPayload, @Param("key") key: string, @Body(new ZodValidationPipe(draftSchema)) body: z.infer<typeof draftSchema>) {
    return { success: true, data: await this.emails.preview(staff.restaurantId, key, body) };
  }

  @RequirePermission("emails.manage")
  @Post("templates/:key/test")
  async test(@CurrentStaff() staff: StaffJwtPayload, @Param("key") key: string, @Body(new ZodValidationPipe(testSchema)) body: z.infer<typeof testSchema>) {
    return { success: true, data: await this.emails.sendTest(staff.restaurantId, key, body.to, staff.sub, { subject: body.subject, body: body.body }) };
  }

  @RequirePermission("emails.view", "emails.manage")
  @Get("settings")
  async settings(@CurrentStaff() staff: StaffJwtPayload) {
    return { success: true, data: await this.emails.getSettings(staff.restaurantId) };
  }

  @RequirePermission("emails.manage")
  @Put("settings")
  async saveSettings(@CurrentStaff() staff: StaffJwtPayload, @Body(new ZodValidationPipe(settingsSchema)) body: z.infer<typeof settingsSchema>) {
    return { success: true, data: await this.emails.saveSettings(staff.restaurantId, body) };
  }

  @RequirePermission("emails.view", "emails.send", "emails.manage")
  @Get("logs")
  async logs(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const data = await this.emails.listLogs(staff.restaurantId, {
      status: status || undefined,
      search: search?.trim() || undefined,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(5, Number(pageSize) || 25)),
    });
    return { success: true, data };
  }

  /** Calendar of the archive: email counts per day for one month. No rows are sent. */
  @RequirePermission("emails.view", "emails.send", "emails.manage")
  @Get("logs/days")
  async days(@CurrentStaff() staff: StaffJwtPayload, @Query("month") month: string, @Query("tzOffset") tzOffset?: string) {
    return { success: true, data: await this.emails.daysInMonth(staff.restaurantId, month, Number(tzOffset) || 0) };
  }

  /** One day's emails (paged), read from the database only when that day is opened. */
  @RequirePermission("emails.view", "emails.send", "emails.manage")
  @Get("logs/day")
  async day(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("date") date: string,
    @Query("tzOffset") tzOffset?: string,
    @Query("status") status?: string,
    @Query("kind") kind?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const data = await this.emails.listDay(staff.restaurantId, date, Number(tzOffset) || 0, { status: status || undefined, templateKey: kind || undefined, search }, Number(page) || 1, Number(pageSize) || 25);
    return { success: true, data };
  }

  /** CSV of any date range (from and to inclusive; send the same date twice for one day). */
  @RequirePermission("emails.view", "emails.send", "emails.manage")
  @Get("logs/export.csv")
  async exportCsv(
    @CurrentStaff() staff: StaffJwtPayload,
    @Res() res: Response,
    @Query("from") from: string,
    @Query("to") to?: string,
    @Query("tzOffset") tzOffset?: string,
    @Query("status") status?: string,
    @Query("kind") kind?: string,
    @Query("search") search?: string,
  ) {
    const end = to || from;
    const csv = await this.emails.exportCsv(staff.restaurantId, from, end, Number(tzOffset) || 0, { status: status || undefined, templateKey: kind || undefined, search });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="email-log-${from}${end !== from ? `_to_${end}` : ""}.csv"`);
    res.send(csv);
  }

  @RequirePermission("emails.view", "emails.send", "emails.manage")
  @Get("logs/:id")
  async logOne(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    return { success: true, data: await this.emails.getLogHtml(staff.restaurantId, id) };
  }

  @RequirePermission("emails.send")
  @Post("logs/:id/resend")
  async resend(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    return { success: true, data: await this.emails.resend(staff.restaurantId, id, staff.sub) };
  }

  @RequirePermission("emails.send")
  @Post("send")
  async compose(@CurrentStaff() staff: StaffJwtPayload, @Body(new ZodValidationPipe(composeSchema)) body: z.infer<typeof composeSchema>) {
    return { success: true, data: await this.emails.compose(staff.restaurantId, body, staff.sub) };
  }
}
