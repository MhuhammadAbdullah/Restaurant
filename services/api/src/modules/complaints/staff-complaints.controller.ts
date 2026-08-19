import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  addComplaintMessageSchema,
  assignComplaintSchema,
  updateComplaintStatusSchema,
  type AddComplaintMessageInput,
  type AssignComplaintInput,
  type UpdateComplaintStatusInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import type { ComplaintCategory, ComplaintStatus } from "@restaurant/database";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { ComplaintsService } from "./complaints.service";

@Controller("staff/complaints")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class StaffComplaintsController {
  constructor(
    private readonly complaints: ComplaintsService,
    private readonly auditLogs: AuditLogService,
  ) {}

  @RequirePermission("complaints.view")
  @Get()
  async list(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("branchId") branchId?: string,
    @Query("status") status?: ComplaintStatus,
    @Query("category") category?: ComplaintCategory,
    @Query("search") search?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const data = await this.complaints.listForStaff(staff, {
      branchId,
      status,
      category,
      search,
      from: from ? new Date(from) : undefined,
      // "to" is a date-only string from the date picker — extend it to end-of-day so that day's
      // complaints are actually included in the range instead of being cut off at midnight.
      to: to ? new Date(`${to}T23:59:59.999`) : undefined,
    });
    return { success: true, data };
  }

  @RequirePermission("complaints.view")
  @Get(":id")
  async findOne(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const data = await this.complaints.getForStaff(staff, id);
    return { success: true, data };
  }

  /** Unified status-history timeline — derived from AuditLog (no separate table), same branch scoping as the complaint itself. */
  @RequirePermission("complaints.view")
  @Get(":id/history")
  async history(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const data = await this.complaints.getHistory(staff, id);
    return { success: true, data };
  }

  @RequirePermission("complaints.assign")
  @Patch(":id/assign")
  async assign(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignComplaintSchema)) body: AssignComplaintInput,
  ) {
    const data = await this.complaints.assign(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("complaints.reply")
  @Post(":id/messages")
  async reply(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addComplaintMessageSchema)) body: AddComplaintMessageInput,
  ) {
    const data = await this.complaints.addStaffMessage(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("complaints.resolve")
  @Patch(":id/status")
  async updateStatus(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateComplaintStatusSchema)) body: UpdateComplaintStatusInput,
    @Req() req: Request,
  ) {
    const before = await this.complaints.getForStaff(staff, id);
    const data = await this.complaints.updateStatus(staff, id, body);
    await this.auditLogs.recordForStaff(
      staff,
      "complaint.statusChange",
      "Complaint",
      id,
      { oldValue: { status: before.status }, newValue: { status: body.status } },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    return { success: true, data };
  }
}
