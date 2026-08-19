import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateAddonGroupInput, UpdateAddonGroupInput } from "@restaurant/validation";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../../common/restaurant/restaurant-context.service";

@Injectable()
export class AddonGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  async list() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.addonGroup.findMany({
      where: { restaurantId },
      include: { addons: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const group = await this.prisma.addonGroup.findUnique({
      where: { id },
      include: { addons: { orderBy: { sortOrder: "asc" } } },
    });
    if (!group) throw new NotFoundException({ code: "ADDON_GROUP_NOT_FOUND", message: "Addon group not found" });
    return group;
  }

  async create(input: CreateAddonGroupInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.addonGroup.create({
      data: {
        restaurantId,
        name: input.name,
        isRequired: input.isRequired,
        selectionType: input.selectionType,
        minSelect: input.minSelect,
        maxSelect: input.maxSelect,
      },
      include: { addons: true },
    });
  }

  async update(id: string, input: UpdateAddonGroupInput) {
    await this.findOne(id);
    return this.prisma.addonGroup.update({
      where: { id },
      data: {
        name: input.name,
        isRequired: input.isRequired,
        selectionType: input.selectionType,
        minSelect: input.minSelect,
        maxSelect: input.maxSelect,
      },
      include: { addons: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.addonGroup.delete({ where: { id } });
    return { deleted: true };
  }
}
