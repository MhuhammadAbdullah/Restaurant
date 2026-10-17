import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, type World } from "../../../test/fixtures";
import { OrdersService } from "./orders.service";
import { ProductPricingService } from "./product-pricing.service";

/** The POS "place order" path, run in the isolated test schema inside a throw-away restaurant. Other services are stood in for. */
let w: World;
let svc: OrdersService;
let staff: typeof w.owner;
const announced: { order: { id: string } }[] = [];
const item = (productId: string, quantity = 1) => ({ kind: "product" as const, productId, quantity, choices: [], addons: [] });
const base = () => ({ branchId: w.branchA.id, type: "TAKEAWAY" as const, items: [item(w.burger.id)], loyaltyPointsToRedeem: 0, paymentMethod: "CASH" as const });
const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
};

beforeAll(async () => {
  w = await buildWorld();
  // a real staff member: the order records who placed it
  const role = await w.prisma.role.create({ data: { restaurantId: w.restaurant.id, name: "Cashier" } });
  const person = await w.prisma.staffUser.create({ data: { restaurantId: w.restaurant.id, roleId: role.id, name: "Cashier", email: `cashier-${w.restaurant.id}@example.com`, passwordHash: "x", allBranchesAccess: true } });
  staff = { ...w.owner, sub: person.id, roleId: role.id };
  const ctx = { getRestaurantId: async () => w.restaurant.id } as never;
  const stub = {} as never;
  svc = new OrdersService(
    w.prisma,
    ctx,
    stub,
    new ProductPricingService(w.prisma),
    stub,
    stub,
    stub,
    stub,
    stub,
    { emitOrderCreated: (e: { order: { id: string } }) => announced.push(e) } as never,
    { awardPoints: async () => undefined } as never,
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
  await raw.staffUser.deleteMany({ where: { restaurantId: w.restaurant.id } });
  await raw.$disconnect();
  await w.destroy();
});

describe("placing a POS order", () => {
  it("saves the order with its payment and gives the cashier the answer straight away; the live feed follows in the background", async () => {
    const quote = await svc.quotePosOrder(staff, { branchId: w.branchA.id, type: "TAKEAWAY", items: [item(w.burger.id, 2)], loyaltyPointsToRedeem: 0 });
    const order = await svc.createPosOrder(staff, { ...base(), items: [item(w.burger.id, 2)], amountTendered: quote.grandTotal + 5_000, clientTotal: quote.grandTotal });
    expect(order).toMatchObject({ grandTotal: quote.grandTotal, type: "TAKEAWAY", paymentStatus: "PAID", status: "CONFIRMED" });
    expect(order.orderNumber).toMatch(/^ORD-\d{8}-\d{4}$/);
    expect(order.orderCode).toMatch(/^[A-Z]{6,8}$/);
    const payment = await w.prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(payment).toMatchObject({ method: "CASH", status: "PAID", amount: quote.grandTotal, amountTendered: quote.grandTotal + 5_000 });
    expect(await w.prisma.orderItem.count({ where: { orderId: order.id } })).toBe(1);
    expect(await w.prisma.receipt.count({ where: { orderId: order.id } })).toBe(1);
    await until(() => announced.some((a) => a.order.id === order.id));
    const event = announced.find((a) => a.order.id === order.id) as unknown as { order: { items: unknown[] } };
    expect(event, "the live feed still gets the full order").toBeTruthy();
    expect(event.order.items.length).toBe(1);
  });

  it("the same request sent twice (a double click) makes one order", async () => {
    const key = `dbl-${Date.now()}`;
    const results = await Promise.allSettled([svc.createPosOrder(staff, { ...base(), idempotencyKey: key }), svc.createPosOrder(staff, { ...base(), idempotencyKey: key })]);
    // one of them may lose the race on the unique key; whatever happens, only one order exists
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await w.prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);
    const again = await svc.createPosOrder(staff, { ...base(), idempotencyKey: key });
    expect((await w.prisma.order.findUnique({ where: { idempotencyKey: key } }))!.id).toBe(again.id);
  });

  it("refuses cash that does not cover the total, and saves nothing", async () => {
    const before = await w.prisma.order.count({ where: { restaurantId: w.restaurant.id } });
    await expect(svc.createPosOrder(staff, { ...base(), amountTendered: 100 })).rejects.toMatchObject({ response: { code: "INSUFFICIENT_CASH_TENDERED" } });
    expect(await w.prisma.order.count({ where: { restaurantId: w.restaurant.id } })).toBe(before);
  });

  it("refuses a total the screen showed that is out of date", async () => {
    await expect(svc.createPosOrder(staff, { ...base(), clientTotal: 1 })).rejects.toMatchObject({ response: { code: "TOTAL_MISMATCH" } });
  });

  it("dine-in occupies the table; an unknown table is refused", async () => {
    const table = await w.prisma.restaurantTable.create({ data: { branchId: w.branchA.id, number: "T1" } });
    const order = await svc.createPosOrder(staff, { ...base(), type: "DINE_IN", tableId: table.id });
    expect(order.paymentStatus).toBe("PENDING");
    expect((await w.prisma.restaurantTable.findUnique({ where: { id: table.id } }))!.status).toBe("OCCUPIED");
    await expect(svc.createPosOrder(staff, { ...base(), type: "DINE_IN", tableId: "no-such-table" })).rejects.toMatchObject({ response: { code: "TABLE_NOT_FOUND" } });
  });

  it("creates the customer profile from a phone and name, and a blocked phone cannot order", async () => {
    const ok = await svc.createPosOrder(staff, { ...base(), customerName: "Sara", customerPhone: "03005550101" });
    expect(ok.customerId).toBeTruthy();
    expect((await w.prisma.customer.findUnique({ where: { id: ok.customerId! } }))).toMatchObject({ name: "Sara", phone: "03005550101" });
    await w.prisma.customer.update({ where: { id: ok.customerId! }, data: { status: "INACTIVE" } });
    await expect(svc.createPosOrder(staff, { ...base(), customerPhone: "03005550101", customerName: "Sara" })).rejects.toMatchObject({ response: { code: "ACCOUNT_BLOCKED" } });
  });

  it("every order gets the time its kind of order should take at the branch, which the POS timer counts down to", async () => {
    const mins = async (type: "TAKEAWAY" | "DINE_IN" | "DELIVERY") => {
      const table = type === "DINE_IN" ? await w.prisma.restaurantTable.create({ data: { branchId: w.branchA.id, number: `TT-${Math.random().toString(36).slice(2, 6)}` } }) : null;
      const order = await svc.createPosOrder(staff, { ...base(), type, tableId: table?.id, ...(type === "DELIVERY" ? { customerName: "D", customerPhone: "03005550999", deliveryAddress: { city: "Karachi", area: "DHA", addressLine: "House 1" } } : {}) });
      const row = (await w.prisma.order.findUnique({ where: { id: order.id } }))!;
      return Math.round((row.estimatedDeliveryAt!.getTime() - row.createdAt.getTime()) / 60_000);
    };
    expect(await mins("TAKEAWAY")).toBe(15);
    expect(await mins("DINE_IN")).toBe(25);
    expect(await mins("DELIVERY")).toBe(45);
    // a branch that promises no time for takeaway leaves the order without one
    await w.prisma.branch.update({ where: { id: w.branchA.id }, data: { estimatedTakeawayMins: 0 } });
    const none = await svc.createPosOrder(staff, base());
    expect((await w.prisma.order.findUnique({ where: { id: none.id } }))!.estimatedDeliveryAt).toBeNull();
    await w.prisma.branch.update({ where: { id: w.branchA.id }, data: { estimatedTakeawayMins: 15 } });
  });

  it("the active orders list (for the POS drawer) carries what is in each order and the branch times, and drops finished orders", async () => {
    const order = await svc.createPosOrder(staff, { ...base(), items: [item(w.burger.id, 2)] });
    const active = await svc.listOrdersForStaff(staff, { branchId: w.branchA.id, active: true });
    const row = active.find((o) => o.id === order.id) as unknown as { items: { nameSnapshot: string; quantity: number }[]; branch: { estimatedTakeawayMins: number }; estimatedDeliveryAt: Date | null };
    expect(row, "a new order is active").toBeTruthy();
    expect(row.items).toEqual([expect.objectContaining({ nameSnapshot: "Burger", quantity: 2 })]);
    expect(row.branch.estimatedTakeawayMins).toBe(15);
    expect(row.estimatedDeliveryAt).toBeInstanceOf(Date);
    for (const status of ["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"] as const) {
      await w.prisma.order.update({ where: { id: order.id }, data: { status } });
      expect((await svc.listOrdersForStaff(staff, { branchId: w.branchA.id, active: true })).some((o) => o.id === order.id), status).toBe(false);
    }
    // the ordinary list is unchanged: it has no items
    const plain = (await svc.listOrdersForStaff(staff, { branchId: w.branchA.id })).find((o) => o.id === order.id) as unknown as { items?: unknown };
    expect(plain.items).toBeUndefined();
  });

  it("orders placed at the same moment get different numbers", async () => {
    const orders = await Promise.all([1, 2, 3, 4].map(() => svc.createPosOrder(staff, base())));
    expect(new Set(orders.map((o) => o.orderNumber)).size).toBe(4);
    expect(new Set(orders.map((o) => o.dailyNo)).size).toBe(4);
    expect(new Set(orders.map((o) => o.orderCode)).size).toBe(4);
  });

  it("an unavailable item is refused before anything is saved", async () => {
    const before = await w.prisma.order.count({ where: { restaurantId: w.restaurant.id } });
    await expect(svc.createPosOrder(staff, { ...base(), items: [item(w.fries.id)] })).rejects.toBeTruthy(); // fries have no availability at this branch
    expect(await w.prisma.order.count({ where: { restaurantId: w.restaurant.id } })).toBe(before);
  });
});
