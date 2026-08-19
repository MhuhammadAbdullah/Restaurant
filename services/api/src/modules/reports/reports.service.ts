import { ForbiddenException, Injectable } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

function assertBranchAccess(staff: StaffJwtPayload, branchId: string) {
  if (staff.isOwner) return;
  if (!staff.branchIds.includes(branchId)) {
    throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this branch" });
  }
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return x;
}
function startOfMonth(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  async getDashboardSummary(staff: StaffJwtPayload, branchId?: string) {
    if (branchId) assertBranchAccess(staff, branchId);
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const branchFilter = branchId ? { branchId } : staff.isOwner ? {} : { branchId: { in: staff.branchIds } };

    const [totalBranches, activeBranches] = await Promise.all([
      this.prisma.branch.count({ where: { restaurantId } }),
      this.prisma.branch.count({ where: { restaurantId, status: "ACTIVE" } }),
    ]);

    const todayStart = startOfDay();

    const revenueSince = async (since: Date) => {
      const result = await this.prisma.order.aggregate({
        where: { restaurantId, ...branchFilter, createdAt: { gte: since }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
        _sum: { grandTotal: true },
      });
      return result._sum.grandTotal ?? 0;
    };
    const [todayRevenue, weekRevenue, monthRevenue] = await Promise.all([
      revenueSince(todayStart),
      revenueSince(startOfWeek()),
      revenueSince(startOfMonth()),
    ]);

    const [totalCustomers, newCustomersToday] = await Promise.all([
      this.prisma.customer.count({ where: { restaurantId } }),
      this.prisma.customer.count({ where: { restaurantId, createdAt: { gte: todayStart } } }),
    ]);

    const loyaltyIssued = await this.prisma.loyaltyTransaction.aggregate({
      where: { type: "EARNED", loyaltyAccount: { customer: { restaurantId } } },
      _sum: { points: true },
    });

    const [openComplaints, totalComplaints] = await Promise.all([
      this.prisma.complaint.count({ where: { restaurantId, status: { in: ["OPEN", "UNDER_REVIEW", "IN_PROGRESS"] } } }),
      this.prisma.complaint.count({ where: { restaurantId } }),
    ]);

    return {
      branches: { total: totalBranches, active: activeBranches },
      revenue: { today: todayRevenue, week: weekRevenue, month: monthRevenue },
      customers: { total: totalCustomers, newToday: newCustomersToday },
      loyaltyPointsIssued: loyaltyIssued._sum.points ?? 0,
      complaints: { open: openComplaints, total: totalComplaints },
    };
  }

  /**
   * `to` arrives as a date-only string (YYYY-MM-DD) — parsed literally it's UTC midnight, which
   * would exclude everything from that day. Advance to the start of the next day and use an
   * exclusive upper bound so the whole selected day is included (same fix as the Orders list).
   */
  private resolveDateRange(from: string | undefined, to: string | undefined, defaultFrom: Date) {
    return {
      gte: from ? new Date(from) : defaultFrom,
      lt: to ? new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000) : new Date(startOfDay().getTime() + 24 * 60 * 60 * 1000),
    };
  }

  private resolveBranchFilter(staff: StaffJwtPayload, branchId?: string) {
    if (branchId) assertBranchAccess(staff, branchId);
    return branchId ? { branchId } : staff.isOwner ? {} : { branchId: { in: staff.branchIds } };
  }

  /** Order counts by status for a date range — defaults to today, but accepts today/week/month/custom via an explicit range from the caller. */
  async getOrderStatusCounts(staff: StaffJwtPayload, params: { branchId?: string; from?: string; to?: string }) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const branchFilter = this.resolveBranchFilter(staff, params.branchId);
    const createdAt = this.resolveDateRange(params.from, params.to, startOfDay());

    const statuses = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"] as const;
    const [pending, confirmed, preparing, ready, outForDelivery, delivered, cancelled] = await Promise.all(
      statuses.map((status) => this.prisma.order.count({ where: { restaurantId, ...branchFilter, status, createdAt } })),
    );
    return { pending, confirmed, preparing, ready, outForDelivery, delivered, cancelled };
  }

  /** Top selling items — defaults to today, but accepts an explicit date range. */
  async getTopItems(staff: StaffJwtPayload, params: { branchId?: string; from?: string; to?: string; limit?: number }) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const branchFilter = this.resolveBranchFilter(staff, params.branchId);
    const createdAt = this.resolveDateRange(params.from, params.to, startOfDay());
    const take = Math.min(params.limit ?? 10, 50);

    const raw = await this.prisma.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, order: { restaurantId, ...branchFilter, createdAt, status: { notIn: ["CANCELLED", "REFUNDED"] } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take,
    });
    const productIds = raw.map((b) => b.productId!).filter(Boolean);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
    return raw.map((b) => ({
      productId: b.productId,
      name: products.find((p) => p.id === b.productId)?.name ?? "Unknown",
      quantitySold: b._sum.quantity ?? 0,
    }));
  }

  /** Top customers by spend — defaults to this month, but accepts an explicit date range. */
  async getTopCustomers(staff: StaffJwtPayload, params: { branchId?: string; from?: string; to?: string; limit?: number }) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const branchFilter = this.resolveBranchFilter(staff, params.branchId);
    const createdAt = this.resolveDateRange(params.from, params.to, startOfMonth());
    const take = Math.min(params.limit ?? 20, 50);

    const raw = await this.prisma.order.groupBy({
      by: ["customerId"],
      where: { restaurantId, ...branchFilter, customerId: { not: null }, createdAt, status: { notIn: ["CANCELLED", "REFUNDED"] } },
      _sum: { grandTotal: true },
      _count: { _all: true },
      orderBy: { _sum: { grandTotal: "desc" } },
      take,
    });
    const customerIds = raw.map((c) => c.customerId!).filter(Boolean);
    const customerRecords = await this.prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, phone: true } });
    return raw.map((c) => ({
      customerId: c.customerId,
      name: customerRecords.find((x) => x.id === c.customerId)?.name ?? "Unknown",
      phone: customerRecords.find((x) => x.id === c.customerId)?.phone ?? "",
      orderCount: c._count._all,
      totalSpent: c._sum.grandTotal ?? 0,
    }));
  }
}
