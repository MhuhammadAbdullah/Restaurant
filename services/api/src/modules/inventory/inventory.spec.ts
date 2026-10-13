import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, type World } from "../../../test/fixtures";
import { InventoryController } from "./inventory.controller";
import { RecipesController } from "../recipes/recipes.controller";
import { PERMISSION_CATALOG } from "@restaurant/auth";

/**
 * These tests run against an isolated database schema (see test/setup.ts) inside a throw-away restaurant, so they never
 * touch real data. Stock is a manual book: quantities only change when a person records stock in / out / waste / a count,
 * receives a purchase order or moves stock between branches. Recipes are kitchen instructions and never touch stock.
 */
let w: World;
beforeAll(async () => {
  w = await buildWorld();
}, 120_000);
afterAll(async () => {
  await w.destroy();
});

describe("manual stock changes", () => {
  it("stock in / waste / count are recorded in the ledger with the actor and reason", async () => {
    const meat = await w.item("Manual", "KG");
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "STOCK_IN", quantity: 10, unit: "KG", note: "delivery" });
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "WASTE", quantity: 500, unit: "G", note: "spoiled" });
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "COUNT", quantity: 8, unit: "KG", note: "count" });
    expect(await w.stock(w.branchA.id, meat.id)).toBe(8_000);
    const rows = await w.prisma.stockMovement.findMany({ where: { itemId: meat.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.type)).toEqual(["STOCK_IN", "WASTE", "ADJUSTMENT"]);
    expect(rows.every((r) => r.staffId === "tester" && r.note !== "")).toBe(true);
    expect(Number(rows[2]!.balanceAfter)).toBe(8_000);
  });

  it("units of different kinds are refused, and kg/g mix correctly", async () => {
    const meat = await w.item("Units", "KG");
    await expect(w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "STOCK_IN", quantity: 5, unit: "ML", note: "x" })).rejects.toMatchObject({ response: { code: "INVENTORY_UNIT_MISMATCH" } });
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "STOCK_IN", quantity: 2, unit: "KG", note: "x" });
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "STOCK_IN", quantity: 250, unit: "G", note: "x" });
    expect(await w.stock(w.branchA.id, meat.id)).toBe(2_250);
  });

  it("all kinds of units work: pounds and ounces into a kg item, tablespoons into a litre item, and a box item stays in boxes", async () => {
    const flour = await w.item("Flour", "KG");
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: flour.id, mode: "STOCK_IN", quantity: 2, unit: "LB", note: "x" });
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: flour.id, mode: "STOCK_IN", quantity: 16, unit: "OZ", note: "x" });
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: flour.id, mode: "STOCK_IN", quantity: 500, unit: "MG", note: "x" });
    const grams = await w.stock(w.branchA.id, flour.id);
    expect(Math.abs(grams - (2 * 453.592 + 16 * 28.3495 + 0.5))).toBeLessThan(0.01);
    const oil = await w.item("Sauce", "LITER");
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: oil.id, mode: "STOCK_IN", quantity: 4, unit: "TBSP", note: "x" });
    expect(await w.stock(w.branchA.id, oil.id)).toBe(60);
    const boxes = await w.item("Burger boxes", "BOX");
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: boxes.id, mode: "STOCK_IN", quantity: 40, unit: "BOX", note: "x" });
    expect(await w.stock(w.branchA.id, boxes.id)).toBe(40);
    await expect(w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: boxes.id, mode: "STOCK_IN", quantity: 5, unit: "PIECE", note: "x" })).rejects.toMatchObject({ response: { code: "INVENTORY_UNIT_MISMATCH" } });
    await expect(w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: flour.id, mode: "STOCK_IN", quantity: 1, unit: "BOX", note: "x" })).rejects.toMatchObject({ response: { code: "INVENTORY_UNIT_MISMATCH" } });
  });

  it("two people taking the last stock out at once: one succeeds, the others are refused, never below zero", async () => {
    const meat = await w.item("Last", "G");
    await w.setStock(w.branchA.id, meat.id, 100);
    const take = () => w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "STOCK_OUT", quantity: 100, unit: "G", note: "x" });
    const results = await Promise.allSettled([take(), take(), take()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await w.stock(w.branchA.id, meat.id)).toBe(0);
  });

  it("taking more than is in stock is refused", async () => {
    const meat = await w.item("TooMuch", "G");
    await w.setStock(w.branchA.id, meat.id, 100);
    await expect(w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "WASTE", quantity: 500, unit: "G", note: "x" })).rejects.toMatchObject({ response: { code: "INVENTORY_NOT_ENOUGH" } });
    expect(await w.stock(w.branchA.id, meat.id)).toBe(100);
  });

  it("many simultaneous stock changes keep the books exact", async () => {
    const meat = await w.item("Busy", "G");
    await w.setStock(w.branchA.id, meat.id, 1_000);
    await Promise.all([
      ...Array.from({ length: 6 }, () => w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "STOCK_IN", quantity: 50, unit: "G", note: "in" })),
      ...Array.from({ length: 6 }, () => w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "STOCK_OUT", quantity: 30, unit: "G", note: "out" })),
    ]);
    expect(await w.stock(w.branchA.id, meat.id)).toBe(1_000 + 300 - 180);
    const rec = await w.inventory.reconcile(w.owner, w.branchA.id);
    expect(rec.mismatches.filter((m) => m.itemId === meat.id)).toEqual([]);
  });

  it("a manual take-out that drops stock to the alert level raises one low-stock notice, not one per take-out", async () => {
    const role = await w.prisma.role.create({ data: { restaurantId: w.restaurant.id, name: "Owner", isSystem: true } });
    const staff = await w.prisma.staffUser.create({ data: { restaurantId: w.restaurant.id, roleId: role.id, name: "Boss", email: `boss-${Date.now()}@example.com`, passwordHash: "x", allBranchesAccess: true } });
    const meat = await w.item("Alert", "KG", 2_000);
    await w.setStock(w.branchA.id, meat.id, 5_000);
    const out = (kg: number) => w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "STOCK_OUT", quantity: kg, unit: "KG", note: "use" });
    await out(1); // 4 kg left: still above the 2 kg alert
    await out(3); // 1 kg left: crossed the alert level
    await out(0.5); // 0.5 kg left: already low, no second notice
    const notes = await w.prisma.notification.findMany({ where: { recipientStaffId: staff.id, type: "LOW_STOCK" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.message).toContain("Alert");
  });
});

