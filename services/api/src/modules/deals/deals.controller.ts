import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  createDealSchema,
  dealPricePreviewSchema,
  setBranchAvailabilitySchema,
  updateDealSchema,
  type CreateDealInput,
  type DealPricePreviewInput,
  type SetBranchAvailabilityInput,
  type UpdateDealInput,
} from "@restaurant/validation";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { BranchScopeGuard } from "../auth/guards/branch-scope.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { DealsService } from "./deals.service";
import { DealPricingService } from "./deal-pricing.service";

@Controller("deals")
export class DealsController {
  constructor(
    private readonly deals: DealsService,
    private readonly pricing: DealPricingService,
  ) {}

  @Public()
  @Get()
  async list(@Query("branchId") branchId?: string) {
    const data = await this.deals.list(branchId);
    return { success: true, data };
  }

  @Public()
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.deals.findOne(id);
    return { success: true, data };
  }

  @Public()
  @Post(":id/price-preview")
  async pricePreview(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(dealPricePreviewSchema)) body: DealPricePreviewInput,
  ) {
    const data = await this.pricing.priceSelections(id, body.selections);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("deals.create")
  @Post()
  async create(@Body(new ZodValidationPipe(createDealSchema)) body: CreateDealInput) {
    const data = await this.deals.create(body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("deals.edit")
  @Patch(":id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateDealSchema)) body: UpdateDealInput) {
    const data = await this.deals.update(id, body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("deals.delete")
  @Delete(":id")
  async remove(@Param("id") id: string) {
    const data = await this.deals.remove(id);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("deals.create")
  @Post(":id/duplicate")
  async duplicate(@Param("id") id: string) {
    const data = await this.deals.duplicate(id);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard, BranchScopeGuard)
  @RequirePermission("deals.edit")
  @Patch(":id/branch-availability")
  async setBranchAvailability(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setBranchAvailabilitySchema)) body: SetBranchAvailabilityInput,
  ) {
    const data = await this.deals.setBranchAvailability(id, body);
    return { success: true, data };
  }
}
