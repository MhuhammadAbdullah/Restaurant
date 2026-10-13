import type { InventoryUnit } from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { InventoryService } from "../src/modules/inventory/inventory.service";
import { InventoryOpsService } from "../src/modules/inventory/inventory-ops.service";
import { RecipesService } from "../src/modules/recipes/recipes.service";

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export type World = Awaited<ReturnType<typeof buildWorld>>;

/** A whole throw-away restaurant (own branches, menu, ingredients) in the isolated test schema. Delete it with world.destroy(). */
export async function buildWorld() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const tag = uid();
  const restaurant = await prisma.restaurant.create({ data: { name: `TEST-${tag}` } });
  const mkBranch = (name: string) =>
    prisma.branch.create({ data: { restaurantId: restaurant.id, name, code: `${name}-${tag}`.slice(0, 20), city: "X", area: "Y", openingTime: "00:00", closingTime: "23:59" } });
  const branchA = await mkBranch("A");
  const branchB = await mkBranch("B");
  const category = await prisma.category.create({ data: { restaurantId: restaurant.id, name: "Cat" } });
  const burger = await prisma.product.create({ data: { restaurantId: restaurant.id, categoryId: category.id, name: "Burger", basePrice: 10000 } });
  const fries = await prisma.product.create({ data: { restaurantId: restaurant.id, categoryId: category.id, name: "Fries", basePrice: 5000 } });

  const ctx = { getRestaurantId: async () => restaurant.id } as never;
  const inventory = new InventoryService(prisma, ctx);
  const ops = new InventoryOpsService(prisma, ctx, inventory);
  const recipes = new RecipesService(prisma, ctx);

  const owner = { sub: "tester", restaurantId: restaurant.id, roleId: "r", branchIds: [], isOwner: true, allBranchesAccess: true } as unknown as StaffJwtPayload;
  const onlyA = { sub: "tester-a", restaurantId: restaurant.id, roleId: "r", branchIds: [branchA.id], isOwner: false, allBranchesAccess: false } as unknown as StaffJwtPayload;

  const item = (name: string, unit: InventoryUnit, minLevel = 0) =>
    prisma.inventoryItem.create({ data: { restaurantId: restaurant.id, name: `${name}-${tag}`, unit, minLevel } });
  const stock = async (branchId: string, itemId: string) => Number((await prisma.branchStock.findUnique({ where: { itemId_branchId: { itemId, branchId } } }))?.quantity ?? 0);
  const setStock = (branchId: string, itemId: string, quantity: number) =>
    prisma.$transaction((tx) => inventory.applyMovement(tx, { restaurantId: restaurant.id, branchId, itemId, type: "OPENING", delta: quantity }));

  async function destroy() {
    // The app can never delete ledger rows, so the throw-away restaurant is removed with a plain client.
    // Purchase orders and transfers have no link to the restaurant, so they go first (they block deleting items and suppliers).
    const raw = new (await import("@restaurant/database")).PrismaClient();
    await raw.stockMovement.deleteMany({ where: { restaurantId: restaurant.id } });
    await raw.purchaseOrder.deleteMany({ where: { restaurantId: restaurant.id } });
    await raw.stockTransfer.deleteMany({ where: { restaurantId: restaurant.id } });
    await raw.restaurant.delete({ where: { id: restaurant.id } }).catch((e: Error) => console.warn("test cleanup failed:", String(e.message).split("\n").pop()));
    await raw.$disconnect();
    await prisma.$disconnect();
  }

  return { prisma, restaurant, branchA, branchB, burger, fries, inventory, ops, recipes, owner, onlyA, item, stock, setStock, destroy };
}
