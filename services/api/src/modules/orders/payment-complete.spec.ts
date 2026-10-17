import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, type World } from "../../../test/fixtures";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { OrdersService } from "./orders.service";
import { ProductPricingService } from "./product-pricing.service";

/**
 * Marking an order as paid completes it, and a payment marked by mistake can be reversed. Runs in the isolated test schema
 * inside a throw-away restaurant; the services around the order service are stood in for.
 */
let w: World;
let svc: OrdersService;
let staff: typeof w.owner;
const item = (productId: string) => ({ kind: "product" as const, productId, quantity: 1, choices: [], addons: [] });
const place = (extra: Record<string, unknown> = {}) =>
  svc.createPosOrder(staff, { branchId: w.branchA.id, type: "TAKEAWAY", items: [item(w.burger.id)], loyaltyPointsToRedeem: 0, paymentMethod: "CARD", ...extra } as never);
const row = (id: string) => w.prisma.order.findUniqueOrThrow({ where: { id } });
const audit = (id: string, action: string) => w.prisma.auditLog.findMany({ where: { entityType: "Order", entityId: id, action }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  w = await buildWorld();
  const role = await w.prisma.role.create({ data: { restaurantId: w.restaurant.id, name: "Cashier" } });
  const person = await w.prisma.staffUser.create({ data: { restaurantId: w.restaurant.id, roleId: role.id, name: "Cashier", email: `pay-${w.restaurant.id}@example.com`, passwordHash: "x", allBranchesAccess: true } });
  staff = { ...w.owner, sub: person.id, roleId: role.id };
  const stub = {} as never;
  svc = new OrdersService(
    w.prisma,
    { getRestaurantId: async () => w.restaurant.id } as never,
    stub,
    new ProductPricingService(w.prisma),
    stub,
    stub,
    stub,
    new AuditLogService(w.prisma),
    stub,
    { emitOrderCreated: () => undefined, emitOrderStatusChanged: () => undefined, emitOrderUpdated: () => undefined } as never,
    { awardPoints: async () => undefined, getConfig: async () => ({}) } as never,
    stub,
    stub,
    stub,
    stub,
  );
  await w.prisma.productBranchAvailability.create({ data: { productId: w.burger.id, branchId: w.branchA.id, isAvailable: true } });
}, 120_000);

afterAll(async () => {
  const raw = new (await import("@restaurant/database")).PrismaClient();
  await raw.order.deleteMany({ where: { restaurantId: w.restaurant.id } });
  await raw.auditLog.deleteMany({ where: { restaurantId: w.restaurant.id } });
  await raw.staffUser.deleteMany({ where: { restaurantId: w.restaurant.id } });
  await raw.$disconnect();
  await w.destroy();
});

