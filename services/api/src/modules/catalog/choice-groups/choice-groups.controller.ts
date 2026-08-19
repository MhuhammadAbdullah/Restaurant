import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  choiceGroupsReorderSchema,
  createChoiceGroupSchema,
  updateChoiceGroupSchema,
  type ChoiceGroupsReorderInput,
  type CreateChoiceGroupInput,
  type UpdateChoiceGroupInput,
} from "@restaurant/validation";
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../../auth/guards/permissions.guard";
import { RequirePermission } from "../../auth/decorators/require-permission.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { ChoiceGroupsService } from "./choice-groups.service";

@Controller("catalog/choice-groups")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class ChoiceGroupsController {
  constructor(private readonly choiceGroups: ChoiceGroupsService) {}

  @Public()
  @Get()
  async list() {
    const data = await this.choiceGroups.list();
    return { success: true, data };
  }

  @Public()
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.choiceGroups.findOne(id);
    return { success: true, data };
  }

  @RequirePermission("choiceGroups.create")
  @Post()
  async create(@Body(new ZodValidationPipe(createChoiceGroupSchema)) body: CreateChoiceGroupInput) {
    const data = await this.choiceGroups.create(body);
    return { success: true, data };
  }

  @RequirePermission("choiceGroups.edit")
  @Patch("reorder")
  async reorder(@Body(new ZodValidationPipe(choiceGroupsReorderSchema)) body: ChoiceGroupsReorderInput) {
    const data = await this.choiceGroups.reorder(body.orderedIds);
    return { success: true, data };
  }

  @RequirePermission("choiceGroups.edit")
  @Patch(":id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateChoiceGroupSchema)) body: UpdateChoiceGroupInput) {
    const data = await this.choiceGroups.update(id, body);
    return { success: true, data };
  }

  @RequirePermission("choiceGroups.delete")
  @Delete(":id")
  async remove(@Param("id") id: string) {
    const data = await this.choiceGroups.remove(id);
    return { success: true, data };
  }
}
