import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCategoryInput, SetBranchAvailabilityInput, UpdateCategoryInput } from "@restaurant/validation";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../../common/restaurant/restaurant-context.service";
import { ProductsService } from "../products/products.service";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
    private readonly products: ProductsService,
  ) {}

  async list(branchId?: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.category.findMany({
      where: {
        restaurantId,
        status: "ACTIVE",
        ...(branchId
          ? { branchAvailability: { some: { branchId, isAvailable: true } } }
          : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: { branchAvailability: true },
    });
  }

  async listProducts(categoryId: string) {
    await this.findOne(categoryId);
    return this.prisma.product.findMany({
      where: { categoryId },
      include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { branchAvailability: { include: { branch: true } } },
    });
    if (!category) throw new NotFoundException({ code: "CATEGORY_NOT_FOUND", message: "Category not found" });
    return category;
  }

  async create(input: CreateCategoryInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const branches = await this.prisma.branch.findMany({ where: { restaurantId }, select: { id: true } });
    return this.prisma.category.create({
      data: {
        restaurantId,
        name: input.name,
        description: input.description,
        image: input.image,
        banner: input.banner,
        sortOrder: input.sortOrder,
        mainPageLimit: input.mainPageLimit,
        branchAvailability: {
          create: branches.map((b) => ({ branchId: b.id, isAvailable: true })),
        },
      },
      include: { branchAvailability: true },
    });
  }

  async update(id: string, input: UpdateCategoryInput) {
    await this.findOne(id);
    return this.prisma.category.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        image: input.image,
        banner: input.banner,
        sortOrder: input.sortOrder,
        status: input.status,
        mainPageLimit: input.mainPageLimit,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  async setBranchAvailability(id: string, input: SetBranchAvailabilityInput) {
    await this.findOne(id);
    return this.prisma.categoryBranchAvailability.upsert({
      where: { categoryId_branchId: { categoryId: id, branchId: input.branchId } },
      create: { categoryId: id, branchId: input.branchId, isAvailable: input.isAvailable },
      update: { isAvailable: input.isAvailable },
    });
  }

  async reorder(orderedIds: string[]) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    await this.prisma.$transaction(
      orderedIds.map((id, index) => this.prisma.category.update({ where: { id, restaurantId }, data: { sortOrder: index } })),
    );
    return { reordered: true };
  }

  async setMainPageProducts(categoryId: string, productIds: string[]) {
    await this.findOne(categoryId);
    return this.products.setMainPageProducts(categoryId, productIds);
  }
}
