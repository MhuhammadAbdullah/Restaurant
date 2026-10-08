import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@restaurant/database";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

const DELIVERED_STATUSES = ["DELIVERED", "COMPLETED"] as const;
const CANCELLED_STATUSES = ["CANCELLED", "REFUNDED"] as const;

function assertBranchAccess(staff: StaffJwtPayload, branchId: string) {
  if (staff.isOwner) return;
  if (!staff.branchIds.includes(branchId)) {
    throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this branch" });
  }
}

function startOfDay(dateStr?: string): Date {
  const d = dateStr ? new Date(dateStr) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isDelivered(status: string): boolean {
  return (DELIVERED_STATUSES as readonly string[]).includes(status);
}
function isCancelled(status: string): boolean {
  return (CANCELLED_STATUSES as readonly string[]).includes(status);
}

/** Matches the spec's own 3-state table exactly: non-COD orders are "PAID" (rider owes nothing), a COD order is "PENDING" until delivered, then "COLLECTED". Cancelled/refunded orders never count (CLAUDE.md — only count money actually received). */
function collectionStatus(order: { paymentMethod: string; status: string }): "PAID" | "COLLECTED" | "PENDING" | "N/A" {
  if (order.paymentMethod !== "COD") return "PAID";
  if (isCancelled(order.status)) return "N/A";
  return isDelivered(order.status) ? "COLLECTED" : "PENDING";
}

/** Delivered cash-on-delivery orders whose cash an admin has not yet received — the rider is still holding that money. */
const UNSETTLED_COD_WHERE: Prisma.OrderWhereInput = {
  paymentMethod: "COD",
  status: { in: ["DELIVERED", "COMPLETED"] },
  paymentStatus: { notIn: ["PAID", "REFUNDED"] },
};

const DELIVERY_SELECT = {
  id: true,
  orderNumber: true,
  type: true,
  status: true,
  grandTotal: true,
  paymentMethod: true,
  paymentStatus: true,
  contactName: true,
  contactPhone: true,
  customer: { select: { name: true, phone: true } },
  deliveryAddressSnapshot: true,
  deliveryArea: true,
  deliveryCity: true,
  deliveryLandmark: true,
  specialInstructions: true,
  branch: { select: { id: true, name: true } },
  riderAssignedAt: true,
  estimatedDeliveryAt: true,
  updatedAt: true,
  createdAt: true,
  collectionSubmissionId: true,
} as const;

function toDeliveryDto(o: Record<string, unknown> & { paymentMethod: string; paymentStatus?: string; status: string; collectionSubmissionId: string | null }) {
  return {
    ...o,
    // For COD this only becomes true once an admin has received the rider's cash (see OrdersService.settleCodCash).
    isSettled: o.paymentStatus === "PAID",
    collectionStatus: collectionStatus(o as { paymentMethod: string; status: string }),
    isSubmitted: o.collectionSubmissionId !== null,
  };
}

/**
 * Riders are Staff with the "Rider" role, not a separate entity (see /docs/DECISIONS.md) — this
 * service is a set of rider-shaped views over StaffUser + Order.assignedRiderId, plus derived
 * daily counts computed live from Order rows (ledger-derived, same philosophy as other reports —
 * never a separately-maintained running total that could drift). Collection amounts follow the
 * same rule except for the one genuinely append-only ledger table, RiderCollectionSubmission.
 */
@Injectable()
export class RidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  private async riderRoleId(restaurantId: string): Promise<string | null> {
    const role = await this.prisma.role.findFirst({ where: { restaurantId, name: "Rider" }, select: { id: true } });
    return role?.id ?? null;
  }

  private async assertRiderAccess(staff: StaffJwtPayload, riderId: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const roleId = await this.riderRoleId(restaurantId);
    const rider = await this.prisma.staffUser.findUnique({
      where: { id: riderId },
      select: { id: true, name: true, phone: true, status: true, restaurantId: true, roleId: true, branchAssignments: { select: { branch: { select: { id: true, name: true } } } } },
    });
    if (!rider || rider.restaurantId !== restaurantId || rider.roleId !== roleId) {
      throw new NotFoundException({ code: "RIDER_NOT_FOUND", message: "Rider not found" });
    }
    if (!staff.isOwner && !rider.branchAssignments.some((a) => staff.branchIds.includes(a.branch.id))) {
      throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this rider" });
    }
    return rider;
  }

  /** Riders visible to this staff member — branch-scoped like every other list here (Owner/Admin see all, others only their assigned branch(es)). */
  async list(staff: StaffJwtPayload, filters: { branchId?: string; search?: string; status?: "ACTIVE" | "INACTIVE" } = {}) {
    if (filters.branchId) assertBranchAccess(staff, filters.branchId);
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const roleId = await this.riderRoleId(restaurantId);
    if (!roleId) return [];

    const search = filters.search?.trim();
    const riders = await this.prisma.staffUser.findMany({
      where: {
        restaurantId,
        roleId,
        status: filters.status,
        branchAssignments: {
          some: filters.branchId ? { branchId: filters.branchId } : staff.isOwner ? {} : { branchId: { in: staff.branchIds } },
        },
        ...(search
          ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }] }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        branchAssignments: { select: { branch: { select: { id: true, name: true } } } },
      },
      orderBy: { name: "asc" },
    });

    const riderIds = riders.map((r) => r.id);
    const [assignedCounts, completedCounts] = await Promise.all([
      this.prisma.order.groupBy({ by: ["assignedRiderId"], where: { assignedRiderId: { in: riderIds } }, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ["assignedRiderId"], where: { assignedRiderId: { in: riderIds }, status: { in: [...DELIVERED_STATUSES] } }, _count: { _all: true } }),
    ]);
    const unsettled = await this.prisma.order.groupBy({
      by: ["assignedRiderId"],
      where: { assignedRiderId: { in: riderIds }, ...UNSETTLED_COD_WHERE },
      _sum: { grandTotal: true },
    });
    const unsettledById = new Map(unsettled.map((u) => [u.assignedRiderId, u._sum.grandTotal ?? 0]));
    const assignedById = new Map(assignedCounts.map((c) => [c.assignedRiderId, c._count._all]));
    const completedById = new Map(completedCounts.map((c) => [c.assignedRiderId, c._count._all]));

    return riders.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      status: r.status,
      branches: r.branchAssignments.map((a) => a.branch),
      assignedOrders: assignedById.get(r.id) ?? 0,
      completedOrders: completedById.get(r.id) ?? 0,
      unsettledAmount: unsettledById.get(r.id) ?? 0,
    }));
  }

  async get(staff: StaffJwtPayload, riderId: string) {
    const rider = await this.assertRiderAccess(staff, riderId);
    return {
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      status: rider.status,
      branches: rider.branchAssignments.map((a) => a.branch),
    };
  }

  /** Per-day assigned/delivered/cancelled counts for one rider (defaults to today). */
  async stats(staff: StaffJwtPayload, riderId: string, dateStr?: string) {
    await this.assertRiderAccess(staff, riderId);

    const dayStart = startOfDay(dateStr);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: { assignedRiderId: riderId, riderAssignedAt: { gte: dayStart, lt: dayEnd } },
      select: { status: true },
    });

    return {
      date: dayStart.toISOString().slice(0, 10),
      assigned: orders.length,
      delivered: orders.filter((o) => isDelivered(o.status)).length,
      cancelled: orders.filter((o) => o.status === "CANCELLED").length,
      pending: orders.filter((o) => !isDelivered(o.status) && !isCancelled(o.status)).length,
    };
  }

  /** Admin (or the rider themself) viewing one rider's deliveries — Pending/Delivered lists, optionally date-scoped. */
  async deliveries(
    staff: StaffJwtPayload,
    riderId: string,
    filters: { status?: "pending" | "delivered"; date?: string; from?: string; to?: string },
  ) {
    await this.assertRiderAccess(staff, riderId);

    const dateRange = this.resolveDateRange(filters);
    const orders = await this.prisma.order.findMany({
      where: {
        assignedRiderId: riderId,
        riderAssignedAt: dateRange,
        ...(filters.status === "delivered"
          ? { status: { in: [...DELIVERED_STATUSES] } }
          : filters.status === "pending"
            ? { status: { notIn: [...DELIVERED_STATUSES, ...CANCELLED_STATUSES] } }
            : {}),
      },
      select: DELIVERY_SELECT,
      orderBy: { riderAssignedAt: "desc" },
      take: 500,
    });

    return orders.map(toDeliveryDto);
  }

  private resolveDateRange(filters: { date?: string; from?: string; to?: string }): { gte?: Date; lt?: Date } | undefined {
    if (filters.date) {
      const start = startOfDay(filters.date);
      return { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
    }
    if (filters.from || filters.to) {
      return {
        gte: filters.from ? startOfDay(filters.from) : undefined,
        lt: filters.to ? new Date(startOfDay(filters.to).getTime() + 24 * 60 * 60 * 1000) : undefined,
      };
    }
    return undefined;
  }

  /** Today's (or a given date's) COD collection snapshot — the numbers behind the rider's Collection section / the Submit Collection confirmation screen. */
  async collectionSummary(staff: StaffJwtPayload, riderId: string, dateStr?: string) {
    await this.assertRiderAccess(staff, riderId);
    const dateRange = this.resolveDateRange({ date: dateStr ?? new Date().toISOString() });

    const orders = await this.prisma.order.findMany({
      where: { assignedRiderId: riderId, riderAssignedAt: dateRange },
      select: { status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, collectionSubmissionId: true },
    });

    const cod = orders.filter((o) => o.paymentMethod === "COD" && !isCancelled(o.status));
    const codDelivered = cod.filter((o) => isDelivered(o.status));
    const codPending = cod.filter((o) => !isDelivered(o.status));
    const codDeliveredUnsubmitted = codDelivered.filter((o) => !o.collectionSubmissionId && o.paymentStatus !== "PAID");
    const paidOrders = orders.filter((o) => o.paymentMethod !== "COD" && !isCancelled(o.status));

    return {
      date: (dateRange?.gte ?? startOfDay(dateStr)).toISOString().slice(0, 10),
      codOrderCount: cod.length,
      expectedAmount: cod.reduce((s, o) => s + o.grandTotal, 0),
      collectedAmount: codDeliveredUnsubmitted.reduce((s, o) => s + o.grandTotal, 0),
      pendingAmount: codPending.reduce((s, o) => s + o.grandTotal, 0),
      alreadySubmittedAmount: codDelivered.filter((o) => o.collectionSubmissionId).reduce((s, o) => s + o.grandTotal, 0),
      settledAmount: codDelivered.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.grandTotal, 0),
      unsettledAmount: codDelivered.filter((o) => o.paymentStatus !== "PAID").reduce((s, o) => s + o.grandTotal, 0),
      paidOrderCount: paidOrders.length,
      paidAmount: paidOrders.reduce((s, o) => s + o.grandTotal, 0),
    };
  }

  /**
   * A rider closes out their shift: every delivered COD order not yet linked to a submission
   * (optionally scoped to one date) gets stamped with a new RiderCollectionSubmission row in one
   * transaction — the append-only record of "this cash was handed over".
   */
  async submitCollection(staff: StaffJwtPayload, dateStr?: string) {
    const rider = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: staff.sub },
      select: { branchAssignments: { select: { branchId: true }, take: 1 } },
    });
    const branchId = rider.branchAssignments[0]?.branchId;
    if (!branchId) {
      throw new ForbiddenException({ code: "NO_BRANCH", message: "Your account has no branch assignment" });
    }

    const dateRange = dateStr ? this.resolveDateRange({ date: dateStr }) : undefined;
    const [codDeliveredUnsubmitted, codPending] = await Promise.all([
      this.prisma.order.findMany({
        where: { assignedRiderId: staff.sub, paymentMethod: "COD", status: { in: [...DELIVERED_STATUSES] }, paymentStatus: { notIn: ["PAID", "REFUNDED"] }, collectionSubmissionId: null, ...(dateRange ? { riderAssignedAt: dateRange } : {}) },
        select: { id: true, grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: { assignedRiderId: staff.sub, paymentMethod: "COD", status: { notIn: [...DELIVERED_STATUSES, ...CANCELLED_STATUSES] }, ...(dateRange ? { riderAssignedAt: dateRange } : {}) },
        select: { grandTotal: true },
      }),
    ]);

    if (codDeliveredUnsubmitted.length === 0) {
      throw new ForbiddenException({ code: "NOTHING_TO_SUBMIT", message: "No collected COD cash to submit right now" });
    }

    const collectedAmount = codDeliveredUnsubmitted.reduce((s, o) => s + o.grandTotal, 0);
    const pendingAmount = codPending.reduce((s, o) => s + o.grandTotal, 0);

    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.riderCollectionSubmission.create({
        data: {
          riderId: staff.sub,
          branchId,
          codOrderCount: codDeliveredUnsubmitted.length,
          expectedAmount: collectedAmount + pendingAmount,
          collectedAmount,
          pendingAmount,
          submittedAmount: collectedAmount,
        },
      });
      await tx.order.updateMany({
        where: { id: { in: codDeliveredUnsubmitted.map((o) => o.id) } },
        data: { collectionSubmissionId: submission.id },
      });
      return submission;
    });
  }

  /**
   * Every delivered COD order (any date) whose cash this rider still owes the restaurant, oldest first.
   * This is the fraud-control view: an order only leaves this list when an admin confirms they received the cash.
   */
  async unsettled(staff: StaffJwtPayload, riderId: string) {
    await this.assertRiderAccess(staff, riderId);
    const orders = await this.prisma.order.findMany({
      where: { assignedRiderId: riderId, ...UNSETTLED_COD_WHERE },
      select: {
        id: true,
        orderNumber: true,
        grandTotal: true,
        paymentStatus: true,
        updatedAt: true,
        contactName: true,
        customer: { select: { name: true } },
        collectionSubmissionId: true,
        payments: { select: { status: true, amount: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 500,
    });

    const rows = orders.map((o) => {
      const paid = o.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.contactName ?? o.customer?.name ?? "Guest",
        amount: Math.max(0, o.grandTotal - paid),
        deliveredAt: o.updatedAt,
        handedIn: o.collectionSubmissionId !== null,
      };
    });
    return {
      orderCount: rows.length,
      totalAmount: rows.reduce((s, r) => s + r.amount, 0),
      handedInAmount: rows.filter((r) => r.handedIn).reduce((s, r) => s + r.amount, 0),
      notHandedInAmount: rows.filter((r) => !r.handedIn).reduce((s, r) => s + r.amount, 0),
      oldestDeliveredAt: rows[0]?.deliveredAt ?? null,
      orders: rows,
    };
  }

  async collectionSubmissions(staff: StaffJwtPayload, riderId: string, filters: { from?: string; to?: string } = {}) {
    await this.assertRiderAccess(staff, riderId);
    const dateRange = this.resolveDateRange(filters);
    return this.prisma.riderCollectionSubmission.findMany({
      where: { riderId, ...(dateRange ? { createdAt: dateRange } : {}) },
      include: { branch: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  /**
   * A rider's own dashboard feed — deliberately NOT gated by a fine-grained permission beyond
   * authentication, since it's inherently self-scoped (assignedRiderId === the caller). Anyone
   * with orders assigned to them can see this, rider or not, which is the correct behaviour.
   */
  async myOrders(staff: StaffJwtPayload) {
    const orders = await this.prisma.order.findMany({
      where: { assignedRiderId: staff.sub },
      select: DELIVERY_SELECT,
      orderBy: { riderAssignedAt: "desc" },
      take: 200,
    });
    return orders.map(toDeliveryDto);
  }
}
