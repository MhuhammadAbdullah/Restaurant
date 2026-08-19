import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  categoriesReorderSchema,
  createCategorySchema,
  setBranchAvailabilitySchema,
  setMainPageProductsSchema,
  updateCategorySchema,
  type CategoriesReorderInput,
  type CreateCategoryInput,
  type SetBranchAvailabilityInput,
  type SetMainPageProductsInput,
  type UpdateCategoryInput,
} from "@restaurant/validation";
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../../auth/guards/permissions.guard";
import { BranchScopeGuard } from "../../auth/guards/branch-scope.guard";
import { RequirePermission } from "../../auth/decorators/require-permission.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { CategoriesService } from "./categories.service";

@Controller("catalog/categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  async list(@Query("branchId") branchId?: string) {
    const data = await this.categories.list(branchId);
    return { success: true, data };
  }

  @Public()
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.categories.findOne(id);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("categories.create")
  @Post()
  async create(@Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput) {
    const data = await this.categories.create(body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("categories.edit")
  @Patch("reorder")
  async reorder(@Body(new ZodValidationPipe(categoriesReorderSchema)) body: CategoriesReorderInput) {
    const data = await this.categories.reorder(body.orderedIds);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("categories.edit")
  @Patch(":id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput) {
    const data = await this.categories.update(id, body);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("categories.view")
  @Get(":id/products")
  async listProducts(@Param("id") id: string) {
    const data = await this.categories.listProducts(id);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("categories.edit")
  @Patch(":id/main-page-products")
  async setMainPageProducts(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setMainPageProductsSchema)) body: SetMainPageProductsInput,
  ) {
    const data = await this.categories.setMainPageProducts(id, body.productIds);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("categories.delete")
  @Delete(":id")
  async remove(@Param("id") id: string) {
    const data = await this.categories.remove(id);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard, BranchScopeGuard)
  @RequirePermission("categories.edit")
  @Patch(":id/branch-availability")
  async setBranchAvailability(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setBranchAvailabilitySchema)) body: SetBranchAvailabilityInput,
  ) {
    const data = await this.categories.setBranchAvailability(id, body);
    return { success: true, data };
  }
}
