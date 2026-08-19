import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  createAddonGroupSchema,
  updateAddonGroupSchema,
  type CreateAddonGroupInput,
  type UpdateAddonGroupInput,
} from "@restaurant/validation";
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../../auth/guards/permissions.guard";
import { RequirePermission } from "../../auth/decorators/require-permission.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { AddonGroupsService } from "./addon-groups.service";

@Controller("catalog/addon-groups")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class AddonGroupsController {
  constructor(private readonly addonGroups: AddonGroupsService) {}

  @Public()
  @Get()
  async list() {
    const data = await this.addonGroups.list();
    return { success: true, data };
  }

  @Public()
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.addonGroups.findOne(id);
    return { success: true, data };
  }

  @RequirePermission("addonGroups.create")
  @Post()
  async create(@Body(new ZodValidationPipe(createAddonGroupSchema)) body: CreateAddonGroupInput) {
    const data = await this.addonGroups.create(body);
    return { success: true, data };
  }

  @RequirePermission("addonGroups.edit")
  @Patch(":id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateAddonGroupSchema)) body: UpdateAddonGroupInput) {
    const data = await this.addonGroups.update(id, body);
    return { success: true, data };
  }

  @RequirePermission("addonGroups.delete")
  @Delete(":id")
  async remove(@Param("id") id: string) {
    const data = await this.addonGroups.remove(id);
    return { success: true, data };
  }
}
