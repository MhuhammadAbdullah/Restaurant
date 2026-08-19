import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { createCouponSchema, updateCouponSchema, type CreateCouponInput, type UpdateCouponInput } from "@restaurant/validation";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CouponsService } from "./coupons.service";

@Controller("catalog/coupons")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @RequirePermission("coupons.view")
  @Get()
  async list() {
    const data = await this.coupons.list();
    return { success: true, data };
  }

  @RequirePermission("coupons.view")
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.coupons.findOne(id);
    return { success: true, data };
  }

  @RequirePermission("coupons.create")
  @Post()
  async create(@Body(new ZodValidationPipe(createCouponSchema)) body: CreateCouponInput) {
    const data = await this.coupons.create(body);
    return { success: true, data };
  }

  @RequirePermission("coupons.edit")
  @Patch(":id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateCouponSchema)) body: UpdateCouponInput) {
    const data = await this.coupons.update(id, body);
    return { success: true, data };
  }

  @RequirePermission("coupons.delete")
  @Delete(":id")
  async remove(@Param("id") id: string) {
    const data = await this.coupons.remove(id);
    return { success: true, data };
  }
}
