import { z } from "zod";

/**
 * Inventory units. Stock is stored in one base unit per kind (grams for weight, millilitres for volume, pieces for
 * count), so units of the same kind mix safely: an item kept in kg can be added to in g, lb or oz and the maths still
 * works. Packaging units (box, bottle, bag...) have no fixed size, so each one is its own kind and is never converted.
 */
export const INVENTORY_UNITS = {
  // Weight (base: gram)
  MG: { family: "WEIGHT", group: "Weight", toBase: 0.001, label: "mg", name: "Milligram (mg)" },
  G: { family: "WEIGHT", group: "Weight", toBase: 1, label: "g", name: "Gram (g)" },
  KG: { family: "WEIGHT", group: "Weight", toBase: 1000, label: "kg", name: "Kilogram (kg)" },
  OZ: { family: "WEIGHT", group: "Weight", toBase: 28.3495, label: "oz", name: "Ounce (oz)" },
  LB: { family: "WEIGHT", group: "Weight", toBase: 453.592, label: "lb", name: "Pound (lb)" },
  // Volume (base: millilitre)
  ML: { family: "VOLUME", group: "Volume", toBase: 1, label: "ml", name: "Millilitre (ml)" },
  CL: { family: "VOLUME", group: "Volume", toBase: 10, label: "cl", name: "Centilitre (cl)" },
  LITER: { family: "VOLUME", group: "Volume", toBase: 1000, label: "L", name: "Litre (L)" },
  TSP: { family: "VOLUME", group: "Volume", toBase: 5, label: "tsp", name: "Teaspoon (tsp)" },
  TBSP: { family: "VOLUME", group: "Volume", toBase: 15, label: "tbsp", name: "Tablespoon (tbsp)" },
  CUP: { family: "VOLUME", group: "Volume", toBase: 240, label: "cup", name: "Cup (240 ml)" },
  FLOZ: { family: "VOLUME", group: "Volume", toBase: 29.5735, label: "fl oz", name: "Fluid ounce (fl oz)" },
  GALLON: { family: "VOLUME", group: "Volume", toBase: 3785.41, label: "gal", name: "Gallon (gal)" },
  // Count (base: piece)
  PIECE: { family: "COUNT", group: "Count", toBase: 1, label: "pcs", name: "Piece (pcs)" },
  PAIR: { family: "COUNT", group: "Count", toBase: 2, label: "pair", name: "Pair (2 pcs)" },
  DOZEN: { family: "COUNT", group: "Count", toBase: 12, label: "dozen", name: "Dozen (12 pcs)" },
  // Packaging: no fixed size, so each is counted on its own
  PACK: { family: "PACK", group: "Packaging", toBase: 1, label: "pack", name: "Pack" },
  BOX: { family: "BOX", group: "Packaging", toBase: 1, label: "box", name: "Box" },
  BOTTLE: { family: "BOTTLE", group: "Packaging", toBase: 1, label: "bottle", name: "Bottle" },
  CAN: { family: "CAN", group: "Packaging", toBase: 1, label: "can", name: "Can" },
  BAG: { family: "BAG", group: "Packaging", toBase: 1, label: "bag", name: "Bag" },
  CARTON: { family: "CARTON", group: "Packaging", toBase: 1, label: "carton", name: "Carton" },
  TRAY: { family: "TRAY", group: "Packaging", toBase: 1, label: "tray", name: "Tray" },
  JAR: { family: "JAR", group: "Packaging", toBase: 1, label: "jar", name: "Jar" },
  SACHET: { family: "SACHET", group: "Packaging", toBase: 1, label: "sachet", name: "Sachet" },
  ROLL: { family: "ROLL", group: "Packaging", toBase: 1, label: "roll", name: "Roll" },
  BUNCH: { family: "BUNCH", group: "Packaging", toBase: 1, label: "bunch", name: "Bunch" },
  SLICE: { family: "SLICE", group: "Packaging", toBase: 1, label: "slice", name: "Slice" },
} as const;

export type InventoryUnit = keyof typeof INVENTORY_UNITS;
export type UnitFamily = (typeof INVENTORY_UNITS)[InventoryUnit]["family"];
export const INVENTORY_UNIT_KEYS = Object.keys(INVENTORY_UNITS) as [InventoryUnit, ...InventoryUnit[]];

export const unitFamily = (u: InventoryUnit): UnitFamily => INVENTORY_UNITS[u].family;
export const sameFamily = (a: InventoryUnit, b: InventoryUnit) => unitFamily(a) === unitFamily(b);
/** 2 kg -> 2000 (grams). */
export const toBaseQty = (qty: number, unit: InventoryUnit) => qty * INVENTORY_UNITS[unit].toBase;
/** 2500 (grams) shown in kg -> 2.5 */
export const fromBaseQty = (base: number, unit: InventoryUnit) => base / INVENTORY_UNITS[unit].toBase;

/** "2.5 kg", "350 g" ... trims useless zeros. */
export function formatQty(base: number, unit: InventoryUnit): string {
  const v = fromBaseQty(base, unit);
  const text = Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  return `${text} ${INVENTORY_UNITS[unit].label}`;
}