describe("marking an order as paid completes it", () => {
  it("a ready order whose card payment is confirmed becomes completed, and the status it had is remembered", async () => {
    const order = await place();
    await w.prisma.order.update({ where: { id: order.id }, data: { status: "READY" } });
    await svc.confirmPayment(staff, order.id, {});
    const after = await row(order.id);
    expect(after).toMatchObject({ paymentStatus: "PAID", status: "COMPLETED" });
    const [entry] = await audit(order.id, "order.completedByPayment");
    expect(entry!.oldValue).toEqual({ status: "READY" });
  });

  it("an order the kitchen is still cooking keeps its status when it is marked paid, so the kitchen still sees it", async () => {
    const order = await place();
    expect(order.status).toBe("CONFIRMED");
    await svc.confirmPayment(staff, order.id, {});
    expect(await row(order.id)).toMatchObject({ paymentStatus: "PAID", status: "CONFIRMED" });
    await w.prisma.order.update({ where: { id: order.id }, data: { status: "PREPARING" } });
    expect((await row(order.id)).status).toBe("PREPARING");
    expect(await audit(order.id, "order.completedByPayment")).toHaveLength(0);
  });

  it("a dine-in bill paid in cash completes the order and frees the table", async () => {
    const table = await w.prisma.restaurantTable.create({ data: { branchId: w.branchA.id, number: "P1" } });
    const order = await place({ type: "DINE_IN", tableId: table.id });
    expect((await w.prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("OCCUPIED");
    const grand = (await row(order.id)).grandTotal;
    await svc.recordPayment(staff, order.id, { method: "CASH", amount: grand, amountTendered: grand });
    expect(await row(order.id)).toMatchObject({ paymentStatus: "PAID", status: "COMPLETED" });
    expect((await w.prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("AVAILABLE");
  });

  it("a delivered cash-on-delivery order is completed when the rider's cash is received", async () => {
    const order = await place();
    await w.prisma.order.update({ where: { id: order.id }, data: { paymentMethod: "COD", status: "DELIVERED" } });
    await w.prisma.payment.updateMany({ where: { orderId: order.id }, data: { method: "COD", provider: "cod" } });
    await svc.settleCodCash(staff, { orderIds: [order.id] } as never);
    expect(await row(order.id)).toMatchObject({ paymentStatus: "PAID", status: "COMPLETED" });
  });

  it("cancelled and refunded orders are never completed by a payment", async () => {
    for (const status of ["CANCELLED", "REFUNDED"] as const) {
      const order = await place();
      await w.prisma.order.update({ where: { id: order.id }, data: { status } });
      await svc.confirmPayment(staff, order.id, {});
      expect((await row(order.id)).status).toBe(status);
    }
  });
});

describe("reversing a payment marked as paid by mistake", () => {
  it("makes the order unpaid again and puts it back to the status it had", async () => {
    const order = await place();
    await w.prisma.order.update({ where: { id: order.id }, data: { status: "READY" } });
    await svc.confirmPayment(staff, order.id, {});
    const payment = (await w.prisma.payment.findFirst({ where: { orderId: order.id, status: "PAID" } }))!;
    const reversed = await svc.reversePayment(staff, order.id, payment.id, "tapped the wrong order");
    expect(reversed).toMatchObject({ paymentStatus: "PENDING", status: "READY" });
    expect((await w.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("CANCELLED");
    const [log] = await audit(order.id, "order.paymentReversed");
    expect(log!.newValue).toMatchObject({ paymentId: payment.id, restoredStatus: "READY", reason: "tapped the wrong order" });
    // and it can be marked paid again afterwards
    await svc.recordPayment(staff, order.id, { method: "CASH", amount: reversed.grandTotal, amountTendered: reversed.grandTotal });
    expect(await row(order.id)).toMatchObject({ paymentStatus: "PAID", status: "COMPLETED" });
  });

  it("a dine-in bill goes back to open and its table is occupied again", async () => {
    const table = await w.prisma.restaurantTable.create({ data: { branchId: w.branchA.id, number: "P2" } });
    const order = await place({ type: "DINE_IN", tableId: table.id });
    const grand = (await row(order.id)).grandTotal;
    await svc.recordPayment(staff, order.id, { method: "CASH", amount: grand, amountTendered: grand });
    const payment = (await w.prisma.payment.findFirst({ where: { orderId: order.id, status: "PAID" } }))!;
    const reversed = await svc.reversePayment(staff, order.id, payment.id);
    expect(reversed).toMatchObject({ paymentStatus: "PENDING", status: "CONFIRMED" });
    expect((await w.prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("OCCUPIED");
  });

  it("does not take a table back that somebody else has sat down at", async () => {
    const table = await w.prisma.restaurantTable.create({ data: { branchId: w.branchA.id, number: "P3" } });
    const order = await place({ type: "DINE_IN", tableId: table.id });
    const grand = (await row(order.id)).grandTotal;
    await svc.recordPayment(staff, order.id, { method: "CASH", amount: grand, amountTendered: grand });
    await w.prisma.restaurantTable.update({ where: { id: table.id }, data: { status: "RESERVED" } });
    const payment = (await w.prisma.payment.findFirst({ where: { orderId: order.id, status: "PAID" } }))!;
    await svc.reversePayment(staff, order.id, payment.id);
    expect((await w.prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("RESERVED");
  });

  it("a payment that was never marked as paid cannot be reversed, nor one that went through the online gateway", async () => {
    const order = await place();
    const pending = (await w.prisma.payment.findFirst({ where: { orderId: order.id } }))!;
    await expect(svc.reversePayment(staff, order.id, pending.id)).rejects.toMatchObject({ response: { code: "PAYMENT_NOT_PAID" } });
    await w.prisma.payment.update({ where: { id: pending.id }, data: { status: "PAID", provider: "payfast" } });
    await expect(svc.reversePayment(staff, order.id, pending.id)).rejects.toMatchObject({ response: { code: "PAYMENT_NOT_REVERSIBLE" } });
    await expect(svc.reversePayment(staff, order.id, "no-such-payment")).rejects.toMatchObject({ response: { code: "PAYMENT_NOT_FOUND" } });
  });

  it("an order is never reversed twice, and a cash-on-delivery hand-in is no longer fully received", async () => {
    const order = await place();
    await w.prisma.order.update({ where: { id: order.id }, data: { paymentMethod: "COD", status: "DELIVERED" } });
    await w.prisma.payment.updateMany({ where: { orderId: order.id }, data: { method: "COD", provider: "cod" } });
    await svc.settleCodCash(staff, { orderIds: [order.id] } as never);
    const payment = (await w.prisma.payment.findFirst({ where: { orderId: order.id, status: "PAID" } }))!;
    const reversed = await svc.reversePayment(staff, order.id, payment.id);
    expect(reversed).toMatchObject({ paymentStatus: "PENDING", status: "DELIVERED" });
    await expect(svc.reversePayment(staff, order.id, payment.id)).rejects.toMatchObject({ response: { code: "PAYMENT_NOT_PAID" } });
  });
});
