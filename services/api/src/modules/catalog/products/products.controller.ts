import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  createProductSchema,
  listProductsQuerySchema,
  setBranchAvailabilitySchema,
  updateProductSchema,
  type CreateProductInput,
  type ListProductsQuery,
  type SetBranchAvailabilityInput,
  type UpdateProductInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../../auth/guards/permissions.guard";
import { BranchScopeGuard } from "../../auth/guards/branch-scope.guard";
import { RequirePermission } from "../../auth/decorators/require-permission.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { CurrentStaff } from "../../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../../audit-logs/audit-log.service";
import { ProductsService } from "./products.service";

@Controller("catalog/products")
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly auditLogs: AuditLogService,
  ) {}

  @Public()
  @Get()
  async list(@Query(new ZodValidationPipe(listProductsQuerySchema)) query: ListProductsQuery) {
    const data = await this.products.list(query);
    return { success: true, data };
  }

  @Public()
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.products.findOne(id);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("products.create")
  @Post()
  async create(@Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput) {
    const data = await this.products.create(body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("products.edit")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const before = await this.products.findOne(id);
    const data = await this.products.update(id, body);
    await this.auditLogs.recordForStaff(
      staff,
      "product.update",
      "Product",
      id,
      { oldValue: { basePrice: before.basePrice, discountPrice: before.discountPrice, status: before.status }, newValue: { basePrice: data.basePrice, discountPrice: data.discountPrice, status: data.status } },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("products.delete")
  @Delete(":id")
  async remove(@Param("id") id: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.products.remove(id);
    await this.auditLogs.recordForStaff(staff, "product.delete", "Product", id, undefined, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard, BranchScopeGuard)
  @RequirePermission("products.edit")
  @Patch(":id/branch-availability")
  async setBranchAvailability(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setBranchAvailabilitySchema)) body: SetBranchAvailabilityInput,
  ) {
    const data = await this.products.setBranchAvailability(id, body);
    return { success: true, data };
  }
}
