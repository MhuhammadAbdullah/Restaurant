import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateChoiceGroupInput, UpdateChoiceGroupInput } from "@restaurant/validation";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../../common/restaurant/restaurant-context.service";

@Injectable()
export class ChoiceGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  async list() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.choiceGroup.findMany({
      where: { restaurantId },
      include: { options: { orderBy: { sortOrder: "asc" }, include: { outOfStock: { select: { branchId: true } } } } },
      orderBy: { sortOrder: "asc" },
    });
  }

  async findOne(id: string) {
    const group = await this.prisma.choiceGroup.findUnique({
      where: { id },
      include: { options: { orderBy: { sortOrder: "asc" }, include: { outOfStock: { select: { branchId: true } } } } },
    });
    if (!group) throw new NotFoundException({ code: "CHOICE_GROUP_NOT_FOUND", message: "Choice group not found" });
    return group;
  }

  /** Marks an option out of stock ("Not available") at one branch, or back in stock. */
  async setOptionStock(optionId: string, branchId: string, isAvailable: boolean) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const option = await this.prisma.choiceOption.findUnique({ where: { id: optionId }, include: { choiceGroup: { select: { restaurantId: true } } } });
    if (!option || option.choiceGroup.restaurantId !== restaurantId) {
      throw new NotFoundException({ code: "CHOICE_OPTION_NOT_FOUND", message: "Option not found" });
    }
    if (isAvailable) {
      await this.prisma.choiceOptionOutOfStock.deleteMany({ where: { choiceOptionId: optionId, branchId } });
    } else {
      await this.prisma.choiceOptionOutOfStock.upsert({
        where: { choiceOptionId_branchId: { choiceOptionId: optionId, branchId } },
        create: { choiceOptionId: optionId, branchId },
        update: {},
      });
    }
    return { choiceOptionId: optionId, branchId, isAvailable };
  }

  async create(input: CreateChoiceGroupInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.choiceGroup.create({
      data: {
        restaurantId,
        name: input.name,
        internalName: input.internalName || null,
        priceReplacesBase: input.selectionType === "MULTIPLE" ? false : input.priceReplacesBase,
        description: input.description,
        isRequired: input.isRequired,
        selectionType: input.selectionType,
        minSelect: input.minSelect,
        maxSelect: input.maxSelect,
        sortOrder: input.sortOrder,
        options: {
          create: input.options.map((o) => ({
            name: o.name,
            description: o.description,
            image: o.image,
            priceAdjustment: o.useListingPrice ? 0 : o.priceAdjustment,
            discountPriceAdjustment: o.useListingPrice ? null : o.discountPriceAdjustment,
            useListingPrice: o.useListingPrice,
            showPrice: o.showPrice,
            sortOrder: o.sortOrder,
            status: o.status,
          })),
        },
      },
      include: { options: true },
    });
  }

  async update(id: string, input: UpdateChoiceGroupInput) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      if (input.options) {
        const keepIds = input.options.filter((o) => o.id).map((o) => o.id!);
        await tx.choiceOption.deleteMany({ where: { choiceGroupId: id, id: { notIn: keepIds } } });
        for (const option of input.options) {
          if (option.id) {
            await tx.choiceOption.update({
              where: { id: option.id },
              data: {
                name: option.name,
                description: option.description ?? null,
                image: option.image,
                priceAdjustment: option.useListingPrice ? 0 : option.priceAdjustment,
                discountPriceAdjustment: option.useListingPrice ? null : option.discountPriceAdjustment,
                useListingPrice: option.useListingPrice,
                showPrice: option.showPrice,
                sortOrder: option.sortOrder,
                status: option.status,
              },
            });
          } else {
            await tx.choiceOption.create({
              data: {
                choiceGroupId: id,
                name: option.name,
                description: option.description ?? null,
                image: option.image,
                priceAdjustment: option.useListingPrice ? 0 : option.priceAdjustment,
                discountPriceAdjustment: option.useListingPrice ? null : option.discountPriceAdjustment,
                useListingPrice: option.useListingPrice,
                showPrice: option.showPrice,
                sortOrder: option.sortOrder,
                status: option.status,
              },
            });
          }
        }
      }

      return tx.choiceGroup.update({
        where: { id },
        data: {
          name: input.name,
          ...(input.internalName !== undefined ? { internalName: input.internalName || null } : {}),
          ...(input.priceReplacesBase !== undefined ? { priceReplacesBase: input.selectionType === "MULTIPLE" ? false : input.priceReplacesBase } : {}),
          description: input.description,
          isRequired: input.isRequired,
          selectionType: input.selectionType,
          minSelect: input.minSelect,
          maxSelect: input.maxSelect,
          sortOrder: input.sortOrder,
          status: input.status,
        },
        include: { options: { orderBy: { sortOrder: "asc" }, include: { outOfStock: { select: { branchId: true } } } } },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.choiceGroup.delete({ where: { id } });
    return { deleted: true };
  }

  async reorder(orderedIds: string[]) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.choiceGroup.update({ where: { id, restaurantId }, data: { sortOrder: index } }),
      ),
    );
    return { reordered: true };
  }
}
