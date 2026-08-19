import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { createRecommendationSchema, type CreateRecommendationInput } from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../../auth/guards/permissions.guard";
import { RequirePermission } from "../../auth/decorators/require-permission.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { CurrentStaff } from "../../auth/decorators/current-staff.decorator";
import { RecommendationsService } from "./recommendations.service";

function assertBranchAccess(staff: StaffJwtPayload, branchId: string | null) {
  if (staff.isOwner || !branchId) return;
  if (!staff.branchIds.includes(branchId)) {
    throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this branch" });
  }
}

@Controller("catalog/recommendations")
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Public()
  @Get()
  async get(
    @Query("branchId") branchId?: string,
    @Query("productId") productId?: string,
    // Comma-separated cart product ids — when present, recommendations are related to the whole
    // cart's categories (and exclude what's already carted) instead of one source product.
    @Query("productIds") productIds?: string,
    @Query("limit") limit = "8",
  ) {
    const take = Math.min(Number(limit) || 8, 20);
    const cartIds = productIds
      ? productIds.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const data =
      cartIds.length > 0
        ? await this.recommendations.getForCart(cartIds, branchId, take)
        : productId
          ? await this.recommendations.getForProduct(productId, branchId, take)
          : await this.recommendations.getGeneral(branchId, take);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("products.edit")
  @Get("manual")
  async listManual(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId?: string) {
    if (branchId) assertBranchAccess(staff, branchId);
    const data = await this.recommendations.listManual(branchId);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("products.edit")
  @Post("manual")
  async createManual(
    @CurrentStaff() staff: StaffJwtPayload,
    @Body(new ZodValidationPipe(createRecommendationSchema)) body: CreateRecommendationInput,
  ) {
    assertBranchAccess(staff, body.branchId ?? null);
    const data = await this.recommendations.createManual(body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("products.edit")
  @Delete("manual/:id")
  async removeManual(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const existing = await this.recommendations.findManualOrThrow(id);
    assertBranchAccess(staff, existing.branchId);
    const data = await this.recommendations.removeManual(id);
    return { success: true, data };
  }
}
