// Removes leftover throw-away restaurants from the ISOLATED inv_test schema (never public).
const fs = require("fs");
const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m) env[m[1]] = m[2];
}
const withSchema = (u) => u + (u.includes("?") ? "&" : "?") + "schema=inv_test";
process.env.DATABASE_URL = withSchema(env.DATABASE_URL);
process.env.DIRECT_URL = withSchema(env.DIRECT_URL);
if (!process.env.DATABASE_URL.includes("schema=inv_test")) throw new Error("guard");
const { PrismaClient } = require("@restaurant/database");
(async () => {
  const p = new PrismaClient();
  const list = await p.restaurant.findMany({ where: { name: { startsWith: "TEST-" } }, select: { id: true, name: true } });
  console.log("leftover test restaurants:", list.length);
  for (const r of list) {
    try {
      await p.stockMovement.deleteMany({ where: { restaurantId: r.id } });
      await p.purchaseOrder.deleteMany({ where: { restaurantId: r.id } });
      await p.stockTransfer.deleteMany({ where: { restaurantId: r.id } });
      await p.restaurant.delete({ where: { id: r.id } });
      console.log("deleted", r.name);
    } catch (e) {
      console.log("could not delete", r.name, "->", e.message.split("\n").filter(Boolean).slice(-2).join(" "));
    }
  }
  console.log("restaurants now:", (await p.restaurant.findMany({ select: { name: true } })).map((x) => x.name).join(", "));
  await p.$disconnect();
})().catch((e) => { console.log("ERR", e.message); process.exit(1); });
