import { Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { recipeGuideSchema, type RecipeGuideInput } from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { RecipesService } from "./recipes.service";

/** Kitchen recipes: how to prepare each product. Kitchen staff can read them; writing needs the recipe or product edit permission. */
@Controller("recipes")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class RecipesController {
  constructor(
    private readonly recipes: RecipesService,
    private readonly audit: AuditLogService,
  ) {}

  @RequirePermission("kitchen.access", "inventoryRecipes.view", "products.view")
  @Get()
  async list() {
    return { success: true, data: await this.recipes.list() };
  }

  @RequirePermission("kitchen.access", "inventoryRecipes.view", "products.view")
  @Get(":productId")
  async get(@Param("productId") productId: string) {
    return { success: true, data: await this.recipes.get(productId) };
  }

  @RequirePermission("inventoryRecipes.create", "inventoryRecipes.edit", "products.edit")
  @Put(":productId")
  async save(@Param("productId") productId: string, @Body(new ZodValidationPipe(recipeGuideSchema)) body: RecipeGuideInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.recipes.save(productId, body, staff.sub);
    await this.audit.recordForStaff(staff, "recipe.save", "RecipeGuide", productId, { newValue: { steps: body.steps.length, ingredients: body.ingredients.length } }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @RequirePermission("inventoryRecipes.delete", "products.edit")
  @Delete(":productId")
  async remove(@Param("productId") productId: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    await this.recipes.remove(productId);
    await this.audit.recordForStaff(staff, "recipe.delete", "RecipeGuide", productId, {}, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data: { productId } };
  }
}