/** Shows a quantity in the friendliest unit of its kind: 1500 g -> "1.5 kg", 800 g -> "800 g", 0.5 g -> "500 mg". */
export function formatBestQty(base: number, family: UnitFamily): string {
  const abs = Math.abs(base);
  if (family === "WEIGHT") return formatQty(base, abs >= 1000 ? "KG" : abs > 0 && abs < 1 ? "MG" : "G");
  if (family === "VOLUME") return formatQty(base, abs >= 1000 ? "LITER" : "ML");
  if (family === "COUNT") return formatQty(base, "PIECE");
  // A packaging unit is its own kind, named like the unit.
  return formatQty(base, family as InventoryUnit);
}

/** The units in the order they are listed, with their group headings (Weight, Volume, Count, Packaging). */
export const UNIT_GROUPS = ["Weight", "Volume", "Count", "Packaging"] as const;

const qty = z.number().positive("Enter a quantity above zero").max(100_000_000);
const unitSchema = z.enum(INVENTORY_UNIT_KEYS);

export const MOVEMENT_TYPES = ["OPENING", "PURCHASE", "SALE", "RETURN", "ADJUSTMENT", "WASTE", "STOCK_IN", "STOCK_OUT", "TRANSFER_IN", "TRANSFER_OUT"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const createInventoryItemSchema = z.object({
  name: z.string().trim().min(1, "Give the item a name").max(120),
  sku: z.string().trim().max(40).default(""),
  category: z.string().trim().max(60).default(""),
  unit: unitSchema,
  /** Alert level, in the item's own unit (e.g. 5 for 5 kg). */
  minLevel: z.number().min(0).max(100_000_000).default(0),
  /** Cost per ONE of the item's unit, in rupees (e.g. 650 = Rs. 650 per kg). */
  costPerUnit: z.number().min(0).max(100_000_000).default(0),
  notes: z.string().trim().max(300).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export const updateInventoryItemSchema = createInventoryItemSchema.partial();
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

/** Stock in / out / waste / count. `unit` may differ from the item's unit (e.g. add 500 g to a kg item). */
export const adjustStockSchema = z.object({
  branchId: z.string().min(1),
  itemId: z.string().min(1),
  /** STOCK_IN adds, STOCK_OUT removes, WASTE removes (counted as waste), COUNT sets the stock to the counted quantity. */
  mode: z.enum(["STOCK_IN", "STOCK_OUT", "WASTE", "COUNT"]),
  quantity: z.number().min(0).max(100_000_000),
  unit: unitSchema.optional(),
  note: z.string().trim().max(300).default(""),
  /** Optional cost per unit of this delivery (rupees), updates the item's cost. */
  unitCost: z.number().min(0).max(100_000_000).optional(),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Give the supplier a name").max(120),
  contactName: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.union([z.literal(""), z.string().trim().email().max(160)]).default(""),
  address: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(500).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});
export type SupplierInput = z.infer<typeof supplierSchema>;
export const updateSupplierSchema = supplierSchema.partial();

const poLine = z.object({ itemId: z.string().min(1), quantity: qty, unit: unitSchema, unitCost: z.number().min(0).max(100_000_000).default(0) });
export const createPurchaseOrderSchema = z.object({
  branchId: z.string().min(1),
  supplierId: z.string().min(1),
  expectedDate: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(500).default(""),
  /** "DRAFT" is saved for later, "ORDERED" is sent to the supplier. */
  status: z.enum(["DRAFT", "ORDERED"]).default("ORDERED"),
  lines: z.array(poLine).min(1, "Add at least one item").max(100),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

/** Receive goods: all lines by default, or the quantities that really arrived. */
export const receivePurchaseOrderSchema = z.object({
  lines: z.array(z.object({ lineId: z.string().min(1), quantity: z.number().min(0).max(100_000_000), unit: unitSchema })).optional(),
  note: z.string().trim().max(300).default(""),
});
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;

export const createTransferSchema = z
  .object({
    fromBranchId: z.string().min(1),
    toBranchId: z.string().min(1),
    note: z.string().trim().max(300).default(""),
    lines: z.array(z.object({ itemId: z.string().min(1), quantity: qty, unit: unitSchema })).min(1, "Add at least one item").max(100),
  })
  .refine((v) => v.fromBranchId !== v.toBranchId, { message: "Choose two different branches", path: ["toBranchId"] });
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

/** Add many items at once (pasted list). `quantity` is the opening stock at `branchId`, in the row's own unit. */
export const bulkItemsSchema = z.object({
  branchId: z.string().min(1),
  rows: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        unit: unitSchema,
        category: z.string().trim().max(60).default(""),
        minLevel: z.number().min(0).max(100_000_000).default(0),
        costPerUnit: z.number().min(0).max(100_000_000).default(0),
        quantity: z.number().min(0).max(100_000_000).default(0),
      }),
    )
    .min(1, "Add at least one row")
    .max(300),
});
export type BulkItemsInput = z.infer<typeof bulkItemsSchema>;

/** Delete several records at once. */
export const bulkIdsSchema = z.object({ ids: z.array(z.string().min(1)).min(1, "Choose at least one").max(100) });
export type BulkIdsInput = z.infer<typeof bulkIdsSchema>;

/** Edit a purchase order that has not been received yet (the branch cannot change). */
export const updatePurchaseOrderSchema = createPurchaseOrderSchema.omit({ branchId: true });
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
