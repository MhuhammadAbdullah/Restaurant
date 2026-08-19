import { Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { KitchenService } from "./kitchen.service";

@Controller("kitchen")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
@RequirePermission("kitchen.access")
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get("orders")
  async list(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId: string) {
    const data = await this.kitchen.listOrders(staff, branchId);
    return { success: true, data };
  }

  @RequirePermission("kitchen.updateStatus")
  @Patch("orders/:id/start-preparing")
  async startPreparing(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const data = await this.kitchen.startPreparing(staff, id);
    return { success: true, data };
  }

  @RequirePermission("kitchen.updateStatus")
  @Patch("orders/:id/mark-ready")
  async markReady(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const data = await this.kitchen.markReady(staff, id);
    return { success: true, data };
  }

  @RequirePermission("kitchen.updateStatus")
  @Patch("orders/:id/complete")
  async markCompleted(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const data = await this.kitchen.markCompleted(staff, id);
    return { success: true, data };
  }
}
