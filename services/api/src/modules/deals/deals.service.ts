import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@restaurant/database";
import type { CreateDealInput, DealSlotInput, SetBranchAvailabilityInput, UpdateDealInput } from "@restaurant/validation";
import { generateCuidLikeId } from "@restaurant/utils";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

const DEAL_DETAIL_INCLUDE = {
  slots: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      productOptions: { include: { product: true } },
      choiceGroups: { include: { choiceGroup: { include: { options: { orderBy: { sortOrder: "asc" as const } } } } } },
      addons: { include: { addon: { include: { addonGroup: true } } }, orderBy: { sortOrder: "asc" as const } },
    },
  },
  branchAvailability: true,
};

// Interactive transactions default to a 5s timeout — writing several slots each with nested
// productOptions/choiceGroups/addons is many round trips against a remote DB, so give this
// some headroom rather than risk "Transaction already closed" under real network latency.
const SLOT_WRITE_TX_TIMEOUT_MS = 15000;

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  async list(branchId?: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.deal.findMany({
      where: {
        restaurantId,
        status: "ACTIVE",
        ...(branchId ? { branchAvailability: { some: { branchId, isAvailable: true } } } : {}),
      },
      include: DEAL_DETAIL_INCLUDE,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  }

  async findOne(id: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id }, include: DEAL_DETAIL_INCLUDE });
    if (!deal) throw new NotFoundException({ code: "DEAL_NOT_FOUND", message: "Deal not found" });
    return deal;
  }

  private assertDiscountValid(dealPrice: number, originalPrice: number | null | undefined) {
    if (originalPrice == null) return;
    if (originalPrice <= dealPrice) {
      throw new BadRequestException({
        code: "DISCOUNT_PRICE_INVALID",
        message: "Regular price must be greater than the deal price",
      });
    }
  }

  /**
   * Writes deal slots + their nested product/choice/addon attachments as a handful of batched
   * createMany calls (one per table) instead of one create-per-slot — avoids stacking up dozens
   * of sequential round trips against a remote DB inside a single transaction.
   */
  private async writeDealSlots(tx: Prisma.TransactionClient, dealId: string, slots: DealSlotInput[]) {
    const slotIds = slots.map(() => generateCuidLikeId());

    await tx.dealSlot.createMany({
      data: slots.map((slot, i) => ({
        id: slotIds[i]!,
        dealId,
        label: slot.label,
        quantity: slot.quantity,
        sortOrder: slot.sortOrder,
      })),
    });

    const productOptions = slots.flatMap((slot, i) => slot.productIds.map((productId) => ({ dealSlotId: slotIds[i]!, productId })));
    if (productOptions.length > 0) await tx.dealSlotProductOption.createMany({ data: productOptions });

    const choiceGroups = slots.flatMap((slot, i) => slot.choiceGroupIds.map((choiceGroupId) => ({ dealSlotId: slotIds[i]!, choiceGroupId })));
    if (choiceGroups.length > 0) await tx.dealSlotChoiceGroup.createMany({ data: choiceGroups });

    const addons = slots.flatMap((slot, i) => slot.addonIds.map((addonId, j) => ({ dealSlotId: slotIds[i]!, addonId, sortOrder: j })));
    if (addons.length > 0) await tx.dealSlotAddon.createMany({ data: addons });
  }

  async create(input: CreateDealInput) {
    this.assertDiscountValid(input.dealPrice, input.originalPrice);
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const branches = await this.prisma.branch.findMany({ where: { restaurantId }, select: { id: true } });

    const dealId = generateCuidLikeId();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.deal.create({
          data: {
            id: dealId,
            restaurantId,
            categoryId: input.categoryId,
            name: input.name,
            description: input.description,
            image: input.image,
            dealPrice: input.dealPrice,
            originalPrice: input.originalPrice,
            isFeatured: input.isFeatured,
            sortOrder: input.sortOrder,
            startDate: input.startDate,
            endDate: input.endDate,
          },
        });
        if (branches.length > 0) {
          await tx.dealBranchAvailability.createMany({
            data: branches.map((b) => ({ dealId, branchId: b.id, isAvailable: true })),
          });
        }
        await this.writeDealSlots(tx, dealId, input.slots);
      },
      { timeout: SLOT_WRITE_TX_TIMEOUT_MS },
    );

    return this.findOne(dealId);
  }

  async update(id: string, input: UpdateDealInput) {
    const current = await this.findOne(id);
    const dealPrice = input.dealPrice ?? current.dealPrice;
    const originalPrice = input.originalPrice === undefined ? current.originalPrice : input.originalPrice;
    this.assertDiscountValid(dealPrice, originalPrice);

    await this.prisma.$transaction(
      async (tx) => {
        if (input.slots) {
          await tx.dealSlot.deleteMany({ where: { dealId: id } });
          await this.writeDealSlots(tx, id, input.slots);
        }

        await tx.deal.update({
          where: { id },
          data: {
            categoryId: input.categoryId,
            name: input.name,
            description: input.description,
            image: input.image,
            dealPrice: input.dealPrice,
            originalPrice: input.originalPrice,
            isFeatured: input.isFeatured,
            sortOrder: input.sortOrder,
            startDate: input.startDate,
            endDate: input.endDate,
            status: input.status,
          },
        });
      },
      { timeout: SLOT_WRITE_TX_TIMEOUT_MS },
    );

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.deal.delete({ where: { id } });
    return { deleted: true };
  }

  async setBranchAvailability(id: string, input: SetBranchAvailabilityInput) {
    await this.findOne(id);
    return this.prisma.dealBranchAvailability.upsert({
      where: { dealId_branchId: { dealId: id, branchId: input.branchId } },
      create: { dealId: id, branchId: input.branchId, isAvailable: input.isAvailable },
      update: { isAvailable: input.isAvailable },
    });
  }

  async duplicate(id: string) {
    const original = await this.findOne(id);
    const maxSortOrder = await this.prisma.deal.aggregate({
      where: { restaurantId: original.restaurantId },
      _max: { sortOrder: true },
    });

    const newDealId = generateCuidLikeId();
    const slotsInput: DealSlotInput[] = original.slots.map((slot) => ({
      label: slot.label,
      quantity: slot.quantity,
      sortOrder: slot.sortOrder,
      productIds: slot.productOptions.map((po) => po.productId),
      choiceGroupIds: slot.choiceGroups.map((cg) => cg.choiceGroupId),
      addonIds: slot.addons.map((a) => a.addonId),
    }));

    await this.prisma.$transaction(
      async (tx) => {
        await tx.deal.create({
          data: {
            id: newDealId,
            restaurantId: original.restaurantId,
            categoryId: original.categoryId,
            name: `${original.name} (Copy)`,
            description: original.description,
            image: original.image,
            dealPrice: original.dealPrice,
            originalPrice: original.originalPrice,
            isFeatured: original.isFeatured,
            sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
            startDate: original.startDate,
            endDate: original.endDate,
            status: "INACTIVE",
          },
        });
        if (original.branchAvailability.length > 0) {
          await tx.dealBranchAvailability.createMany({
            data: original.branchAvailability.map((ba) => ({ dealId: newDealId, branchId: ba.branchId, isAvailable: ba.isAvailable })),
          });
        }
        await this.writeDealSlots(tx, newDealId, slotsInput);
      },
      { timeout: SLOT_WRITE_TX_TIMEOUT_MS },
    );

    return this.findOne(newDealId);
  }
}
