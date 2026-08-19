import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { RidersService } from "./riders.service";

@Controller("staff/riders")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class RidersController {
  constructor(private readonly riders: RidersService) {}

  @RequirePermission("riders.view")
  @Get()
  async list(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("branchId") branchId?: string,
    @Query("search") search?: string,
    @Query("status") status?: "ACTIVE" | "INACTIVE",
  ) {
    const data = await this.riders.list(staff, { branchId, search, status });
    return { success: true, data };
  }

  // No @RequirePermission — self-scoped to the caller's own assigned orders (see RidersService.myOrders).
  @Get("me/orders")
  async myOrders(@CurrentStaff() staff: StaffJwtPayload) {
    const data = await this.riders.myOrders(staff);
    return { success: true, data };
  }

  // No @RequirePermission — a rider submitting their own collection needs no admin permission.
  @Post("me/collection-submissions")
  async submitMyCollection(@CurrentStaff() staff: StaffJwtPayload, @Body("date") date?: string) {
    const data = await this.riders.submitCollection(staff, date);
    return { success: true, data };
  }

  // No @RequirePermission — self-scoped.
  @Get("me/collection-summary")
  async myCollectionSummary(@CurrentStaff() staff: StaffJwtPayload, @Query("date") date?: string) {
    const data = await this.riders.collectionSummary(staff, staff.sub, date);
    return { success: true, data };
  }

  // No @RequirePermission — self-scoped.
  @Get("me/collection-submissions")
  async myCollectionSubmissions(@CurrentStaff() staff: StaffJwtPayload, @Query("from") from?: string, @Query("to") to?: string) {
    const data = await this.riders.collectionSubmissions(staff, staff.sub, { from, to });
    return { success: true, data };
  }

  @RequirePermission("riders.view")
  @Get(":id")
  async get(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const data = await this.riders.get(staff, id);
    return { success: true, data };
  }

  @RequirePermission("riders.view")
  @Get(":id/stats")
  async stats(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string, @Query("date") date?: string) {
    const data = await this.riders.stats(staff, id, date);
    return { success: true, data };
  }

  @RequirePermission("riders.view")
  @Get(":id/deliveries")
  async deliveries(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Query("status") status?: "pending" | "delivered",
    @Query("date") date?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const data = await this.riders.deliveries(staff, id, { status, date, from, to });
    return { success: true, data };
  }

  @RequirePermission("riders.view")
  @Get(":id/collection-summary")
  async collectionSummary(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string, @Query("date") date?: string) {
    const data = await this.riders.collectionSummary(staff, id, date);
    return { success: true, data };
  }

  @RequirePermission("riders.view")
  @Get(":id/collection-submissions")
  async collectionSubmissions(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const data = await this.riders.collectionSubmissions(staff, id, { from, to });
    return { success: true, data };
  }
}
