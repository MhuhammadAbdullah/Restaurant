import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { StaffJwtPayload } from "@restaurant/auth";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "./audit-log.service";

@Controller("audit-logs")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly auditLogs: AuditLogService) {}

  @RequirePermission("auditLogs.view")
  @Get()
  async list(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("entityType") entityType?: string,
    @Query("staffUserId") staffUserId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const data = await this.auditLogs.list(staff.restaurantId, {
      entityType,
      staffUserId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return { success: true, data };
  }

  /** Calendar of the archive: entry counts per day for one month. No log rows are sent. */
  @RequirePermission("auditLogs.view")
  @Get("days")
  async days(@CurrentStaff() staff: StaffJwtPayload, @Query("month") month: string, @Query("tzOffset") tzOffset?: string) {
    const data = await this.auditLogs.daysInMonth(staff.restaurantId, month, Number(tzOffset) || 0);
    return { success: true, data };
  }

  /** One day's entries (paged), read from the database only when that day is opened. */
  @RequirePermission("auditLogs.view")
  @Get("day")
  async day(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("date") date: string,
    @Query("tzOffset") tzOffset?: string,
    @Query("entityType") entityType?: string,
    @Query("action") action?: string,
    @Query("staffUserId") staffUserId?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const data = await this.auditLogs.listDay(staff.restaurantId, date, Number(tzOffset) || 0, { entityType, action, staffUserId, search }, Number(page) || 1, Number(pageSize) || 50);
    return { success: true, data };
  }

  @RequirePermission("auditLogs.view")
  @Get("day/export.csv")
  async exportDay(
    @CurrentStaff() staff: StaffJwtPayload,
    @Res() res: Response,
    @Query("date") date: string,
    @Query("tzOffset") tzOffset?: string,
    @Query("entityType") entityType?: string,
    @Query("action") action?: string,
    @Query("staffUserId") staffUserId?: string,
    @Query("search") search?: string,
  ) {
    const csv = await this.auditLogs.exportDayCsv(staff.restaurantId, date, Number(tzOffset) || 0, { entityType, action, staffUserId, search });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${date}.csv"`);
    res.send(csv);
  }
}
