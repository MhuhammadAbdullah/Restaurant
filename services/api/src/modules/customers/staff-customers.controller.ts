import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  adjustLoyaltySchema,
  updateCustomerEmailSchema,
  updateCustomerStatusSchema,
  type AdjustLoyaltyInput,
  type UpdateCustomerEmailInput,
  type UpdateCustomerStatusInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CustomersService } from "./customers.service";

@Controller("staff/customers")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class StaffCustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly auditLogs: AuditLogService,
  ) {}

  @RequirePermission("customers.view")
  @Get()
  async list(@Query("search") search?: string, @Query("status") status?: "registered" | "guest") {
    const data = await this.customers.listForStaff(search, status);
    return { success: true, data };
  }

  /** Paginated list. Declared before `:id` so "page" is never read as a customer id. */
  @RequirePermission("customers.view")
  @Get("page")
  async listPage(
    @Query("search") search?: string,
    @Query("status") status?: "registered" | "guest",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const data = await this.customers.listForStaffPaged(search, status, Number(page) || 1, Number(pageSize) || 50);
    return { success: true, data };
  }

  @RequirePermission("customers.view")
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.customers.getForStaff(id);
    return { success: true, data };
  }

  @RequirePermission("customers.edit")
  @Patch(":id/email")
  async setEmail(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerEmailSchema)) body: UpdateCustomerEmailInput,
    @Req() req: Request,
  ) {
    const data = await this.customers.setEmailForStaff(id, body.email);
    await this.auditLogs.recordForStaff(staff, "customer.emailSet", "Customer", data.id, { newValue: { email: body.email } }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @RequirePermission("customers.block")
  @Patch(":id/status")
  async setStatus(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerStatusSchema)) body: UpdateCustomerStatusInput,
    @Req() req: Request,
  ) {
    const data = await this.customers.setStatus(id, body.status);
    await this.auditLogs.recordForStaff(
      staff,
      body.status === "INACTIVE" ? "customer.block" : "customer.unblock",
      "Customer",
      id,
      { newValue: body },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    return { success: true, data };
  }

  @RequirePermission("loyalty.adjust")
  @Post(":id/loyalty/adjust")
  async adjustLoyalty(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adjustLoyaltySchema)) body: AdjustLoyaltyInput,
    @Req() req: Request,
  ) {
    const data = await this.customers.adjustLoyalty(id, body, staff);
    await this.auditLogs.recordForStaff(
      staff,
      "loyalty.adjust",
      "LoyaltyAccount",
      id,
      { newValue: body },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    return { success: true, data };
  }
}
