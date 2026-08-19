import { Controller, Get, Query, UseGuards } from "@nestjs/common";
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
}
