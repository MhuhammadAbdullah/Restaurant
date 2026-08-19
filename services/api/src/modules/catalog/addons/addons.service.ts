import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@restaurant/database";
import type { CreateAddonInput, UpdateAddonInput } from "@restaurant/validation";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../../common/restaurant/restaurant-context.service";

@Injectable()
export class AddonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  async list(addonGroupId?: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.addon.findMany({
      where: { addonGroup: { restaurantId }, ...(addonGroupId ? { addonGroupId } : {}) },
      include: { product: { select: { id: true, name: true } } },
      orderBy: [{ addonGroupId: "asc" }, { sortOrder: "asc" }],
    });
  }

  async findOne(id: string) {
    const addon = await this.prisma.addon.findUnique({ where: { id }, include: { product: { select: { id: true, name: true } } } });
    if (!addon) throw new NotFoundException({ code: "ADDON_NOT_FOUND", message: "Add-on not found" });
    return addon;
  }

  private assertDiscountValid(price: number, discountPrice: number | null | undefined) {
    if (discountPrice == null) return;
    if (discountPrice <= 0 || discountPrice >= price) {
      throw new BadRequestException({
        code: "DISCOUNT_PRICE_INVALID",
        message: "Discount price must be greater than 0 and less than the regular price",
      });
    }
  }

  private async assertProductOwned(productId: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { restaurantId: true } });
    if (!product || product.restaurantId !== restaurantId) {
      throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    }
  }

  async create(input: CreateAddonInput) {
    this.assertDiscountValid(input.price, input.discountPrice);
    await this.assertProductOwned(input.productId);
    try {
      return await this.prisma.addon.create({
        data: {
          addonGroupId: input.addonGroupId,
          productId: input.productId,
          name: input.name,
          description: input.description,
          price: input.price,
          discountPrice: input.discountPrice,
          image: input.image,
          maxQuantity: input.maxQuantity,
          sortOrder: input.sortOrder,
          status: input.status,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new BadRequestException({ code: "ADDON_PRODUCT_ALREADY_IN_GROUP", message: "This product is already in this add-on category" });
      }
      throw e;
    }
  }

  async update(id: string, input: UpdateAddonInput) {
    const current = await this.findOne(id);
    const price = input.price ?? current.price;
    const discountPrice = input.discountPrice === undefined ? current.discountPrice : input.discountPrice;
    this.assertDiscountValid(price, discountPrice);
    if (input.productId) await this.assertProductOwned(input.productId);

    try {
      return await this.prisma.addon.update({
        where: { id },
        data: {
          addonGroupId: input.addonGroupId,
          productId: input.productId,
          name: input.name,
          description: input.description,
          price: input.price,
          discountPrice: input.discountPrice,
          image: input.image,
          maxQuantity: input.maxQuantity,
          sortOrder: input.sortOrder,
          status: input.status,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new BadRequestException({ code: "ADDON_PRODUCT_ALREADY_IN_GROUP", message: "This product is already in this add-on category" });
      }
      throw e;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.addon.delete({ where: { id } });
    return { deleted: true };
  }

  async reorder(orderedIds: string[]) {
    await this.prisma.$transaction(orderedIds.map((id, index) => this.prisma.addon.update({ where: { id }, data: { sortOrder: index } })));
    return { reordered: true };
  }
}