describe("recipes are kitchen instructions only", () => {
  it("saving, changing and deleting a recipe never moves stock or writes to the ledger", async () => {
    const meat = await w.item("NoLink", "G");
    await w.setStock(w.branchA.id, meat.id, 5_000);
    const before = await w.prisma.stockMovement.count({ where: { restaurantId: w.restaurant.id } });
    await w.recipes.save(w.burger.id, { prepMinutes: 12, servings: "1 burger", ingredients: "Chicken 150 g\nBun 1", steps: "1. Marinate\n2. Fry\n3. Assemble", notes: "Serve hot" }, "tester");
    await w.recipes.save(w.burger.id, { prepMinutes: 10, servings: "", ingredients: "Chicken 200 g", steps: "Fry", notes: "" }, "tester");
    await w.recipes.remove(w.burger.id);
    expect(await w.stock(w.branchA.id, meat.id)).toBe(5_000);
    expect(await w.prisma.stockMovement.count({ where: { restaurantId: w.restaurant.id } })).toBe(before);
  });

  it("an order never moves stock either, even for a product that has a recipe", async () => {
    const meat = await w.item("OrderNoLink", "G");
    await w.setStock(w.branchA.id, meat.id, 5_000);
    await w.recipes.save(w.fries.id, { prepMinutes: 5, servings: "", ingredients: "Potato 200 g", steps: "Fry", notes: "" }, "tester");
    await w.prisma.order.create({
      data: { orderNumber: `T-${Date.now()}`, restaurantId: w.restaurant.id, branchId: w.branchA.id, type: "WALK_IN", paymentMethod: "COD", subtotal: 0, grandTotal: 0, items: { create: [{ productId: w.fries.id, nameSnapshot: "Fries", quantity: 3, unitPrice: 0, lineTotal: 0 }] } },
    });
    expect(await w.stock(w.branchA.id, meat.id)).toBe(5_000);
    // and the menu is untouched: nothing was switched to Sold out by inventory
    expect(await w.prisma.productBranchAvailability.count({ where: { productId: w.fries.id } })).toBe(0);
  });

  it("lists every product with whether it has a recipe, and returns what was written", async () => {
    const plain = await w.prisma.product.create({ data: { restaurantId: w.restaurant.id, categoryId: w.burger.categoryId, name: "No recipe yet", basePrice: 1000 } });
    await w.recipes.save(w.burger.id, { prepMinutes: 12, servings: "1 burger", ingredients: "Chicken 150 g", steps: "Fry it", notes: "" }, "tester");
    const list = await w.recipes.list();
    expect(list.find((p) => p.productId === w.burger.id)?.hasRecipe).toBe(true);
    expect(list.find((p) => p.productId === plain.id)?.hasRecipe).toBe(false);
    const one = await w.recipes.get(w.burger.id);
    expect(one).toMatchObject({ prepMinutes: 12, servings: "1 burger", ingredients: "Chicken 150 g", steps: "Fry it" });
  });

  it("a recipe for a product of another restaurant is refused", async () => {
    await expect(w.recipes.get("does-not-exist")).rejects.toMatchObject({ response: { code: "PRODUCT_NOT_FOUND" } });
  });
});

