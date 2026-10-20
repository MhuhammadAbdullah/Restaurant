import { describe, expect, it } from "vitest";
import { parsePrintParts, printOptionsFor, printPartsParam } from "@restaurant/utils";

const keys = (o: Parameters<typeof printOptionsFor>[0]) => printOptionsFor(o).map((x) => x.key);

describe("print options for an order", () => {
  it("an unpaid open order can print the customer receipt, the pre-payment bill and the kitchen slip", () => {
    expect(keys({ type: "DINE_IN", status: "CONFIRMED", paymentStatus: "PENDING" })).toEqual(["customer", "pre", "kitchen"]);
    expect(keys({ type: "TAKEAWAY", status: "PREPARING", paymentStatus: "PARTIALLY_PAID" })).toEqual(["customer", "pre", "kitchen"]);
  });

  it("a paid order has no pre-payment bill, and neither has a finished or cancelled one", () => {
    expect(keys({ type: "TAKEAWAY", status: "PREPARING", paymentStatus: "PAID" })).toEqual(["customer", "kitchen"]);
    for (const status of ["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"]) {
      expect(keys({ type: "DINE_IN", status, paymentStatus: "PENDING" })).toEqual(["customer", "kitchen"]);
    }
  });

  it("an order with added items also offers the full kitchen order and a slip for each addition, newest first", () => {
    const k = keys({
      type: "DINE_IN",
      status: "CONFIRMED",
      paymentStatus: "PAID",
      revisions: [
        { id: "r1", createdAt: "2026-10-20T10:00:00Z" },
        { id: "r2", createdAt: "2026-10-20T10:30:00Z" },
      ],
    });
    expect(k).toEqual(["customer", "kitchen", "full", "rev:r2", "rev:r1"]);
  });

  it("offers at most the latest four additions", () => {
    const revisions = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, createdAt: `2026-10-20T1${i}:00:00Z` }));
    expect(keys({ type: "DINE_IN", status: "CONFIRMED", paymentStatus: "PAID", revisions }).filter((x) => x.startsWith("rev:"))).toEqual(["rev:r6", "rev:r5", "rev:r4", "rev:r3"]);
  });
});

describe("the parts of the print page address", () => {
  it("any mix is read back in the order the slips print: customer, pre-bill, kitchen, full, additions", () => {
    expect(parsePrintParts("kitchen,pre,customer").map((s) => s.key)).toEqual(["customer", "pre", "kitchen"]);
    expect(parsePrintParts("rev:b,full,rev:a").map((s) => s.key)).toEqual(["full", "rev:b", "rev:a"]);
    expect(parsePrintParts("full").map((s) => s.kind)).toEqual(["kitchen-full"]);
    expect(parsePrintParts("rev:abc")).toEqual([{ key: "rev:abc", kind: "kitchen-extra", revisionId: "abc" }]);
  });

  it("'both' means customer and kitchen, and so does nothing at all (what the POS has always used)", () => {
    expect(parsePrintParts("both").map((s) => s.key)).toEqual(["customer", "kitchen"]);
    expect(parsePrintParts(null).map((s) => s.key)).toEqual(["customer", "kitchen"]);
    expect(parsePrintParts("").map((s) => s.key)).toEqual(["customer", "kitchen"]);
  });

  it("repeats and unknown or empty names are dropped", () => {
    expect(parsePrintParts("customer,customer,nonsense,rev:,kitchen").map((s) => s.key)).toEqual(["customer", "kitchen"]);
  });

  it("a chosen set travels in the address and comes back the same", () => {
    const chosen = ["customer", "kitchen", "rev:ckx123"];
    expect(parsePrintParts(decodeURIComponent(printPartsParam(chosen))).map((s) => s.key)).toEqual(chosen);
    expect(printPartsParam(["customer", "rev:a"])).toBe("customer,rev%3Aa");
  });
});
