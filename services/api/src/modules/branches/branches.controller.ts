import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  assignDeliveryAreaSchema,
  createBranchSchema,
  createDeliveryAreaCatalogSchema,
  resolveBranchSchema,
  updateBranchSchema,
  updateDeliveryAreaCatalogSchema,
  updateDeliveryAreaLinkSchema,
  type AssignDeliveryAreaInput,
  type CreateBranchInput,
  type CreateDeliveryAreaCatalogInput,
  type ResolveBranchInput,
  type UpdateBranchInput,
  type UpdateDeliveryAreaCatalogInput,
  type UpdateDeliveryAreaLinkInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { BranchesService } from "./branches.service";
import { BranchResolutionService } from "./branch-resolution.service";

@Controller("branches")
export class BranchesController {
  constructor(
    private readonly branches: BranchesService,
    private readonly resolution: BranchResolutionService,
    private readonly auditLogs: AuditLogService,
  ) {}

  @Public()
  @Get()
  async list() {
    const data = await this.branches.list();
    return { success: true, data };
  }

  @Public()
  @Post("resolve")
  async resolve(@Body(new ZodValidationPipe(resolveBranchSchema)) body: ResolveBranchInput) {
    const result = await this.resolution.resolve(body);
    return { success: true, data: result };
  }

  // Static segments below ("areas", "area-catalog") are declared before ":id" so they aren't swallowed as a branch id.
  @Public()
  @Get("areas")
  async areasByCity(@Query("city") city?: string) {
    const data = city ? await this.branches.listActiveAreasByCity(city) : [];
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.view")
  @Get("area-catalog")
  async listAreaCatalog(@Query("city") city?: string) {
    const data = await this.branches.listAreaCatalog(city);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.edit")
  @Post("area-catalog")
  async createAreaCatalogEntry(@Body(new ZodValidationPipe(createDeliveryAreaCatalogSchema)) body: CreateDeliveryAreaCatalogInput) {
    const data = await this.branches.createAreaCatalogEntry(body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.edit")
  @Patch("area-catalog/:areaId")
  async updateAreaCatalogEntry(
    @Param("areaId") areaId: string,
    @Body(new ZodValidationPipe(updateDeliveryAreaCatalogSchema)) body: UpdateDeliveryAreaCatalogInput,
  ) {
    const data = await this.branches.updateAreaCatalogEntry(areaId, body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.edit")
  @Delete("area-catalog/:areaId")
  async deleteAreaCatalogEntry(@Param("areaId") areaId: string) {
    const data = await this.branches.deleteAreaCatalogEntry(areaId);
    return { success: true, data };
  }

  @Public()
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.branches.findOne(id);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.create")
  @Post()
  async create(@Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchInput) {
    const data = await this.branches.create(body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.edit")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const data = await this.branches.update(id, body);
    await this.auditLogs.recordForStaff(staff, "branch.update", "Branch", id, { newValue: body }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.delete")
  @Delete(":id")
  async remove(@Param("id") id: string) {
    const data = await this.branches.remove(id);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.view")
  @Get(":id/delivery-areas")
  async listDeliveryAreas(@Param("id") id: string) {
    const data = await this.branches.listDeliveryAreas(id);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.edit")
  @Post(":id/delivery-areas")
  async assignDeliveryArea(@Param("id") id: string, @Body(new ZodValidationPipe(assignDeliveryAreaSchema)) body: AssignDeliveryAreaInput) {
    const data = await this.branches.assignDeliveryArea(id, body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.edit")
  @Patch(":id/delivery-areas/:linkId")
  async updateDeliveryAreaLink(
    @Param("id") id: string,
    @Param("linkId") linkId: string,
    @Body(new ZodValidationPipe(updateDeliveryAreaLinkSchema)) body: UpdateDeliveryAreaLinkInput,
  ) {
    const data = await this.branches.updateDeliveryAreaLink(id, linkId, body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("branches.edit")
  @Delete(":id/delivery-areas/:linkId")
  async removeDeliveryAreaLink(@Param("id") id: string, @Param("linkId") linkId: string) {
    const data = await this.branches.removeDeliveryAreaLink(id, linkId);
    return { success: true, data };
  }
}
