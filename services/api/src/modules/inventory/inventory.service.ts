import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import {
  INVENTORY_UNITS,
  formatQty,
  sameFamily,
  toBaseQty,
  type AdjustStockInput,
  type BulkItemsInput,
  type CreateInventoryItemInput,
  type InventoryUnit,
  type MovementType,
  type UpdateInventoryItemInput,
} from "@restaurant/validation";
import { Prisma } from "@restaurant/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

export type MovementInput = {
  restaurantId: string;
  branchId: string;
  itemId: string;
  type: MovementType;
  /** Signed, base units. */
  delta: number;
  unitCost?: number | null;
  note?: string;
  referenceType?: string;
  referenceId?: string;
  /** The line of the reference this belongs to (order item id, purchase line id). */
  lineRef?: string;
  /** Unique per real-world event. The database refuses a second entry with the same key, so it can never be applied twice. */
  idempotencyKey?: string;
  /** Refuse (instead of going below zero) when the shelf does not have enough. Used for manual take-outs and transfers. */
  requireAvailable?: boolean;
  staffId?: string | null;
};

/** Stock changes on the same item queue up behind each other, so they get a generous wait and time limit (the default 5 seconds is too short when many people work at once). */
export const STOCK_TX = { maxWait: 15_000, timeout: 30_000 } as const;

/** What happened when several records were deleted at once. */
export type BulkDeleteResult = { removed: number; deactivated: number; failed: { id: string; name: string; reason: string }[] };

export class InsufficientStockError extends BadRequestException {
  constructor(public readonly itemId: string) {
    super({ code: "INVENTORY_NOT_ENOUGH", message: "Not enough stock for this." });
  }
}

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The branches this staff member may use: null means every branch. */
export function allowedBranchIds(staff: StaffJwtPayload): string[] | null {
  return staff.isOwner || staff.allBranchesAccess ? null : staff.branchIds;
}

