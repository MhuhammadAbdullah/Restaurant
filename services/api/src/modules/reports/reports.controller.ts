import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermission("reports.view")
  @Get("dashboard-summary")
  async dashboardSummary(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId?: string) {
    const data = await this.reports.getDashboardSummary(staff, branchId);
    return { success: true, data };
  }

  @RequirePermission("reports.view")
  @Get("order-status-counts")
  async orderStatusCounts(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("branchId") branchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const data = await this.reports.getOrderStatusCounts(staff, { branchId, from, to });
    return { success: true, data };
  }

  @RequirePermission("reports.view")
  @Get("top-items")
  async topItems(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("branchId") branchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
  ) {
    const data = await this.reports.getTopItems(staff, { branchId, from, to, limit: limit ? Number(limit) : undefined });
    return { success: true, data };
  }

  @RequirePermission("reports.view")
  @Get("top-customers")
  async topCustomers(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("branchId") branchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
  ) {
    const data = await this.reports.getTopCustomers(staff, { branchId, from, to, limit: limit ? Number(limit) : undefined });
    return { success: true, data };
  }
}
