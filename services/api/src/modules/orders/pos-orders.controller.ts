import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  createPosOrderSchema,
  previewCouponSchema,
  quotePosOrderSchema,
  type CreatePosOrderInput,
  type PreviewCouponInput,
  type QuotePosOrderInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { BranchScopeGuard } from "../auth/guards/branch-scope.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { OrdersService } from "./orders.service";

@Controller("pos/orders")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class PosOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @RequirePermission("pos.access")
  @Post()
  async create(@CurrentStaff() staff: StaffJwtPayload, @Body(new ZodValidationPipe(createPosOrderSchema)) body: CreatePosOrderInput) {
    const data = await this.orders.createPosOrder(staff, body);
    return { success: true, data };
  }

  @RequirePermission("pos.access")
  @Post("quote")
  async quote(@CurrentStaff() staff: StaffJwtPayload, @Body(new ZodValidationPipe(quotePosOrderSchema)) body: QuotePosOrderInput) {
    const data = await this.orders.quotePosOrder(staff, body);
    return { success: true, data };
  }

  @RequirePermission("pos.access")
  @Post("coupon-preview")
  async previewCoupon(@Body(new ZodValidationPipe(previewCouponSchema)) body: PreviewCouponInput) {
    const data = await this.orders.previewCoupon(body.branchId, body.code, body.items);
    return { success: true, data };
  }
}
