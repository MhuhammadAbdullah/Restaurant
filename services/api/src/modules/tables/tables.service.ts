import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateTableInput, UpdateTableInput } from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";

function assertBranchAccess(staff: StaffJwtPayload, branchId: string) {
  if (staff.isOwner) return;
  if (!staff.branchIds.includes(branchId)) {
    throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this branch" });
  }
}

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(staff: StaffJwtPayload, branchId?: string) {
    if (branchId) assertBranchAccess(staff, branchId);
    return this.prisma.restaurantTable.findMany({
      where: { branchId: branchId ?? (staff.isOwner ? undefined : { in: staff.branchIds }) },
      orderBy: { number: "asc" },
    });
  }

  /** Floor view: every table at the branch, with the running bill of its open dine-in order (if any). */
  async overview(staff: StaffJwtPayload, branchId?: string) {
    const tables = await this.list(staff, branchId);
    const orders = await this.prisma.order.findMany({
      where: {
        type: "DINE_IN",
        tableId: { in: tables.map((t) => t.id) },
        status: { notIn: ["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"] },
      },
      select: {
        id: true,
        orderNumber: true,
        tableId: true,
        status: true,
        grandTotal: true,
        createdAt: true,
        payments: { select: { status: true, amount: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const byTable = new Map<string, (typeof orders)[number]>();
    for (const o of orders) if (o.tableId && !byTable.has(o.tableId)) byTable.set(o.tableId, o);

    return tables.map((t) => {
      const o = byTable.get(t.id);
      const paidTotal = o ? o.payments.filter((p) => p.status === "PAID").reduce((sum, p) => sum + p.amount, 0) : 0;
      return {
        ...t,
        openOrder: o
          ? {
              id: o.id,
              orderNumber: o.orderNumber,
              status: o.status,
              grandTotal: o.grandTotal,
              paidTotal,
              balanceDue: Math.max(0, o.grandTotal - paidTotal),
              itemCount: o._count.items,
              createdAt: o.createdAt,
            }
          : null,
      };
    });
  }

  async create(staff: StaffJwtPayload, input: CreateTableInput) {
    assertBranchAccess(staff, input.branchId);
    return this.prisma.restaurantTable.create({ data: input });
  }

  private async getOwned(staff: StaffJwtPayload, id: string) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!table) throw new NotFoundException({ code: "TABLE_NOT_FOUND", message: "Table not found" });
    assertBranchAccess(staff, table.branchId);
    return table;
  }

  async update(staff: StaffJwtPayload, id: string, input: UpdateTableInput) {
    await this.getOwned(staff, id);
    return this.prisma.restaurantTable.update({ where: { id }, data: input });
  }

  async remove(staff: StaffJwtPayload, id: string) {
    await this.getOwned(staff, id);
    await this.prisma.restaurantTable.delete({ where: { id } });
    return { deleted: true };
  }
}
