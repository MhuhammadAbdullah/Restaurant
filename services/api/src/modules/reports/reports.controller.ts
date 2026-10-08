import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { StaffJwtPayload } from "@restaurant/auth";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { ReportsService } from "./reports.service";
import { FinanceReportService, type FinanceReportFilters } from "./finance-report.service";
import { FinanceReportExportService } from "./finance-report-export.service";

function periodLabel(from?: string, to?: string): string {
  if (!from && !to) return "All time";
  return `${from ?? "…"} to ${to ?? "…"}`;
}

@Controller("reports")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly financeReport: FinanceReportService,
    private readonly financeReportExport: FinanceReportExportService,
  ) {}

  @RequirePermission("reports.view")
  @Get("dashboard-summary")
  async dashboardSummary(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId?: string) {
    const data = await this.reports.getDashboardSummary(staff, branchId);
    return { success: true, data };
  }

  @RequirePermission("reports.view")
  @Get("dashboard-analytics")
  async dashboardAnalytics(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("branchId") branchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const data = await this.reports.getDashboardAnalytics(staff, { branchId, from, to });
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

  // ---------- Order & Finance Reports (full reconciliation view — nothing hidden) ----------

  @RequirePermission("reports.view")
  @Get("finance")
  async finance(@CurrentStaff() staff: StaffJwtPayload, @Query() query: FinanceReportFilters) {
    const data = await this.financeReport.getReport(staff, query);
    return { success: true, data };
  }

  @RequirePermission("reports.export")
  @Get("finance/export.csv")
  async financeExportCsv(@CurrentStaff() staff: StaffJwtPayload, @Res() res: Response, @Query() query: FinanceReportFilters) {
    const report = await this.financeReport.getReport(staff, query);
    const csv = this.financeReport.toCsv(report);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="finance-report-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @RequirePermission("reports.export")
  @Get("finance/export.xlsx")
  async financeExportXlsx(@CurrentStaff() staff: StaffJwtPayload, @Res() res: Response, @Query() query: FinanceReportFilters) {
    const [report, meta] = await Promise.all([this.financeReport.getReport(staff, query), this.financeReport.getExportMeta(query.branchId)]);
    const buffer = await this.financeReportExport.toWorkbookBuffer(report, { ...meta, periodLabel: periodLabel(query.from, query.to) });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="finance-report-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  }

  @RequirePermission("reports.export")
  @Get("finance/export.pdf")
  async financeExportPdf(@CurrentStaff() staff: StaffJwtPayload, @Res() res: Response, @Query() query: FinanceReportFilters) {
    const [report, meta] = await Promise.all([this.financeReport.getReport(staff, query), this.financeReport.getExportMeta(query.branchId)]);
    const buffer = await this.financeReportExport.toPdfBuffer(report, { ...meta, periodLabel: periodLabel(query.from, query.to) });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="finance-report-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(buffer);
  }
}
