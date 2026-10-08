import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { createTableSchema, updateTableSchema, type CreateTableInput, type UpdateTableInput } from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { TablesService } from "./tables.service";

@Controller("tables")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @RequirePermission("tables.view")
  @Get()
  async list(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId?: string) {
    const data = await this.tables.list(staff, branchId);
    return { success: true, data };
  }

  @RequirePermission("tables.view")
  @Get("overview")
  async overview(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId?: string) {
    const data = await this.tables.overview(staff, branchId);
    return { success: true, data };
  }

  @RequirePermission("tables.create")
  @Post()
  async create(@CurrentStaff() staff: StaffJwtPayload, @Body(new ZodValidationPipe(createTableSchema)) body: CreateTableInput) {
    const data = await this.tables.create(staff, body);
    return { success: true, data };
  }

  @RequirePermission("tables.edit")
  @Patch(":id")
  async update(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTableSchema)) body: UpdateTableInput,
  ) {
    const data = await this.tables.update(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("tables.delete")
  @Delete(":id")
  async remove(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const data = await this.tables.remove(staff, id);
    return { success: true, data };
  }
}
