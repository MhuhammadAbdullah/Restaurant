import { describe, expect, it } from "vitest";
import {
  INVENTORY_UNITS,
  INVENTORY_UNIT_KEYS,
  UNIT_GROUPS,
  createInventoryItemSchema,
  formatBestQty,
  formatQty,
  fromBaseQty,
  sameFamily,
  toBaseQty,
  unitFamily,
} from "@restaurant/validation";

const near = (a: number, b: number, tolerance = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance);

describe("units", () => {
  it("offers the common units of weight, volume, count and packaging", () => {
    for (const u of ["MG", "G", "KG", "OZ", "LB", "ML", "CL", "LITER", "TSP", "TBSP", "CUP", "FLOZ", "GALLON", "PIECE", "PAIR", "DOZEN", "PACK", "BOX", "BOTTLE", "CAN", "BAG", "CARTON", "TRAY", "JAR", "SACHET", "ROLL", "BUNCH", "SLICE"]) {
      expect(INVENTORY_UNIT_KEYS).toContain(u);
    }
  });

  it("every unit has a short label that is unique, and belongs to a listed group", () => {
    const labels = INVENTORY_UNIT_KEYS.map((k) => INVENTORY_UNITS[k].label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const k of INVENTORY_UNIT_KEYS) expect(UNIT_GROUPS).toContain(INVENTORY_UNITS[k].group);
  });

  it("weights convert correctly", () => {
    expect(toBaseQty(1, "KG")).toBe(1000);
    expect(toBaseQty(500, "MG")).toBe(0.5);
    near(toBaseQty(1, "LB"), 453.592);
    near(toBaseQty(16, "OZ"), 453.592, 0.2);
    near(fromBaseQty(toBaseQty(2, "LB"), "KG"), 0.907, 0.001);
  });

  it("volumes convert correctly", () => {
    expect(toBaseQty(1, "LITER")).toBe(1000);
    expect(toBaseQty(3, "TSP")).toBe(toBaseQty(1, "TBSP"));
    expect(toBaseQty(1, "CUP")).toBe(240);
    near(fromBaseQty(toBaseQty(1, "GALLON"), "LITER"), 3.785, 0.001);
    expect(toBaseQty(10, "CL")).toBe(100);
  });

  it("counts convert correctly", () => {
    expect(toBaseQty(2, "DOZEN")).toBe(24);
    expect(toBaseQty(3, "PAIR")).toBe(6);
  });

  it("units of one kind mix; different kinds, and packaging units, never mix", () => {
    expect(sameFamily("KG", "LB")).toBe(true);
    expect(sameFamily("G", "OZ")).toBe(true);
    expect(sameFamily("LITER", "TBSP")).toBe(true);
    expect(sameFamily("PIECE", "DOZEN")).toBe(true);
    expect(sameFamily("KG", "LITER")).toBe(false);
    expect(sameFamily("KG", "PIECE")).toBe(false);
    // a box and a bag have no fixed size, so they are never converted into each other or into pieces
    expect(sameFamily("BOX", "BAG")).toBe(false);
    expect(sameFamily("BOX", "PIECE")).toBe(false);
    expect(sameFamily("BOX", "BOX")).toBe(true);
    expect(unitFamily("BOTTLE")).toBe("BOTTLE");
  });

  it("shows quantities in a friendly unit", () => {
    expect(formatQty(2500, "KG")).toBe("2.5 kg");
    expect(formatQty(toBaseQty(5, "TBSP"), "TBSP")).toBe("5 tbsp");
    expect(formatBestQty(1500, "WEIGHT")).toBe("1.5 kg");
    expect(formatBestQty(800, "WEIGHT")).toBe("800 g");
    expect(formatBestQty(0.5, "WEIGHT")).toBe("500 mg");
    expect(formatBestQty(2500, "VOLUME")).toBe("2.5 L");
    expect(formatBestQty(24, "COUNT")).toBe("24 pcs");
    expect(formatBestQty(6, "BOX")).toBe("6 box");
  });

  it("an item can be created in any listed unit, and an unknown unit is refused", () => {
    for (const k of INVENTORY_UNIT_KEYS) expect(createInventoryItemSchema.safeParse({ name: "X", unit: k }).success).toBe(true);
    expect(createInventoryItemSchema.safeParse({ name: "X", unit: "FURLONG" }).success).toBe(false);
  });
});