export function assertBranchAccess(staff: StaffJwtPayload, branchId: string) {
  const allowed = allowedBranchIds(staff);
  if (allowed && !allowed.includes(branchId)) throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this branch" });
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  // ------------------------------------------------------------------ the one place stock changes

  /**
   * Adds a signed quantity to one item's stock at one branch and records it in the ledger. Runs inside the caller's
   * transaction so a purchase receipt, a transfer or an order never half-applies. Returns the new balance.
   */
  async applyMovement(tx: Prisma.TransactionClient, m: MovementInput): Promise<number> {
    const delta = round3(m.delta);
    if (delta < 0 && m.requireAvailable) {
      // One atomic statement: take it only if enough is there, so two people can never both take the last of it.
      const taken = await tx.branchStock.updateMany({ where: { itemId: m.itemId, branchId: m.branchId, quantity: { gte: -delta } }, data: { quantity: { decrement: -delta } } });
      if (taken.count === 0) throw new InsufficientStockError(m.itemId);
    } else {
      await tx.branchStock.upsert({
        where: { itemId_branchId: { itemId: m.itemId, branchId: m.branchId } },
        create: { itemId: m.itemId, branchId: m.branchId, quantity: delta },
        update: { quantity: { increment: delta } },
      });
    }
    const balance = num((await tx.branchStock.findUniqueOrThrow({ where: { itemId_branchId: { itemId: m.itemId, branchId: m.branchId } }, select: { quantity: true } })).quantity);
    await tx.stockMovement.create({
      data: {
        restaurantId: m.restaurantId,
        branchId: m.branchId,
        itemId: m.itemId,
        type: m.type,
        quantity: delta,
        balanceAfter: balance,
        unitCost: m.unitCost ?? null,
        note: m.note ?? "",
        referenceType: m.referenceType ?? "",
        referenceId: m.referenceId ?? "",
        lineRef: m.lineRef ?? "",
        idempotencyKey: m.idempotencyKey ?? null,
        staffId: m.staffId ?? null,
      },
    });
    return balance;
  }

  // ------------------------------------------------------------------ items

  private async findItem(id: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item || item.restaurantId !== restaurantId) throw new NotFoundException({ code: "INVENTORY_ITEM_NOT_FOUND", message: "Item not found" });
    return item;
  }

  private itemData(input: CreateInventoryItemInput | UpdateInventoryItemInput, unit: InventoryUnit) {
    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      // Alert level is typed in the item's own unit and stored in base units.
      ...(input.minLevel !== undefined ? { minLevel: round3(toBaseQty(input.minLevel, unit)) } : {}),
      // Cost is typed in rupees per item unit and stored in paisa.
      ...(input.costPerUnit !== undefined ? { costPerUnit: Math.round(input.costPerUnit * 100) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
  }

  async createItem(input: CreateInventoryItemInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const clash = await this.prisma.inventoryItem.findFirst({ where: { restaurantId, name: { equals: input.name, mode: "insensitive" } }, select: { id: true } });
    if (clash) throw new BadRequestException({ code: "INVENTORY_ITEM_EXISTS", message: "An item with this name already exists" });
    return this.prisma.inventoryItem.create({ data: { restaurantId, ...this.itemData(input, input.unit), name: input.name, unit: input.unit } });
  }

  async updateItem(id: string, input: UpdateInventoryItemInput) {
    const current = await this.findItem(id);
    const unit = (input.unit ?? current.unit) as InventoryUnit;
    if (input.unit && input.unit !== current.unit && !sameFamily(input.unit, current.unit as InventoryUnit)) {
      throw new BadRequestException({ code: "INVENTORY_UNIT_FAMILY", message: "The unit can only be changed within the same kind (kg/g, litre/ml, pieces/dozen), because stock is already counted." });
    }
    if (input.name && input.name.toLowerCase() !== current.name.toLowerCase()) {
      const clash = await this.prisma.inventoryItem.findFirst({ where: { restaurantId: current.restaurantId, id: { not: id }, name: { equals: input.name, mode: "insensitive" } }, select: { id: true } });
      if (clash) throw new BadRequestException({ code: "INVENTORY_ITEM_EXISTS", message: "An item with this name already exists" });
    }
    // The alert level and cost arrive in the (possibly new) display unit.
    return this.prisma.inventoryItem.update({ where: { id }, data: this.itemData(input, unit) });
  }

  /** Creates many items at once from a pasted list. Names that already exist are skipped, not changed. */
  async bulkCreate(staff: StaffJwtPayload, input: BulkItemsInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    assertBranchAccess(staff, input.branchId);
    const existing = await this.prisma.inventoryItem.findMany({ where: { restaurantId }, select: { name: true } });
    const taken = new Set(existing.map((e) => e.name.toLowerCase()));
    const created: { id: string; name: string }[] = [];
    const skipped: string[] = [];
    for (const row of input.rows) {
      if (taken.has(row.name.toLowerCase())) {
        skipped.push(row.name);
        continue;
      }
      taken.add(row.name.toLowerCase());
      await this.prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: { restaurantId, name: row.name, unit: row.unit, category: row.category, minLevel: round3(toBaseQty(row.minLevel, row.unit)), costPerUnit: Math.round(row.costPerUnit * 100) },
        });
        if (row.quantity > 0) {
          await this.applyMovement(tx, { restaurantId, branchId: input.branchId, itemId: item.id, type: "OPENING", delta: round3(toBaseQty(row.quantity, row.unit)), note: "Opening stock", staffId: staff.sub });
        }
        created.push({ id: item.id, name: item.name });
      }, STOCK_TX);
    }
    return { created: created.length, skipped };
  }

  /** An item that was ever used is only switched off, so history and recipes keep making sense. */
  async removeItem(id: string) {
    await this.findItem(id);
    const used = (await this.prisma.stockMovement.count({ where: { itemId: id } })) + (await this.prisma.recipeLine.count({ where: { itemId: id } })) + (await this.prisma.purchaseOrderLine.count({ where: { itemId: id } }));
    if (used > 0) {
      await this.prisma.inventoryItem.update({ where: { id }, data: { status: "INACTIVE" } });
      return { removed: false, deactivated: true };
    }
    await this.prisma.inventoryItem.delete({ where: { id } });
    return { removed: true, deactivated: false };
  }

  /** Deletes several items. Ones that were ever used are only switched off (so history and reports stay correct). */
  async removeItems(ids: string[]) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const rows = await this.prisma.inventoryItem.findMany({ where: { restaurantId, id: { in: ids } }, select: { id: true, name: true } });
    const name = new Map(rows.map((r) => [r.id, r.name]));
    const result: BulkDeleteResult = { removed: 0, deactivated: 0, failed: [] };
    for (const id of ids) {
      try {
        const r = await this.removeItem(id);
        if (r.removed) result.removed++;
        else result.deactivated++;
      } catch (e) {
        result.failed.push({ id, name: name.get(id) ?? id, reason: e instanceof Error ? e.message : "Could not delete" });
      }
    }
    return result;
  }

  // ------------------------------------------------------------------ stock list

  /** Items with the stock at one branch (or the total across the branches this person may see). */
  async listStock(staff: StaffJwtPayload, branchId: string | undefined, opts: { search?: string; onlyLow?: boolean; includeInactive?: boolean } = {}) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    if (branchId) assertBranchAccess(staff, branchId);
    const allowed = allowedBranchIds(staff);
    const branchFilter = branchId ? { branchId } : allowed ? { branchId: { in: allowed } } : {};
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        restaurantId,
        ...(opts.includeInactive ? {} : { status: "ACTIVE" as const }),
        ...(opts.search ? { OR: [{ name: { contains: opts.search, mode: "insensitive" as const } }, { sku: { contains: opts.search, mode: "insensitive" as const } }, { category: { contains: opts.search, mode: "insensitive" as const } }] } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { stocks: { where: branchFilter } },
    });
    const rows = items.map((i) => {
      const unit = i.unit as InventoryUnit;
      const quantity = round3(i.stocks.reduce((n, s) => n + num(s.quantity), 0));
      // With one branch the branch's own alert level wins; across branches the item's level applies per branch.
      const branchMin = branchId ? i.stocks.find((s) => s.branchId === branchId)?.minLevel : null;
      const minLevel = branchMin != null ? num(branchMin) : num(i.minLevel) * (branchId ? 1 : Math.max(1, i.stocks.length));
      return {
        id: i.id,
        name: i.name,
        sku: i.sku,
        category: i.category,
        unit,
        family: INVENTORY_UNITS[unit].family,
        status: i.status,
        notes: i.notes,
        minLevel: num(i.minLevel),
        costPerUnit: i.costPerUnit,
        quantity,
        effectiveMinLevel: minLevel,
        out: quantity <= 0,
        low: minLevel > 0 && quantity <= minLevel,
        value: Math.round((quantity / INVENTORY_UNITS[unit].toBase) * i.costPerUnit),
      };
    });
    return opts.onlyLow ? rows.filter((r) => r.low || r.out) : rows;
  }

  async summary(staff: StaffJwtPayload, branchId?: string) {
    const rows = await this.listStock(staff, branchId);
    return {
      itemCount: rows.length,
      lowCount: rows.filter((r) => r.low && !r.out).length,
      outCount: rows.filter((r) => r.out).length,
      stockValue: rows.reduce((n, r) => n + Math.max(0, r.value), 0),
    };
  }

  // ------------------------------------------------------------------ manual stock changes

  async adjust(staff: StaffJwtPayload, input: AdjustStockInput) {
    assertBranchAccess(staff, input.branchId);
    const item = await this.findItem(input.itemId);
    const itemUnit = item.unit as InventoryUnit;
    const unit = input.unit ?? itemUnit;
    if (!sameFamily(unit, itemUnit)) throw new BadRequestException({ code: "INVENTORY_UNIT_MISMATCH", message: `${item.name} is counted in ${INVENTORY_UNITS[itemUnit].label}, so use a matching unit.` });
    const base = round3(toBaseQty(input.quantity, unit));
    if (input.mode !== "COUNT" && base <= 0) throw new BadRequestException({ code: "INVENTORY_QTY", message: "Enter a quantity above zero" });

    let lowAfter: number | null = null;
    await this.prisma.$transaction(async (tx) => {
      const current = num((await tx.branchStock.findUnique({ where: { itemId_branchId: { itemId: item.id, branchId: input.branchId } } }))?.quantity);
      let delta: number;
      let type: MovementType;
      if (input.mode === "STOCK_IN") {
        delta = base;
        type = "STOCK_IN";
      } else if (input.mode === "STOCK_OUT") {
        delta = -base;
        type = "STOCK_OUT";
      } else if (input.mode === "WASTE") {
        delta = -base;
        type = "WASTE";
      } else {
        // A stock count sets the shelf to the counted amount; the difference is what gets recorded.
        delta = round3(base - current);
        type = current === 0 && delta > 0 ? "OPENING" : "ADJUSTMENT";
        if (delta === 0) return;
      }
      const unitCost = input.unitCost != null && input.mode === "STOCK_IN" ? Math.round(input.unitCost * 100) : null;
      const balance = await this.applyMovement(tx, { restaurantId: item.restaurantId, branchId: input.branchId, itemId: item.id, type, delta, unitCost, note: input.note, staffId: staff.sub, requireAvailable: type === "STOCK_OUT" || type === "WASTE" });
      if (delta < 0) lowAfter = balance;
      if (unitCost != null) await tx.inventoryItem.update({ where: { id: item.id }, data: { costPerUnit: Math.round((unitCost / INVENTORY_UNITS[unit].toBase) * INVENTORY_UNITS[itemUnit].toBase) } });
    }, STOCK_TX);
    if (lowAfter !== null) await this.notifyIfJustLow(item.restaurantId, input.branchId, item.id, lowAfter);
    return { ok: true };
  }

  /** Per-branch alert level for one item (empty = use the item's own level). `level` is in the item's unit. */
  async setBranchMinLevel(staff: StaffJwtPayload, branchId: string, itemId: string, level: number | null) {
    assertBranchAccess(staff, branchId);
    const item = await this.findItem(itemId);
    const base = level == null ? null : round3(toBaseQty(level, item.unit as InventoryUnit));
    await this.prisma.branchStock.upsert({
      where: { itemId_branchId: { itemId, branchId } },
      create: { itemId, branchId, quantity: 0, minLevel: base },
      update: { minLevel: base },
    });
    return { ok: true };
  }

  // ------------------------------------------------------------------ history

  async movements(staff: StaffJwtPayload, f: { branchId?: string; itemId?: string; type?: string; from?: string; to?: string; page: number; pageSize: number }) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    if (f.branchId) assertBranchAccess(staff, f.branchId);
    const allowed = allowedBranchIds(staff);
    const where: Prisma.StockMovementWhereInput = {
      restaurantId,
      ...(f.branchId ? { branchId: f.branchId } : allowed ? { branchId: { in: allowed } } : {}),
      ...(f.itemId ? { itemId: f.itemId } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) } } : {}),
    };
    const size = Math.min(Math.max(f.pageSize || 25, 1), 100);
    const page = Math.max(f.page || 1, 1);
    const [total, rows] = await Promise.all([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size, include: { item: { select: { name: true, unit: true } } } }),
    ]);
    const staffIds = [...new Set(rows.map((r) => r.staffId).filter((x): x is string => !!x))];
    const staffRows = staffIds.length ? await this.prisma.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } }) : [];
    const staffName = new Map(staffRows.map((s) => [s.id, s.name]));
    const branches = await this.prisma.branch.findMany({ where: { restaurantId }, select: { id: true, name: true } });
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    return {
      total,
      page,
      pageSize: size,
      pageCount: Math.max(1, Math.ceil(total / size)),
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        branchId: r.branchId,
        branchName: branchName.get(r.branchId) ?? "",
        itemId: r.itemId,
        itemName: r.item.name,
        unit: r.item.unit,
        type: r.type,
        quantity: num(r.quantity),
        balanceAfter: num(r.balanceAfter),
        unitCost: r.unitCost,
        note: r.note,
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        staffName: r.staffId ? (staffName.get(r.staffId) ?? "") : "",
      })),
    };
  }

  // ------------------------------------------------------------------ reconciliation

  /**
   * Checks that every shelf quantity equals the sum of its ledger entries. A difference means something changed stock
   * without leaving a ledger entry, and should be looked into.
   */
  async reconcile(staff: StaffJwtPayload, branchId?: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    if (branchId) assertBranchAccess(staff, branchId);
    const allowed = allowedBranchIds(staff);
    const branchWhere = branchId ? { branchId } : allowed ? { branchId: { in: allowed } } : {};
    const stocks = await this.prisma.branchStock.findMany({ where: { item: { restaurantId }, ...branchWhere }, include: { item: { select: { name: true, unit: true } } } });
    const sums = await this.prisma.stockMovement.groupBy({ by: ["branchId", "itemId"], where: { restaurantId, ...branchWhere }, _sum: { quantity: true } });
    const ledger = new Map(sums.map((s) => [s.branchId + "|" + s.itemId, num(s._sum.quantity)]));
    const branches = await this.prisma.branch.findMany({ where: { restaurantId }, select: { id: true, name: true } });
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    const mismatches: { branchId: string; branchName: string; itemId: string; itemName: string; unit: string; stored: number; ledger: number; difference: number }[] = [];
    for (const s of stocks) {
      const fromLedger = round3(ledger.get(s.branchId + "|" + s.itemId) ?? 0);
      const stored = round3(num(s.quantity));
      if (Math.abs(stored - fromLedger) > 0.0005) {
        mismatches.push({ branchId: s.branchId, branchName: branchName.get(s.branchId) ?? "", itemId: s.itemId, itemName: s.item.name, unit: s.item.unit, stored, ledger: fromLedger, difference: round3(stored - fromLedger) });
      }
    }
    return { checked: stocks.length, ok: mismatches.length === 0, mismatches };
  }

  // ------------------------------------------------------------------ reports

  async report(staff: StaffJwtPayload, f: { branchId?: string; from: string; to: string }) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    if (f.branchId) assertBranchAccess(staff, f.branchId);
    const allowed = allowedBranchIds(staff);
    const branchWhere = f.branchId ? { branchId: f.branchId } : allowed ? { branchId: { in: allowed } } : {};
    const range = { gte: new Date(f.from), lte: new Date(f.to) };
    const grouped = await this.prisma.stockMovement.groupBy({
      by: ["itemId", "type"],
      where: { restaurantId, ...branchWhere, createdAt: range },
      _sum: { quantity: true },
    });
    const items = await this.prisma.inventoryItem.findMany({ where: { restaurantId }, select: { id: true, name: true, unit: true, costPerUnit: true, category: true } });
    const byId = new Map(items.map((i) => [i.id, i]));
    const costOf = (id: string, base: number) => {
      const it = byId.get(id);
      return it ? Math.round((Math.abs(base) / INVENTORY_UNITS[it.unit as InventoryUnit].toBase) * it.costPerUnit) : 0;
    };
    const pick = (type: string) =>
      grouped
        .filter((g) => g.type === type)
        .map((g) => {
          const base = Math.abs(num(g._sum.quantity));
          const it = byId.get(g.itemId);
          return { itemId: g.itemId, name: it?.name ?? "", unit: it?.unit ?? "PIECE", quantity: base, cost: costOf(g.itemId, base) };
        })
        .filter((r) => r.quantity > 0)
        .sort((a, b) => b.cost - a.cost || b.quantity - a.quantity);
    // Stock is a manual book now, so "taken out" is what staff recorded as Stock out (waste is reported on its own).
    const consumption = pick("STOCK_OUT");
    const waste = pick("WASTE");
    const purchases = pick("PURCHASE");
    const stock = await this.listStock(staff, f.branchId);
    return {
      consumption,
      waste,
      purchases,
      totals: {
        consumptionCost: consumption.reduce((n, r) => n + r.cost, 0),
        wasteCost: waste.reduce((n, r) => n + r.cost, 0),
        purchaseCost: purchases.reduce((n, r) => n + r.cost, 0),
        stockValue: stock.reduce((n, r) => n + Math.max(0, r.value), 0),
      },
      valuation: stock.filter((r) => r.quantity > 0).sort((a, b) => b.value - a.value).slice(0, 50).map((r) => ({ itemId: r.id, name: r.name, unit: r.unit, quantity: r.quantity, value: r.value })),
    };
  }

  // ------------------------------------------------------------------ low-stock notice

  /** Tells the people who manage stock when an item has just fallen to its alert level (or to zero). Not repeated on every take-out. */
  private async notifyIfJustLow(restaurantId: string, branchId: string, itemId: string, balance: number): Promise<void> {
    try {
      const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId }, include: { stocks: { where: { branchId }, select: { minLevel: true } } } });
      if (!item) return;
      const min = item.stocks[0]?.minLevel != null ? num(item.stocks[0].minLevel) : num(item.minLevel);
      const last = await this.prisma.stockMovement.findFirst({ where: { itemId, branchId }, orderBy: { createdAt: "desc" }, select: { quantity: true } });
      const before = balance - num(last?.quantity);
      // Only when it just crossed the line.
      if (!(before > min && balance <= min && (min > 0 || balance <= 0))) return;
      const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } });
      const perm = await this.prisma.permission.findUnique({ where: { key: "inventoryStock.view" } });
      const recipients = await this.prisma.staffUser.findMany({
        where: {
          restaurantId,
          deletedAt: null,
          status: "ACTIVE",
          role: { name: { not: "Rider" } },
          AND: [
            { OR: [{ role: { name: "Owner" } }, { branchAssignments: { some: { branchId } } }] },
            { OR: [{ role: { name: "Owner" } }, ...(perm ? [{ permissionOverrides: { some: { permissionId: perm.id, granted: true } } }] : [])] },
          ],
        },
        select: { id: true },
      });
      if (recipients.length === 0) return;
      const what = balance <= 0 ? `${item.name} is finished` : `${item.name}: only ${formatQty(balance, item.unit as InventoryUnit)} left`;
      await this.prisma.notification.createMany({
        data: recipients.map((r) => ({ restaurantId, recipientType: "STAFF" as const, recipientStaffId: r.id, type: "LOW_STOCK", title: "Low stock", message: `${what} (${branch?.name ?? "branch"})` })),
      });
    } catch {
      // A missed notice must never fail the stock change.
    }
  }
}
