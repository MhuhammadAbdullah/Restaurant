import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, type World } from "../../../test/fixtures";
import { CustomersService } from "./customers.service";

/** Runs in the isolated test schema (see test/setup.ts), inside a throw-away restaurant. */
let w: World;
let customers: CustomersService;
let otherRestaurantId: string;
const phone = "03001234567";

beforeAll(async () => {
  w = await buildWorld();
  customers = new CustomersService(w.prisma, { getRestaurantId: async () => w.restaurant.id } as never);
  const ali = await w.prisma.customer.create({ data: { restaurantId: w.restaurant.id, name: "Ali Raza", phone, email: `ali-${w.restaurant.id}@example.com`, isGuest: false } });
  await w.prisma.customerAddress.create({ data: { customerId: ali.id, label: "Office", city: "Karachi", area: "Clifton", addressLine: "Office 4, Dolmen Mall", isDefault: false } });
  await w.prisma.customerAddress.create({ data: { customerId: ali.id, label: "Home", city: "Karachi", area: "DHA", addressLine: "House 12, Street 5", landmark: "Near the park", contactNumber: "03111111111", isDefault: true } });
  await w.prisma.customer.create({ data: { restaurantId: w.restaurant.id, name: "Ali Khan", phone: "03009998888", isGuest: false } });
  // a customer of ANOTHER restaurant with a similar number must never show up
  const other = await w.prisma.restaurant.create({ data: { name: `TEST-OTHER-${w.restaurant.id}` } });
  otherRestaurantId = other.id;
  await w.prisma.customer.create({ data: { restaurantId: other.id, name: "Someone Else", phone: "03001234500", isGuest: false } });
}, 120_000);

afterAll(async () => {
  const raw = new (await import("@restaurant/database")).PrismaClient();
  await raw.order.deleteMany({ where: { restaurantId: w.restaurant.id } });
  await raw.customer.deleteMany({ where: { restaurantId: otherRestaurantId } });
  await raw.restaurant.delete({ where: { id: otherRestaurantId } }).catch(() => undefined);
  await raw.customer.deleteMany({ where: { restaurantId: w.restaurant.id } });
  await raw.$disconnect();
  await w.destroy();
});

describe("POS customer lookup by phone", () => {
  it("finds the customer however the number is written", async () => {
    for (const q of [phone, "0300 1234567", "+92 300 1234567", "923001234567", "0300-123", "+92300123"]) {
      const found = await customers.lookupForPos(q);
      expect(found.map((c) => c.name), q).toContain("Ali Raza");
    }
  });

  it("returns the saved addresses, the default one first, with the contact number and landmark", async () => {
    const [ali] = await customers.lookupForPos(phone);
    expect(ali!.addresses.map((a) => a.label)).toEqual(["Home", "Office"]);
    expect(ali!.addresses[0]).toMatchObject({ city: "Karachi", area: "DHA", addressLine: "House 12, Street 5", landmark: "Near the park", contactNumber: "03111111111", isDefault: true });
    expect(ali!.email).toContain("@example.com");
  });

  it("a customer with no saved address brings the address and second phone of their last delivery order", async () => {
    const khan = await w.prisma.customer.findFirstOrThrow({ where: { restaurantId: w.restaurant.id, name: "Ali Khan" } });
    const mk = (n: string, line: string, area: string, alt: string | null) =>
      w.prisma.order.create({
        data: { orderNumber: `ORD-LK-${w.restaurant.id.slice(-6)}-${n}`, restaurantId: w.restaurant.id, branchId: w.branchA.id, customerId: khan.id, type: "DELIVERY", paymentMethod: "CASH", subtotal: 100, grandTotal: 100, deliveryAddressSnapshot: line, deliveryCity: "Karachi", deliveryArea: area, deliveryLandmark: "Near the bank", contactAlternatePhone: alt },
      });
    await mk("1", "Old house 1", "Clifton", null);
    await new Promise((r) => setTimeout(r, 20));
    await mk("2", "Flat 9, Block 4", "Gulshan-e-Iqbal", "03112223344");
    const [found] = await customers.lookupForPos("Ali Khan");
    expect(found!.addresses).toHaveLength(1);
    expect(found!.addresses[0]).toMatchObject({ label: "Last order", city: "Karachi", area: "Gulshan-e-Iqbal", addressLine: "Flat 9, Block 4", landmark: "Near the bank", contactNumber: "03112223344" });
    // a customer who does have saved addresses keeps those
    const [ali] = await customers.lookupForPos("Ali Raza");
    expect(ali!.addresses.map((x) => x.label)).toEqual(["Home", "Office"]);
  });

  it("returns every match so the cashier can choose between them", async () => {
    const found = await customers.lookupForPos("0300");
    expect(found.map((c) => c.name).sort()).toEqual(["Ali Khan", "Ali Raza"]);
  });

  it("never returns a customer of another restaurant", async () => {
    const found = await customers.lookupForPos("03001234500");
    expect(found.map((c) => c.name)).not.toContain("Someone Else");
  });

  it("returns nothing for too few digits", async () => {
    expect(await customers.lookupForPos("030")).toEqual([]);
    expect(await customers.lookupForPos("a")).toEqual([]);
  });

  it("finds a customer by name (any case, part of the name) or by email", async () => {
    expect((await customers.lookupForPos("raza")).map((c) => c.name)).toEqual(["Ali Raza"]);
    expect((await customers.lookupForPos("ALI")).map((c) => c.name).sort()).toEqual(["Ali Khan", "Ali Raza"]);
    expect((await customers.lookupForPos("ali-")).map((c) => c.name)).toContain("Ali Raza");
    expect(await customers.lookupForPos("nobody-here")).toEqual([]);
  });

  it("with nothing typed, returns the most recent customers of this restaurant only", async () => {
    const recent = await customers.lookupForPos("");
    expect(recent.map((c) => c.name).sort()).toEqual(["Ali Khan", "Ali Raza"]);
    expect(recent.map((c) => c.name)).not.toContain("Someone Else");
  });

  it("returns nothing when no number matches", async () => {
    expect(await customers.lookupForPos("03451112222")).toEqual([]);
  });
});