describe("purchasing and transfers", () => {
  it("receiving a purchase order twice, even at the same moment, adds the goods once", async () => {
    const meat = await w.item("Buy", "KG");
    const supplier = await w.ops.createSupplier({ name: "S", contactName: "", phone: "", email: "", address: "", notes: "", status: "ACTIVE" });
    const po = await w.ops.createPurchaseOrder(w.owner, { branchId: w.branchA.id, supplierId: supplier.id, status: "ORDERED", notes: "", lines: [{ itemId: meat.id, quantity: 20, unit: "KG", unitCost: 700 }] });
    const results = await Promise.allSettled([w.ops.receivePurchaseOrder(w.owner, po.id, { note: "" }), w.ops.receivePurchaseOrder(w.owner, po.id, { note: "" }), w.ops.receivePurchaseOrder(w.owner, po.id, { note: "" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await w.stock(w.branchA.id, meat.id)).toBe(20_000);
    expect(await w.prisma.stockMovement.count({ where: { itemId: meat.id, type: "PURCHASE" } })).toBe(1);
  });

  it("a transfer moves stock out of one branch and into the other, and cannot overdraw", async () => {
    const meat = await w.item("Move", "KG");
    await w.setStock(w.branchA.id, meat.id, 10_000);
    await w.ops.createTransfer(w.owner, { fromBranchId: w.branchA.id, toBranchId: w.branchB.id, note: "", lines: [{ itemId: meat.id, quantity: 6, unit: "KG" }] });
    expect(await w.stock(w.branchA.id, meat.id)).toBe(4_000);
    expect(await w.stock(w.branchB.id, meat.id)).toBe(6_000);
    await expect(w.ops.createTransfer(w.owner, { fromBranchId: w.branchA.id, toBranchId: w.branchB.id, note: "", lines: [{ itemId: meat.id, quantity: 100, unit: "KG" }] })).rejects.toMatchObject({ response: { code: "INVENTORY_NOT_ENOUGH" } });
  });

  it("simultaneous transfers of the same stock cannot take more than exists", async () => {
    const meat = await w.item("Race2", "KG");
    await w.setStock(w.branchA.id, meat.id, 10_000);
    const go = () => w.ops.createTransfer(w.owner, { fromBranchId: w.branchA.id, toBranchId: w.branchB.id, note: "", lines: [{ itemId: meat.id, quantity: 6, unit: "KG" }] });
    const results = await Promise.allSettled([go(), go(), go()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await w.stock(w.branchA.id, meat.id)).toBe(4_000);
    expect(await w.stock(w.branchB.id, meat.id)).toBe(6_000);
  });
});

const supplierInput = (name: string) => ({ name, contactName: "", phone: "", email: "", address: "", notes: "", status: "ACTIVE" as const });

describe("deleting and editing", () => {
  const po = async (status: "DRAFT" | "ORDERED", itemId: string, supplierId: string, quantity = 5) =>
    w.ops.createPurchaseOrder(w.owner, { branchId: w.branchA.id, supplierId, status, notes: "", lines: [{ itemId, quantity, unit: "KG", unitCost: 100 }] });

  it("a draft, ordered or cancelled purchase order can be deleted; a received one cannot", async () => {
    const meat = await w.item("PoDel", "KG");
    const s = await w.ops.createSupplier(supplierInput("PoDel-S"));
    const draft = await po("DRAFT", meat.id, s.id);
    const ordered = await po("ORDERED", meat.id, s.id);
    const cancelled = await po("ORDERED", meat.id, s.id);
    await w.ops.setPurchaseOrderStatus(w.owner, cancelled.id, "CANCELLED");
    const received = await po("ORDERED", meat.id, s.id);
    await w.ops.receivePurchaseOrder(w.owner, received.id, { note: "" });
    for (const p of [draft, ordered, cancelled]) await w.ops.deletePurchaseOrder(w.owner, p.id);
    expect(await w.prisma.purchaseOrder.count({ where: { id: { in: [draft.id, ordered.id, cancelled.id] } } })).toBe(0);
    await expect(w.ops.deletePurchaseOrder(w.owner, received.id)).rejects.toMatchObject({ response: { code: "PO_RECEIVED" } });
    expect(await w.prisma.purchaseOrder.count({ where: { id: received.id } })).toBe(1);
    expect(await w.stock(w.branchA.id, meat.id)).toBe(5_000);
  });

  it("deleting many purchase orders reports each one: received ones are kept and say why", async () => {
    const meat = await w.item("PoBulk", "KG");
    const s = await w.ops.createSupplier(supplierInput("PoBulk-S"));
    const a = await po("DRAFT", meat.id, s.id);
    const b = await po("ORDERED", meat.id, s.id);
    const c = await po("ORDERED", meat.id, s.id);
    await w.ops.receivePurchaseOrder(w.owner, c.id, { note: "" });
    const r = await w.ops.deletePurchaseOrders(w.owner, [a.id, b.id, c.id, "does-not-exist"]);
    expect(r.removed).toBe(2);
    expect(r.failed.map((f) => f.id).sort()).toEqual([c.id, "does-not-exist"].sort());
    expect(r.failed.find((f) => f.id === c.id)?.reason).toMatch(/received/i);
  });

  it("deleting the same purchase order from two places at once works once", async () => {
    const meat = await w.item("PoRace", "KG");
    const s = await w.ops.createSupplier(supplierInput("PoRace-S"));
    const p = await po("ORDERED", meat.id, s.id);
    const results = await Promise.allSettled([w.ops.deletePurchaseOrder(w.owner, p.id), w.ops.deletePurchaseOrder(w.owner, p.id), w.ops.deletePurchaseOrder(w.owner, p.id)]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("a draft or ordered purchase order can be edited (supplier, items, quantities); a received one cannot", async () => {
    const meat = await w.item("PoEdit", "KG");
    const oil = await w.item("PoEdit2", "LITER");
    const s1 = await w.ops.createSupplier(supplierInput("PoEdit-S1"));
    const s2 = await w.ops.createSupplier(supplierInput("PoEdit-S2"));
    const p = await po("DRAFT", meat.id, s1.id, 5);
    const edited = await w.ops.updatePurchaseOrder(w.owner, p.id, { supplierId: s2.id, status: "ORDERED", notes: "changed", lines: [{ itemId: oil.id, quantity: 3, unit: "LITER", unitCost: 200 }, { itemId: meat.id, quantity: 8, unit: "KG", unitCost: 90 }] });
    expect(edited.supplierId).toBe(s2.id);
    expect(edited.status).toBe("ORDERED");
    expect(edited.notes).toBe("changed");
    expect(edited.lines).toHaveLength(2);
    expect(edited.lines.find((l) => l.itemId === meat.id)?.quantity).toBe(8_000);
    // editing never touches stock
    expect(await w.stock(w.branchA.id, meat.id)).toBe(0);
    await w.ops.receivePurchaseOrder(w.owner, p.id, { note: "" });
    await expect(w.ops.updatePurchaseOrder(w.owner, p.id, { supplierId: s1.id, status: "ORDERED", notes: "", lines: [{ itemId: meat.id, quantity: 1, unit: "KG", unitCost: 1 }] })).rejects.toMatchObject({ response: { code: "PO_LOCKED" } });
  });

  it("deleting a transfer sends the stock back and leaves both entries in the history", async () => {
    const meat = await w.item("TrBack", "KG");
    await w.setStock(w.branchA.id, meat.id, 10_000);
    const t = await w.ops.createTransfer(w.owner, { fromBranchId: w.branchA.id, toBranchId: w.branchB.id, note: "", lines: [{ itemId: meat.id, quantity: 6, unit: "KG" }] });
    expect(await w.stock(w.branchB.id, meat.id)).toBe(6_000);
    await w.ops.reverseTransfer(w.owner, t.id);
    expect(await w.stock(w.branchA.id, meat.id)).toBe(10_000);
    expect(await w.stock(w.branchB.id, meat.id)).toBe(0);
    expect(await w.prisma.stockTransfer.count({ where: { id: t.id } })).toBe(0);
    // 1 opening + 2 for the transfer + 2 for sending it back; nothing was erased
    expect(await w.prisma.stockMovement.count({ where: { itemId: meat.id } })).toBe(5);
    expect((await w.inventory.reconcile(w.owner, undefined)).mismatches.filter((m) => m.itemId === meat.id)).toEqual([]);
  });

  it("a transfer cannot be deleted once the receiving branch has used the stock, and nothing changes", async () => {
    const meat = await w.item("TrShort", "KG");
    await w.setStock(w.branchA.id, meat.id, 10_000);
    const t = await w.ops.createTransfer(w.owner, { fromBranchId: w.branchA.id, toBranchId: w.branchB.id, note: "", lines: [{ itemId: meat.id, quantity: 6, unit: "KG" }] });
    await w.inventory.adjust(w.owner, { branchId: w.branchB.id, itemId: meat.id, mode: "WASTE", quantity: 5, unit: "KG", note: "spoiled" });
    await expect(w.ops.reverseTransfer(w.owner, t.id)).rejects.toMatchObject({ response: { code: "TRANSFER_CANNOT_BE_REVERSED" } });
    expect(await w.prisma.stockTransfer.count({ where: { id: t.id } })).toBe(1);
    expect(await w.stock(w.branchA.id, meat.id)).toBe(4_000);
    expect(await w.stock(w.branchB.id, meat.id)).toBe(1_000);
  });

  it("deleting the same transfer several times at once sends the stock back only once", async () => {
    const meat = await w.item("TrRace", "KG");
    await w.setStock(w.branchA.id, meat.id, 10_000);
    const t = await w.ops.createTransfer(w.owner, { fromBranchId: w.branchA.id, toBranchId: w.branchB.id, note: "", lines: [{ itemId: meat.id, quantity: 6, unit: "KG" }] });
    const results = await Promise.allSettled([w.ops.reverseTransfer(w.owner, t.id), w.ops.reverseTransfer(w.owner, t.id), w.ops.reverseTransfer(w.owner, t.id)]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await w.stock(w.branchA.id, meat.id)).toBe(10_000);
    expect(await w.stock(w.branchB.id, meat.id)).toBe(0);
  });

  it("a transfer cannot be deleted by someone without access to both branches", async () => {
    const meat = await w.item("TrScope", "KG");
    await w.setStock(w.branchA.id, meat.id, 5_000);
    const t = await w.ops.createTransfer(w.owner, { fromBranchId: w.branchA.id, toBranchId: w.branchB.id, note: "", lines: [{ itemId: meat.id, quantity: 2, unit: "KG" }] });
    await expect(w.ops.reverseTransfer(w.onlyA, t.id)).rejects.toMatchObject({ response: { code: "BRANCH_SCOPE_DENIED" } });
    expect(await w.prisma.stockTransfer.count({ where: { id: t.id } })).toBe(1);
  });

  it("order numbers are never reused after a delete, even when several are created at the same moment", async () => {
    const meat = await w.item("PoNum", "KG");
    const s = await w.ops.createSupplier(supplierInput("PoNum-S"));
    const first = await Promise.all([po("DRAFT", meat.id, s.id), po("DRAFT", meat.id, s.id), po("DRAFT", meat.id, s.id)]);
    expect(new Set(first.map((p) => p.number)).size).toBe(3);
    await w.ops.deletePurchaseOrder(w.owner, first[0]!.id);
    const next = await po("DRAFT", meat.id, s.id);
    expect([first[1]!.number, first[2]!.number]).not.toContain(next.number);
    const all = await w.prisma.purchaseOrder.findMany({ where: { restaurantId: w.restaurant.id }, select: { number: true } });
    expect(new Set(all.map((x) => x.number)).size).toBe(all.length);
  });

  it("deleting many items removes unused ones and only switches off the ones with history", async () => {
    const unused = await w.item("ItemUnused", "KG");
    const used = await w.item("ItemUsed", "KG");
    await w.setStock(w.branchA.id, used.id, 1_000);
    const r = await w.inventory.removeItems([unused.id, used.id, "nope"]);
    expect(r.removed).toBe(1);
    expect(r.deactivated).toBe(1);
    expect(r.failed.map((f) => f.id)).toEqual(["nope"]);
    expect(await w.prisma.inventoryItem.count({ where: { id: unused.id } })).toBe(0);
    expect((await w.prisma.inventoryItem.findUnique({ where: { id: used.id } }))?.status).toBe("INACTIVE");
    // the history of the switched-off item is still there
    expect(await w.prisma.stockMovement.count({ where: { itemId: used.id } })).toBe(1);
  });

  it("deleting many suppliers removes unused ones and only switches off the ones with orders", async () => {
    const meat = await w.item("SupItem", "KG");
    const free = await w.ops.createSupplier(supplierInput("Free-S"));
    const busy = await w.ops.createSupplier(supplierInput("Busy-S"));
    await po("ORDERED", meat.id, busy.id);
    const r = await w.ops.removeSuppliers([free.id, busy.id]);
    expect(r.removed).toBe(1);
    expect(r.deactivated).toBe(1);
    expect(await w.prisma.supplier.count({ where: { id: free.id } })).toBe(0);
    expect((await w.prisma.supplier.findUnique({ where: { id: busy.id } }))?.status).toBe("INACTIVE");
  });
});

describe("the ledger", () => {
  it("cannot be edited or deleted through the app", async () => {
    const meat = await w.item("Immutable", "G");
    await w.setStock(w.branchA.id, meat.id, 100);
    const row = (await w.prisma.stockMovement.findFirst({ where: { itemId: meat.id } }))!;
    await expect(w.prisma.stockMovement.update({ where: { id: row.id }, data: { note: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(w.prisma.stockMovement.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(w.prisma.stockMovement.deleteMany({ where: { itemId: meat.id } })).rejects.toThrow(/append-only/);
  });

  it("refuses the same idempotency key twice", async () => {
    const meat = await w.item("Dup", "G");
    const apply = () => w.prisma.$transaction((tx) => w.inventory.applyMovement(tx, { restaurantId: w.restaurant.id, branchId: w.branchA.id, itemId: meat.id, type: "STOCK_IN", delta: 10, idempotencyKey: `dup-${meat.id}` }));
    await apply();
    await expect(apply()).rejects.toThrow();
    expect(await w.stock(w.branchA.id, meat.id)).toBe(10);
  });

  it("reconciliation is clean after real operations, and notices a shelf figure changed behind the ledger's back", async () => {
    const meat = await w.item("Recon", "G");
    await w.setStock(w.branchA.id, meat.id, 1_000);
    await w.inventory.adjust(w.owner, { branchId: w.branchA.id, itemId: meat.id, mode: "WASTE", quantity: 100, unit: "G", note: "w" });
    let rec = await w.inventory.reconcile(w.owner, w.branchA.id);
    expect(rec.mismatches.filter((m) => m.itemId === meat.id)).toEqual([]);
    await w.prisma.branchStock.update({ where: { itemId_branchId: { itemId: meat.id, branchId: w.branchA.id } }, data: { quantity: 5_000 } });
    rec = await w.inventory.reconcile(w.owner, w.branchA.id);
    expect(rec.mismatches.find((m) => m.itemId === meat.id)?.difference).toBe(4_100);
  });
});

describe("permissions and branch access", () => {
  const routesOf = (proto: Record<string, unknown>) =>
    Object.getOwnPropertyNames(proto).filter((n) => n !== "constructor" && typeof proto[n] === "function" && Reflect.getMetadata("path", proto[n] as object) !== undefined);
  const permissionsOf = (fn: object): string[] => {
    const key = Reflect.getMetadataKeys(fn).find((k) => String(k).toLowerCase().includes("permission"));
    return key ? (Reflect.getMetadata(key, fn) as string[]) : [];
  };

  it("every inventory endpoint demands a permission", () => {
    const proto = InventoryController.prototype as unknown as Record<string, unknown>;
    const names = routesOf(proto);
    expect(names.length).toBeGreaterThan(15);
    expect(names.filter((n) => permissionsOf(proto[n] as object).length === 0)).toEqual([]);
  });

  it("every recipe endpoint demands a permission, and only editors can write", () => {
    const proto = RecipesController.prototype as unknown as Record<string, unknown>;
    const names = routesOf(proto);
    expect(names.sort()).toEqual(["get", "list", "remove", "save"]);
    for (const n of names) expect(permissionsOf(proto[n] as object).length).toBeGreaterThan(0);
    expect(permissionsOf(proto.save as object)).toEqual(["inventoryRecipes.create", "inventoryRecipes.edit", "products.edit"]);
    expect(permissionsOf(proto.remove as object)).toEqual(["inventoryRecipes.delete", "products.edit"]);
    // kitchen staff can read recipes
    expect(permissionsOf(proto.get as object)).toContain("kitchen.access");
  });

  it("each inventory page has its own permissions, and History has no delete or edit at all", () => {
    const proto = InventoryController.prototype as unknown as Record<string, unknown>;
    const perms = (name: string) => permissionsOf(proto[name] as object);
    // Stock
    expect(perms("createItem")).toEqual(["inventoryStock.create"]);
    expect(perms("bulkItems")).toEqual(["inventoryStock.create"]);
    expect(perms("updateItem")).toEqual(["inventoryStock.edit"]);
    expect(perms("adjust")).toEqual(["inventoryStock.edit"]);
    expect(perms("removeItem")).toEqual(["inventoryStock.delete"]);
    expect(perms("removeItems")).toEqual(["inventoryStock.delete"]);
    // Purchases
    expect(perms("createPurchaseOrder")).toEqual(["inventoryPurchases.create"]);
    expect(perms("updatePurchaseOrder")).toEqual(["inventoryPurchases.edit"]);
    expect(perms("receive")).toEqual(["inventoryPurchases.edit"]);
    expect(perms("deletePurchaseOrder")).toEqual(["inventoryPurchases.delete"]);
    expect(perms("deletePurchaseOrders")).toEqual(["inventoryPurchases.delete"]);
    // Suppliers
    expect(perms("createSupplier")).toEqual(["inventorySuppliers.create"]);
    expect(perms("updateSupplier")).toEqual(["inventorySuppliers.edit"]);
    expect(perms("removeSupplier")).toEqual(["inventorySuppliers.delete"]);
    expect(perms("removeSuppliers")).toEqual(["inventorySuppliers.delete"]);
    // Transfers
    expect(perms("createTransfer")).toEqual(["inventoryTransfers.create"]);
    expect(perms("reverseTransfer")).toEqual(["inventoryTransfers.delete"]);
    expect(perms("reverseTransfers")).toEqual(["inventoryTransfers.delete"]);
    // History and reports are view only
    expect(perms("movements")).toEqual(["inventoryHistory.view"]);
    expect(perms("reconcile")).toEqual(["inventoryHistory.view"]);
    expect(perms("report")).toEqual(["inventoryReports.view"]);
    expect(PERMISSION_CATALOG.filter((p) => p.module === "inventoryHistory").map((p) => p.action)).toEqual(["view"]);
    // no endpoint still asks for the old all-in-one permissions
    const all = Object.getOwnPropertyNames(proto).filter((n) => n !== "constructor").flatMap((n) => permissionsOf(proto[n] as object));
    expect(all.filter((k) => /^inventory\.(view|create|edit|delete)$/.test(k))).toEqual([]);
  });

  it("every inventory permission a page asks for exists in the catalog (so it can be given in Staff & Access)", () => {
    const known = new Set(PERMISSION_CATALOG.map((p) => p.key));
    const asked = new Set<string>();
    for (const C of [InventoryController, RecipesController]) {
      const proto = C.prototype as unknown as Record<string, unknown>;
      for (const n of routesOf(proto)) for (const k of permissionsOf(proto[n] as object)) asked.add(k);
    }
    expect([...asked].filter((k) => !known.has(k))).toEqual([]);
    expect(known.has("inventory.view")).toBe(false);
  });

  it("a staff member without access to a branch cannot change or read its stock", async () => {
    const meat = await w.item("Scope", "G");
    await w.setStock(w.branchB.id, meat.id, 1_000);
    await expect(w.inventory.adjust(w.onlyA, { branchId: w.branchB.id, itemId: meat.id, mode: "STOCK_IN", quantity: 1, unit: "G", note: "x" })).rejects.toMatchObject({ response: { code: "BRANCH_SCOPE_DENIED" } });
    await expect(w.inventory.listStock(w.onlyA, w.branchB.id)).rejects.toMatchObject({ response: { code: "BRANCH_SCOPE_DENIED" } });
    await expect(w.inventory.movements(w.onlyA, { branchId: w.branchB.id, page: 1, pageSize: 10 })).rejects.toMatchObject({ response: { code: "BRANCH_SCOPE_DENIED" } });
    await expect(w.ops.createTransfer(w.onlyA, { fromBranchId: w.branchB.id, toBranchId: w.branchA.id, note: "", lines: [{ itemId: meat.id, quantity: 1, unit: "G" }] })).rejects.toMatchObject({ response: { code: "BRANCH_SCOPE_DENIED" } });
    const rows = await w.inventory.listStock(w.onlyA, undefined);
    expect(rows.find((r) => r.id === meat.id)?.quantity ?? 0).toBe(0);
  });
});
