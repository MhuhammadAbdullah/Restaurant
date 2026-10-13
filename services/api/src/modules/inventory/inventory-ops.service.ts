import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import {
  INVENTORY_UNITS,
  sameFamily,
  toBaseQty,
  type CreatePurchaseOrderInput,
  type CreateTransferInput,
  type InventoryUnit,
  type ReceivePurchaseOrderInput,
  type UpdatePurchaseOrderInput,
  type SupplierInput,
} from "@restaurant/validation";
import { Prisma } from "@restaurant/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";
import { assertBranchAccess, allowedBranchIds, InsufficientStockError, InventoryService, STOCK_TX, type BulkDeleteResult } from "./inventory.service";

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

/** The plain-language reason from an exception (our errors carry one). */
function errorText(e: unknown): string {
  const r = (e as { response?: { message?: unknown } })?.response?.message;
  return typeof r === "string" ? r : e instanceof Error ? e.message : "Could not delete";
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;

@Injectable()
export class InventoryOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
    private readonly inventory: InventoryService,
  ) {}

  // ------------------------------------------------------------------ suppliers

  async listSuppliers(includeInactive = false) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.supplier.findMany({ where: { restaurantId, ...(includeInactive ? {} : { status: "ACTIVE" as const }) }, orderBy: { name: "asc" } });
  }

  async createSupplier(input: SupplierInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.supplier.create({ data: { restaurantId, ...input } });
  }

  private async findSupplier(id: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s || s.restaurantId !== restaurantId) throw new NotFoundException({ code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" });
    return s;
  }

  async updateSupplier(id: string, input: Partial<SupplierInput>) {
    await this.findSupplier(id);
    return this.prisma.supplier.update({ where: { id }, data: input });
  }

  async removeSupplier(id: string) {
    await this.findSupplier(id);
    const used = await this.prisma.purchaseOrder.count({ where: { supplierId: id } });
    if (used > 0) {
      await this.prisma.supplier.update({ where: { id }, data: { status: "INACTIVE" } });
      return { removed: false, deactivated: true };
    }
    await this.prisma.supplier.delete({ where: { id } });
    return { removed: true, deactivated: false };
  }

  async removeSuppliers(ids: string[]): Promise<BulkDeleteResult> {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const rows = await this.prisma.supplier.findMany({ where: { restaurantId, id: { in: ids } }, select: { id: true, name: true } });
    const name = new Map(rows.map((r) => [r.id, r.name]));
    const result: BulkDeleteResult = { removed: 0, deactivated: 0, failed: [] };
    for (const id of ids) {
      try {
        const r = await this.removeSupplier(id);
        if (r.removed) result.removed++;
        else result.deactivated++;
      } catch (e) {
        result.failed.push({ id, name: name.get(id) ?? id, reason: e instanceof Error ? e.message : "Could not delete" });
      }
    }
    return result;
  }

  // ------------------------------------------------------------------ purchase orders

  /** The next free number: one above the highest in use, so deleting an order never makes a new one reuse a number. */
  private async nextNumber(kind: "PO" | "TR", restaurantId: string, skip = 0): Promise<string> {
    const rows = kind === "PO" ? await this.prisma.purchaseOrder.findMany({ where: { restaurantId }, select: { number: true } }) : await this.prisma.stockTransfer.findMany({ where: { restaurantId }, select: { number: true } });
    const highest = rows.reduce((n, r) => Math.max(n, Number(r.number.split("-")[1]) || 0), 0);
    return `${kind}-${String(highest + 1 + skip).padStart(4, "0")}`;
  }

  /** Runs `run` with a fresh number; if two people took the same number at the same moment, it tries the next one. */
  private async withNumber<T>(kind: "PO" | "TR", restaurantId: string, run: (number: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run(await this.nextNumber(kind, restaurantId, attempt));
      } catch (e) {
        const clash = (e as { code?: string }).code === "P2002" && String((e as { meta?: { target?: unknown } }).meta?.target ?? "").includes("number");
        if (!clash || attempt >= 5) throw e;
      }
    }
  }

  private async lineData(restaurantId: string, lines: { itemId: string; quantity: number; unit: InventoryUnit; unitCost?: number }[]) {
    const items = await this.prisma.inventoryItem.findMany({ where: { restaurantId, id: { in: lines.map((l) => l.itemId) } } });
    const byId = new Map(items.map((i) => [i.id, i]));
    return lines.map((l) => {
      const item = byId.get(l.itemId);
      if (!item) throw new BadRequestException({ code: "INVENTORY_ITEM_NOT_FOUND", message: "One of the items does not exist" });
      const itemUnit = item.unit as InventoryUnit;
      if (!sameFamily(l.unit, itemUnit)) throw new BadRequestException({ code: "INVENTORY_UNIT_MISMATCH", message: `${item.name} is counted in ${INVENTORY_UNITS[itemUnit].label}, so use a matching unit.` });
      return {
        itemId: l.itemId,
        item,
        base: round3(toBaseQty(l.quantity, l.unit)),
        // The line's cost is typed per the unit used on the line; stored per ONE of the item's own unit, in paisa.
        unitCostPaisa: Math.round(((l.unitCost ?? 0) * 100 * INVENTORY_UNITS[itemUnit].toBase) / INVENTORY_UNITS[l.unit].toBase),
      };
    });
  }

  private poView(po: Prisma.PurchaseOrderGetPayload<{ include: { supplier: true; lines: { include: { item: true } } } }>, branchName: string) {
    return {
      id: po.id,
      number: po.number,
      status: po.status,
      branchId: po.branchId,
      branchName,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      expectedDate: po.expectedDate,
      notes: po.notes,
      receivedAt: po.receivedAt,
      createdAt: po.createdAt,
      total: po.lines.reduce((n, l) => n + Math.round((num(l.quantity) / INVENTORY_UNITS[l.item.unit as InventoryUnit].toBase) * l.unitCost), 0),
      lines: po.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        itemName: l.item.name,
        unit: l.item.unit,
        quantity: num(l.quantity),
        receivedQty: num(l.receivedQty),
        unitCost: l.unitCost,
        lineTotal: Math.round((num(l.quantity) / INVENTORY_UNITS[l.item.unit as InventoryUnit].toBase) * l.unitCost),
      })),
    };
  }

  private async branchNames(restaurantId: string) {
    const rows = await this.prisma.branch.findMany({ where: { restaurantId }, select: { id: true, name: true } });
    return new Map(rows.map((b) => [b.id, b.name]));
  }

  async listPurchaseOrders(staff: StaffJwtPayload, f: { branchId?: string; status?: string }) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    if (f.branchId) assertBranchAccess(staff, f.branchId);
    const allowed = allowedBranchIds(staff);
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { restaurantId, ...(f.branchId ? { branchId: f.branchId } : allowed ? { branchId: { in: allowed } } : {}), ...(f.status ? { status: f.status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { supplier: true, lines: { include: { item: true } } },
    });
    const names = await this.branchNames(restaurantId);
    return rows.map((r) => this.poView(r, names.get(r.branchId) ?? ""));
  }

  async createPurchaseOrder(staff: StaffJwtPayload, input: CreatePurchaseOrderInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    assertBranchAccess(staff, input.branchId);
    await this.findSupplier(input.supplierId);
    const lines = await this.lineData(restaurantId, input.lines);
    const po = await this.withNumber("PO", restaurantId, (number) => this.prisma.purchaseOrder.create({
      data: {
        restaurantId,
        branchId: input.branchId,
        supplierId: input.supplierId,
        number,
        status: input.status,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        notes: input.notes,
        createdByStaffId: staff.sub,
        lines: { create: lines.map((l) => ({ itemId: l.itemId, quantity: l.base, unitCost: l.unitCostPaisa })) },
      },
      include: { supplier: true, lines: { include: { item: true } } },
    }));
    return this.poView(po, (await this.branchNames(restaurantId)).get(po.branchId) ?? "");
  }

  private async findPo(staff: StaffJwtPayload, id: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, lines: { include: { item: true } } } });
    if (!po || po.restaurantId !== restaurantId) throw new NotFoundException({ code: "PURCHASE_ORDER_NOT_FOUND", message: "Purchase order not found" });
    assertBranchAccess(staff, po.branchId);
    return po;
  }

  /** Changes a purchase order that has not been received: supplier, date, note and the items. The branch cannot change. */
  async updatePurchaseOrder(staff: StaffJwtPayload, id: string, input: UpdatePurchaseOrderInput) {
    const po = await this.findPo(staff, id);
    if (po.status === "RECEIVED" || po.status === "CANCELLED") {
      throw new BadRequestException({ code: "PO_LOCKED", message: po.status === "RECEIVED" ? "A received order cannot be edited: its goods are already in stock." : "A cancelled order cannot be edited." });
    }
    await this.findSupplier(input.supplierId);
    const lines = await this.lineData(po.restaurantId, input.lines);
    await this.prisma.$transaction(async (tx) => {
      // Only an order still open can be changed; this also stops an edit racing a receive.
      const claimed = await tx.purchaseOrder.updateMany({
        where: { id, status: { in: ["DRAFT", "ORDERED"] } },
        data: { supplierId: input.supplierId, notes: input.notes, expectedDate: input.expectedDate ? new Date(input.expectedDate) : null, status: input.status },
      });
      if (claimed.count !== 1) throw new BadRequestException({ code: "PO_LOCKED", message: "This order was just received or cancelled, so it can no longer be edited." });
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderLine.createMany({ data: lines.map((l) => ({ purchaseOrderId: id, itemId: l.itemId, quantity: l.base, unitCost: l.unitCostPaisa })) });
    }, STOCK_TX);
    return this.poView(await this.findPo(staff, id), (await this.branchNames(po.restaurantId)).get(po.branchId) ?? "");
  }

  /** Deletes a purchase order that never reached the shelf (draft, ordered or cancelled). A received one cannot be deleted: its goods are in stock. */
  async deletePurchaseOrder(staff: StaffJwtPayload, id: string) {
    await this.findPo(staff, id);
    const gone = await this.prisma.purchaseOrder.deleteMany({ where: { id, status: { in: ["DRAFT", "ORDERED", "CANCELLED"] } } });
    if (gone.count !== 1) {
      throw new BadRequestException({ code: "PO_RECEIVED", message: "A received order cannot be deleted because its goods are already in stock. If goods were sent back, record a Stock out." });
    }
    return { id };
  }

  async deletePurchaseOrders(staff: StaffJwtPayload, ids: string[]): Promise<BulkDeleteResult> {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const rows = await this.prisma.purchaseOrder.findMany({ where: { restaurantId, id: { in: ids } }, select: { id: true, number: true } });
    const name = new Map(rows.map((r) => [r.id, r.number]));
    const result: BulkDeleteResult = { removed: 0, deactivated: 0, failed: [] };
    for (const id of ids) {
      try {
        await this.deletePurchaseOrder(staff, id);
        result.removed++;
      } catch (e) {
        result.failed.push({ id, name: name.get(id) ?? id, reason: errorText(e) });
      }
    }
    return result;
  }

  /** DRAFT -> ORDERED, or cancel one that has not been received. */
  async setPurchaseOrderStatus(staff: StaffJwtPayload, id: string, status: "ORDERED" | "CANCELLED") {
    const po = await this.findPo(staff, id);
    if (po.status === "RECEIVED") throw new BadRequestException({ code: "PO_RECEIVED", message: "This order has already been received." });
    if (po.status === "CANCELLED") throw new BadRequestException({ code: "PO_CANCELLED", message: "This order was cancelled." });
    const updated = await this.prisma.purchaseOrder.update({ where: { id }, data: { status }, include: { supplier: true, lines: { include: { item: true } } } });
    return this.poView(updated, (await this.branchNames(po.restaurantId)).get(po.branchId) ?? "");
  }

  /** Goods arrived: the received quantities go into stock (and the item's cost is updated). */
  async receivePurchaseOrder(staff: StaffJwtPayload, id: string, input: ReceivePurchaseOrderInput) {
    const po = await this.findPo(staff, id);
    if (po.status === "RECEIVED") throw new BadRequestException({ code: "PO_RECEIVED", message: "This order has already been received." });
    if (po.status === "CANCELLED") throw new BadRequestException({ code: "PO_CANCELLED", message: "This order was cancelled." });
    const given = new Map((input.lines ?? []).map((l) => [l.lineId, l]));
    await this.prisma.$transaction(async (tx) => {
      // The status flip is the lock: only one request can move the order to RECEIVED, so goods are never counted twice.
      const claimed = await tx.purchaseOrder.updateMany({ where: { id: po.id, status: { in: ["ORDERED", "DRAFT"] } }, data: { status: "RECEIVED", receivedAt: new Date() } });
      if (claimed.count !== 1) throw new BadRequestException({ code: "PO_RECEIVED", message: "This order has already been received or cancelled." });
      for (const line of po.lines) {
        const itemUnit = line.item.unit as InventoryUnit;
        const g = given.get(line.id);
        let base = num(line.quantity);
        if (g) {
          if (!sameFamily(g.unit, itemUnit)) throw new BadRequestException({ code: "INVENTORY_UNIT_MISMATCH", message: `${line.item.name} is counted in ${INVENTORY_UNITS[itemUnit].label}, so use a matching unit.` });
          base = round3(toBaseQty(g.quantity, g.unit));
        }
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: base } });
        if (base <= 0) continue;
        await this.inventory.applyMovement(tx, {
          restaurantId: po.restaurantId,
          branchId: po.branchId,
          itemId: line.itemId,
          type: "PURCHASE",
          delta: base,
          unitCost: line.unitCost,
          note: input.note || `Received ${po.number} from ${po.supplier.name}`,
          referenceType: "PURCHASE_ORDER",
          referenceId: po.id,
          lineRef: line.id,
          idempotencyKey: "PO:" + po.id + ":" + line.id,
          staffId: staff.sub,
        });
        if (line.unitCost > 0) await tx.inventoryItem.update({ where: { id: line.itemId }, data: { costPerUnit: line.unitCost } });
      }
    }, STOCK_TX);
    return this.poView(await this.findPo(staff, id), (await this.branchNames(po.restaurantId)).get(po.branchId) ?? "");
  }

  // ------------------------------------------------------------------ branch transfers

  async createTransfer(staff: StaffJwtPayload, input: CreateTransferInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    // The sender must be a branch this person can use; they may send to any branch.
    assertBranchAccess(staff, input.fromBranchId);
    const branches = await this.prisma.branch.findMany({ where: { restaurantId, id: { in: [input.fromBranchId, input.toBranchId] } }, select: { id: true } });
    if (branches.length !== 2) throw new BadRequestException({ code: "BRANCH_NOT_FOUND", message: "Branch not found" });
    const lines = await this.lineData(restaurantId, input.lines);
    const { id, number } = await this.withNumber("TR", restaurantId, async (number) => ({ number, id: await this.prisma.$transaction(async (tx) => {
      // Enough must be on the shelf before anything moves.
      for (const l of lines) {
        const have = num((await tx.branchStock.findUnique({ where: { itemId_branchId: { itemId: l.itemId, branchId: input.fromBranchId } } }))?.quantity);
        if (have < l.base) throw new BadRequestException({ code: "INVENTORY_NOT_ENOUGH", message: `Not enough ${l.item.name} at the sending branch.` });
      }
      const transfer = await tx.stockTransfer.create({
        data: { restaurantId, fromBranchId: input.fromBranchId, toBranchId: input.toBranchId, number, note: input.note, createdByStaffId: staff.sub, lines: { create: lines.map((l) => ({ itemId: l.itemId, quantity: l.base })) } },
      });
      for (const l of lines) {
        const common = { restaurantId, itemId: l.itemId, referenceType: "TRANSFER", referenceId: transfer.id, lineRef: l.itemId, staffId: staff.sub, note: input.note || number };
        await this.inventory.applyMovement(tx, { ...common, branchId: input.fromBranchId, type: "TRANSFER_OUT", delta: -l.base, requireAvailable: true, idempotencyKey: "TR:" + transfer.id + ":" + l.itemId + ":OUT" });
        await this.inventory.applyMovement(tx, { ...common, branchId: input.toBranchId, type: "TRANSFER_IN", delta: l.base, idempotencyKey: "TR:" + transfer.id + ":" + l.itemId + ":IN" });
      }
      return transfer.id;
    }, STOCK_TX) }));
    return { ok: true, id, number };
  }

  /**
   * Deleting a transfer sends its stock back: it leaves the receiving branch and returns to the sender (two new ledger
   * entries, the originals stay), then the transfer record is removed. If the receiving branch no longer has the stock, it
   * is refused and nothing changes.
   */
  async reverseTransfer(staff: StaffJwtPayload, id: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const t = await this.prisma.stockTransfer.findUnique({ where: { id }, include: { lines: { include: { item: true } } } });
    if (!t || t.restaurantId !== restaurantId) throw new NotFoundException({ code: "TRANSFER_NOT_FOUND", message: "Transfer not found" });
    assertBranchAccess(staff, t.fromBranchId);
    assertBranchAccess(staff, t.toBranchId);
    try {
      await this.prisma.$transaction(async (tx) => {
        // Removing the record is the lock: only one request can reverse a transfer, so stock is never sent back twice.
        const claimed = await tx.stockTransfer.deleteMany({ where: { id } });
        if (claimed.count !== 1) throw new NotFoundException({ code: "TRANSFER_NOT_FOUND", message: "This transfer was already deleted." });
        for (const l of t.lines) {
          const common = { restaurantId, itemId: l.itemId, referenceType: "TRANSFER", referenceId: t.id, lineRef: l.itemId, staffId: staff.sub, note: "Transfer " + t.number + " deleted: stock sent back" };
          await this.inventory.applyMovement(tx, { ...common, branchId: t.toBranchId, type: "TRANSFER_OUT", delta: -num(l.quantity), requireAvailable: true, idempotencyKey: "TR:" + t.id + ":" + l.itemId + ":REV-OUT" });
          await this.inventory.applyMovement(tx, { ...common, branchId: t.fromBranchId, type: "TRANSFER_IN", delta: num(l.quantity), idempotencyKey: "TR:" + t.id + ":" + l.itemId + ":REV-IN" });
        }
      }, STOCK_TX);
    } catch (e) {
      if (e instanceof InsufficientStockError) {
        throw new BadRequestException({ code: "TRANSFER_CANNOT_BE_REVERSED", message: "The receiving branch no longer has all of this stock, so the transfer cannot be deleted. Move the stock back first." });
      }
      throw e;
    }
    return { id, number: t.number };
  }

  async reverseTransfers(staff: StaffJwtPayload, ids: string[]): Promise<BulkDeleteResult> {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const rows = await this.prisma.stockTransfer.findMany({ where: { restaurantId, id: { in: ids } }, select: { id: true, number: true } });
    const name = new Map(rows.map((r) => [r.id, r.number]));
    const result: BulkDeleteResult = { removed: 0, deactivated: 0, failed: [] };
    for (const id of ids) {
      try {
        await this.reverseTransfer(staff, id);
        result.removed++;
      } catch (e) {
        result.failed.push({ id, name: name.get(id) ?? id, reason: errorText(e) });
      }
    }
    return result;
  }

  async listTransfers(staff: StaffJwtPayload, branchId?: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    if (branchId) assertBranchAccess(staff, branchId);
    const allowed = allowedBranchIds(staff);
    const rows = await this.prisma.stockTransfer.findMany({
      where: {
        restaurantId,
        ...(branchId ? { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] } : allowed ? { OR: [{ fromBranchId: { in: allowed } }, { toBranchId: { in: allowed } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { lines: { include: { item: true } } },
    });
    const names = await this.branchNames(restaurantId);
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      createdAt: r.createdAt,
      note: r.note,
      fromBranchId: r.fromBranchId,
      fromBranchName: names.get(r.fromBranchId) ?? "",
      toBranchId: r.toBranchId,
      toBranchName: names.get(r.toBranchId) ?? "",
      lines: r.lines.map((l) => ({ itemId: l.itemId, itemName: l.item.name, unit: l.item.unit, quantity: num(l.quantity) })),
    }));
  }
}
