import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  addonsReorderSchema,
  createAddonSchema,
  updateAddonSchema,
  type AddonsReorderInput,
  type CreateAddonInput,
  type UpdateAddonInput,
} from "@restaurant/validation";
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../../auth/guards/permissions.guard";
import { RequirePermission } from "../../auth/decorators/require-permission.decorator";
import { AddonsService } from "./addons.service";

@Controller("catalog/addons")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class AddonsController {
  constructor(private readonly addons: AddonsService) {}

  @RequirePermission("addonGroups.view")
  @Get()
  async list(@Query("addonGroupId") addonGroupId?: string) {
    const data = await this.addons.list(addonGroupId);
    return { success: true, data };
  }

  @RequirePermission("addonGroups.view")
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.addons.findOne(id);
    return { success: true, data };
  }

  @RequirePermission("addonGroups.create")
  @Post()
  async create(@Body(new ZodValidationPipe(createAddonSchema)) body: CreateAddonInput) {
    const data = await this.addons.create(body);
    return { success: true, data };
  }

  @RequirePermission("addonGroups.edit")
  @Patch("reorder")
  async reorder(@Body(new ZodValidationPipe(addonsReorderSchema)) body: AddonsReorderInput) {
    const data = await this.addons.reorder(body.orderedIds);
    return { success: true, data };
  }

  @RequirePermission("addonGroups.edit")
  @Patch(":id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateAddonSchema)) body: UpdateAddonInput) {
    const data = await this.addons.update(id, body);
    return { success: true, data };
  }

  @RequirePermission("addonGroups.delete")
  @Delete(":id")
  async remove(@Param("id") id: string) {
    const data = await this.addons.remove(id);
    return { success: true, data };
  }
}
