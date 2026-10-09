import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  createStaffUserSchema,
  updateStaffUserSchema,
  setStaffPermissionOverridesSchema,
  type CreateStaffUserInput,
  type UpdateStaffUserInput,
  type SetStaffPermissionOverridesInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { StaffService } from "./staff.service";
import { StaffPermissionsService } from "./staff-permissions.service";

@Controller("staff")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly staffPermissions: StaffPermissionsService,
    private readonly auditLogs: AuditLogService,
  ) {}

  @RequirePermission("staff.view")
  @Get()
  async list(
    @Query("search") search?: string,
    @Query("roleId") roleId?: string,
    @Query("status") status?: "ACTIVE" | "INACTIVE",
  ) {
    const data = await this.staff.list({ search, roleId, status });
    return { success: true, data };
  }

  @RequirePermission("staff.view")
  @Get("roles")
  async listRoles() {
    const data = await this.staff.listRoles();
    return { success: true, data };
  }

  // Static two-segment route, registered before the dynamic ":id" routes below so it isn't
  // shadowed — same convention already used for "roles" ahead of ":id".
  @RequirePermission("staff.view")
  @Get("permissions/catalog")
  async permissionsCatalog() {
    const data = this.staffPermissions.listCatalogGroupedByModule();
    return { success: true, data };
  }

  @RequirePermission("staff.view")
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.staff.findOne(id);
    return { success: true, data };
  }

  @RequirePermission("staff.view")
  @Get(":id/permissions")
  async effectivePermissions(@Param("id") id: string) {
    const data = await this.staffPermissions.getEffectivePermissions(id);
    return { success: true, data };
  }

  @RequirePermission("permissions.manage")
  @Patch(":id/permissions")
  async setPermissions(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setStaffPermissionOverridesSchema)) body: SetStaffPermissionOverridesInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const before = await this.staffPermissions.getEffectivePermissions(id);
    const beforeByKey = new Map(before.map((p) => [p.key, p.granted]));
    const data = await this.staffPermissions.setOverrides(id, body.overrides, staff);

    await this.auditLogs.recordForStaff(
      staff,
      "staff.permissionOverride",
      "StaffUser",
      id,
      {
        oldValue: body.overrides.map((o) => ({ key: o.key, granted: beforeByKey.get(o.key) ?? false })),
        newValue: body.overrides,
      },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    return { success: true, data };
  }

  @RequirePermission("staff.create")
  @Post()
  async create(
    @Body(new ZodValidationPipe(createStaffUserSchema)) body: CreateStaffUserInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const data = await this.staff.create(body);
    await this.auditLogs.recordForStaff(
      staff,
      "staff.create",
      "StaffUser",
      data.id,
      { newValue: { name: body.name, email: body.email, phone: body.phone, roleId: body.roleId, allBranchesAccess: body.allBranchesAccess ?? false } },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    return { success: true, data };
  }

  @RequirePermission("staff.edit")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStaffUserSchema)) body: UpdateStaffUserInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const { before, after } = await this.staff.update(id, body, staff);
    const requestMeta = { ip: req.ip, userAgent: req.headers["user-agent"] };

    if (body.roleId !== undefined && body.roleId !== before.roleId) {
      await this.auditLogs.recordForStaff(
        staff,
        "staff.roleChange",
        "StaffUser",
        id,
        { oldValue: { roleId: before.roleId, roleName: before.role.name }, newValue: { roleId: after.roleId, roleName: after.role.name } },
        requestMeta,
      );
    }
    if (body.status !== undefined && body.status !== before.status) {
      await this.auditLogs.recordForStaff(
        staff,
        "staff.statusChange",
        "StaffUser",
        id,
        { oldValue: { status: before.status }, newValue: { status: after.status } },
        requestMeta,
      );
    }
    const branchAccessChanged =
      (body.allBranchesAccess !== undefined && body.allBranchesAccess !== before.allBranchesAccess) || body.branchIds !== undefined;
    if (branchAccessChanged) {
      await this.auditLogs.recordForStaff(
        staff,
        "staff.branchAccessChange",
        "StaffUser",
        id,
        {
          oldValue: { branchIds: before.branchAssignments.map((a) => a.branchId), allBranchesAccess: before.allBranchesAccess },
          newValue: { branchIds: after.branchAssignments.map((a) => a.branchId), allBranchesAccess: after.allBranchesAccess },
        },
        requestMeta,
      );
    }
    if (body.password) {
      await this.auditLogs.recordForStaff(staff, "staff.passwordReset", "StaffUser", id, undefined, requestMeta);
    }
    if (body.name !== undefined || body.email !== undefined || body.phone !== undefined) {
      await this.auditLogs.recordForStaff(
        staff,
        "staff.update",
        "StaffUser",
        id,
        { newValue: { name: body.name, email: body.email, phone: body.phone } },
        requestMeta,
      );
    }

    // Never send credential hashes back to the browser.
    const { passwordHash: _ph, refreshTokenHash: _rh, ...safe } = after;
    return { success: true, data: safe };
  }

  @RequirePermission("staff.delete")
  @Delete(":id")
  async remove(@Param("id") id: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    await this.staff.remove(id, staff);
    await this.auditLogs.recordForStaff(staff, "staff.delete", "StaffUser", id, undefined, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true };
  }
}
