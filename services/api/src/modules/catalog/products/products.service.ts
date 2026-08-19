import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateProductInput,
  ListProductsQuery,
  ProductChoiceGroupAssignmentInput,
  SetBranchAvailabilityInput,
  UpdateProductInput,
} from "@restaurant/validation";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../../common/restaurant/restaurant-context.service";

const PRODUCT_DETAIL_INCLUDE = {
  images: { orderBy: { sortOrder: "asc" as const } },
  branchAvailability: true,
  choiceGroups: {
    include: {
      choiceGroup: { include: { options: { where: { status: "ACTIVE" as const }, orderBy: { sortOrder: "asc" as const } } } },
      defaultChoiceOption: true,
    },
  },
  addons: {
    where: { addon: { status: "ACTIVE" as const } },
    include: { addon: { include: { addonGroup: true } } },
    orderBy: { sortOrder: "asc" as const },
  },
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  async list(query: ListProductsQuery) {
    const restaurantId = await this.restaurantContext.getRestaurantId();

    let take: number | undefined;
    if (query.mainPage && query.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: query.categoryId }, select: { mainPageLimit: true } });
      take = category?.mainPageLimit ?? undefined;
    }

    return this.prisma.product.findMany({
      where: {
        restaurantId,
        status: "ACTIVE",
        categoryId: query.categoryId,
        isFeatured: query.featured,
        isPopular: query.popular,
        showOnMainPage: query.mainPage ? true : undefined,
        name: query.search ? { contains: query.search, mode: "insensitive" } : undefined,
        ...(query.branchId
          ? { branchAvailability: { some: { branchId: query.branchId, isAvailable: true } } }
          : {}),
      },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        branchAvailability: true,
        category: true,
      },
      orderBy: query.mainPage ? { mainPageSortOrder: "asc" } : { createdAt: "desc" },
      take,
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_DETAIL_INCLUDE,
    });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    return product;
  }

  private async validateChoiceGroupAssignments(assignments: ProductChoiceGroupAssignmentInput[]) {
    const withDefaults = assignments.filter((a) => a.defaultChoiceOptionId);
    if (withDefaults.length === 0) return;
    const options = await this.prisma.choiceOption.findMany({
      where: { id: { in: withDefaults.map((a) => a.defaultChoiceOptionId!) } },
      select: { id: true, choiceGroupId: true },
    });
    const byId = new Map(options.map((o) => [o.id, o.choiceGroupId]));
    for (const a of withDefaults) {
      if (byId.get(a.defaultChoiceOptionId!) !== a.choiceGroupId) {
        throw new BadRequestException({
          code: "INVALID_DEFAULT_OPTION",
          message: "Default selection must be an option that belongs to the attached choice section",
        });
      }
    }
  }

  private assertDiscountValid(basePrice: number, discountPrice: number | null | undefined) {
    if (discountPrice == null) return;
    if (discountPrice <= 0 || discountPrice >= basePrice) {
      throw new BadRequestException({
        code: "DISCOUNT_PRICE_INVALID",
        message: "Discount price must be greater than 0 and less than the regular price",
      });
    }
  }

  async create(input: CreateProductInput) {
    this.assertDiscountValid(input.basePrice, input.discountPrice);
    await this.validateChoiceGroupAssignments(input.choiceGroups);

    const restaurantId = await this.restaurantContext.getRestaurantId();
    const branches = await this.prisma.branch.findMany({ where: { restaurantId }, select: { id: true } });

    return this.prisma.product.create({
      data: {
        restaurantId,
        categoryId: input.categoryId,
        name: input.name,
        sku: input.sku,
        description: input.description,
        shortDescription: input.shortDescription,
        basePrice: input.basePrice,
        discountPrice: input.discountPrice,
        taxPct: input.taxPct,
        isFeatured: input.isFeatured,
        isPopular: input.isPopular,
        isCartRecommendable: input.isCartRecommendable,
        showOnMainPage: input.showOnMainPage,
        mainPageSortOrder: input.mainPageSortOrder,
        prepTimeMinutes: input.prepTimeMinutes,
        images: { create: input.images.map((url, i) => ({ url, sortOrder: i, isPrimary: i === 0 })) },
        branchAvailability: { create: branches.map((b) => ({ branchId: b.id, isAvailable: true })) },
        choiceGroups: {
          create: input.choiceGroups.map((c) => ({
            choiceGroupId: c.choiceGroupId,
            sortOrder: c.sortOrder,
            isRequiredOverride: c.isRequiredOverride,
            minSelectOverride: c.minSelectOverride,
            maxSelectOverride: c.maxSelectOverride,
            defaultChoiceOptionId: c.defaultChoiceOptionId,
          })),
        },
        addons: { create: input.addonIds.map((addonId, i) => ({ addonId, sortOrder: i })) },
      },
      include: PRODUCT_DETAIL_INCLUDE,
    });
  }

  async update(id: string, input: UpdateProductInput) {
    const current = await this.findOne(id);
    const basePrice = input.basePrice ?? current.basePrice;
    const discountPrice = input.discountPrice === undefined ? current.discountPrice : input.discountPrice;
    this.assertDiscountValid(basePrice, discountPrice);
    if (input.choiceGroups) await this.validateChoiceGroupAssignments(input.choiceGroups);

    return this.prisma.$transaction(async (tx) => {
      if (input.choiceGroups) {
        await tx.productChoiceGroup.deleteMany({ where: { productId: id } });
        await tx.productChoiceGroup.createMany({
          data: input.choiceGroups.map((c) => ({
            productId: id,
            choiceGroupId: c.choiceGroupId,
            sortOrder: c.sortOrder,
            isRequiredOverride: c.isRequiredOverride,
            minSelectOverride: c.minSelectOverride,
            maxSelectOverride: c.maxSelectOverride,
            defaultChoiceOptionId: c.defaultChoiceOptionId,
          })),
        });
      }
      if (input.addonIds) {
        await tx.productAddon.deleteMany({ where: { productId: id } });
        await tx.productAddon.createMany({
          data: input.addonIds.map((addonId, i) => ({ productId: id, addonId, sortOrder: i })),
        });
      }
      if (input.images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({
          data: input.images.map((url, i) => ({ productId: id, url, sortOrder: i, isPrimary: i === 0 })),
        });
      }

      return tx.product.update({
        where: { id },
        data: {
          categoryId: input.categoryId,
          name: input.name,
          sku: input.sku,
          description: input.description,
          shortDescription: input.shortDescription,
          basePrice: input.basePrice,
          discountPrice: input.discountPrice,
          taxPct: input.taxPct,
          status: input.status,
          isFeatured: input.isFeatured,
          isPopular: input.isPopular,
          isCartRecommendable: input.isCartRecommendable,
          showOnMainPage: input.showOnMainPage,
          mainPageSortOrder: input.mainPageSortOrder,
          prepTimeMinutes: input.prepTimeMinutes,
        },
        include: PRODUCT_DETAIL_INCLUDE,
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
    return { deleted: true };
  }

  async setBranchAvailability(id: string, input: SetBranchAvailabilityInput) {
    await this.findOne(id);
    return this.prisma.productBranchAvailability.upsert({
      where: { productId_branchId: { productId: id, branchId: input.branchId } },
      create: { productId: id, branchId: input.branchId, isAvailable: input.isAvailable },
      update: { isAvailable: input.isAvailable },
    });
  }

  /** Resend-full-array reconciliation: sets showOnMainPage/mainPageSortOrder for the given ordered
   * products (all must belong to categoryId), and clears the flag for any other product in that
   * category currently flagged true but absent from the array. */
  async setMainPageProducts(categoryId: string, productIds: string[]) {
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } });
    if (products.some((p) => p.categoryId !== categoryId)) {
      throw new BadRequestException({ code: "PRODUCT_NOT_IN_CATEGORY", message: "All products must belong to this category" });
    }

    await this.prisma.$transaction([
      this.prisma.product.updateMany({
        where: { categoryId, showOnMainPage: true, id: { notIn: productIds } },
        data: { showOnMainPage: false },
      }),
      ...productIds.map((id, index) =>
        this.prisma.product.update({ where: { id }, data: { showOnMainPage: true, mainPageSortOrder: index } }),
      ),
    ]);
    return { updated: true };
  }
}
