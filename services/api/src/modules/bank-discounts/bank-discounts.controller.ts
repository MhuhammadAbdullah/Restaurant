import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  bankDiscountsSettingsSchema,
  createBankDiscountSchema,
  reorderBankDiscountsSchema,
  updateBankDiscountSchema,
  type BankDiscountsSettings,
  type CreateBankDiscountInput,
  type ReorderBankDiscountsInput,
  type UpdateBankDiscountInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { Public } from "../auth/decorators/public.decorator";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { BankDiscountsService } from "./bank-discounts.service";

@Controller("bank-discounts")
export class BankDiscountsController {
  constructor(
    private readonly service: BankDiscountsService,
    private readonly auditLogs: AuditLogService,
  ) {}

  @Public()
  @Get()
  async publicPage() {
    return { success: true, data: await this.service.getPublic() };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.view")
  @Get("admin")
  async adminList() {
    return { success: true, data: await this.service.adminList() };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.edit")
  @Put("admin/settings")
  async saveSettings(@Body(new ZodValidationPipe(bankDiscountsSettingsSchema)) body: BankDiscountsSettings, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.service.saveSettings(body);
    await this.auditLogs.recordForStaff(staff, "bankDiscounts.settings", "Restaurant", "settings", { newValue: data }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.edit")
  @Put("admin/reorder")
  async reorder(@Body(new ZodValidationPipe(reorderBankDiscountsSchema)) body: ReorderBankDiscountsInput) {
    await this.service.reorder(body.ids);
    return { success: true, data: { ok: true } };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.create")
  @Post("admin/items")
  async create(@Body(new ZodValidationPipe(createBankDiscountSchema)) body: CreateBankDiscountInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.service.create(body);
    await this.auditLogs.recordForStaff(staff, "bankDiscount.create", "BankDiscount", data.id, { newValue: { name: data.name } }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.edit")
  @Patch("admin/items/:id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateBankDiscountSchema)) body: UpdateBankDiscountInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.service.update(id, body);
    await this.auditLogs.recordForStaff(staff, "bankDiscount.update", "BankDiscount", id, { newValue: body }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.delete")
  @Delete("admin/items/:id")
  async remove(@Param("id") id: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    await this.service.remove(id);
    await this.auditLogs.recordForStaff(staff, "bankDiscount.delete", "BankDiscount", id, {}, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data: { id } };
  }
}
