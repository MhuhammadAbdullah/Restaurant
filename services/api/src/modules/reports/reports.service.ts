import { ForbiddenException, Injectable } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";
import { hiddenOnlinePaymentWhere } from "../orders/order-visibility";

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
        where: { restaurantId, ...branchFilter, createdAt: { gte: since }, status: { notIn: ["CANCELLED", "REFUNDED"] }, ...hiddenOnlinePaymentWhere() },
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
   * `from`/`to` arrive as date-only strings (YYYY-MM-DD). Advance `to` to the start of the next day
   * and use an exclusive upper bound so the whole selected day is included (same fix as the Orders list).
   */
  private resolveDateRange(from: string | undefined, to: string | undefined, defaultFrom: Date) {
    // Date-only strings are interpreted as LOCAL calendar days (not UTC midnight) so a selected day
    // always covers 00:00-24:00 in the server's timezone.
    const parseDay = (v: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
    };
    const nextDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return {
      gte: from ? parseDay(from) : defaultFrom,
      lt: to ? nextDay(parseDay(to)) : nextDay(startOfDay()),
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
      statuses.map((status) => this.prisma.order.count({ where: { restaurantId, ...branchFilter, status, createdAt, ...hiddenOnlinePaymentWhere() } })),
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
      where: { productId: { not: null }, order: { restaurantId, ...branchFilter, createdAt, status: { notIn: ["CANCELLED", "REFUNDED"] }, ...hiddenOnlinePaymentWhere() } },
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
      where: { restaurantId, ...branchFilter, customerId: { not: null }, createdAt, status: { notIn: ["CANCELLED", "REFUNDED"] }, ...hiddenOnlinePaymentWhere() },
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

  /**
   * One-shot payload for the dashboard charts: KPI totals (with the immediately-preceding period of
   * equal length for deltas), a revenue/orders trend, and breakdowns by order type, payment method,
   * status, branch and hour of day. Honors the same branch scoping + date semantics as the other
   * dashboard widgets; cancelled/refunded orders are excluded from revenue and the trend but still
   * counted in the status breakdown.
   */
  async getDashboardAnalytics(staff: StaffJwtPayload, params: { branchId?: string; from?: string; to?: string }) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const branchFilter = this.resolveBranchFilter(staff, params.branchId);
    const range = this.resolveDateRange(params.from, params.to, startOfDay());
    const spanMs = range.lt.getTime() - range.gte.getTime();
    const prevRange = { gte: new Date(range.gte.getTime() - spanMs), lt: range.gte };

    const select = { createdAt: true, grandTotal: true, status: true, type: true, paymentMethod: true, branchId: true } as const;
    const where = (createdAt: { gte: Date; lt: Date }) => ({ restaurantId, ...branchFilter, createdAt, ...hiddenOnlinePaymentWhere() });
    const [orders, prevOrders, branches] = await Promise.all([
      this.prisma.order.findMany({ where: where(range), select, take: 50000 }),
      this.prisma.order.findMany({ where: where(prevRange), select, take: 50000 }),
      this.prisma.branch.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
    ]);

    const isRevenue = (o: { status: string }) => o.status !== "CANCELLED" && o.status !== "REFUNDED";
    const summarize = (list: typeof orders) => {
      const valid = list.filter(isRevenue);
      const revenue = valid.reduce((s, o) => s + o.grandTotal, 0);
      return {
        revenue,
        orders: valid.length,
        avgOrderValue: valid.length ? Math.round(revenue / valid.length) : 0,
        cancelled: list.length - valid.length,
      };
    };

    const validOrders = orders.filter(isRevenue);

    // Trend: hourly for a single day, otherwise one point per day (local dates).
    const hourly = spanMs <= 24 * 60 * 60 * 1000;
    const pad = (n: number) => String(n).padStart(2, "0");
    const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const trendMap = new Map<string, { key: string; revenue: number; orders: number }>();
    if (hourly) {
      for (let h = 0; h < 24; h++) trendMap.set(pad(h), { key: pad(h), revenue: 0, orders: 0 });
    } else {
      for (let t = range.gte.getTime(); t < range.lt.getTime(); t += 24 * 60 * 60 * 1000) {
        const k = dayKey(new Date(t));
        trendMap.set(k, { key: k, revenue: 0, orders: 0 });
      }
    }
    for (const o of validOrders) {
      const k = hourly ? pad(o.createdAt.getHours()) : dayKey(o.createdAt);
      const point = trendMap.get(k);
      if (point) {
        point.revenue += o.grandTotal;
        point.orders += 1;
      }
    }

    const group = <K extends string>(pick: (o: (typeof validOrders)[number]) => K) => {
      const m = new Map<K, { orders: number; revenue: number }>();
      for (const o of validOrders) {
        const k = pick(o);
        const cur = m.get(k) ?? { orders: 0, revenue: 0 };
        cur.orders += 1;
        cur.revenue += o.grandTotal;
        m.set(k, cur);
      }
      return m;
    };
    const byType = [...group((o) => o.type)].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.orders - a.orders);
    const byPayment = [...group((o) => o.paymentMethod)].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.orders - a.orders);
    const branchTotals = group((o) => o.branchId);
    const byBranch = branches
      .filter((b) => branchTotals.has(b.id) || params.branchId === b.id)
      .map((b) => ({ branchId: b.id, name: b.name, ...(branchTotals.get(b.id) ?? { orders: 0, revenue: 0 }) }))
      .sort((a, b) => b.revenue - a.revenue);

    const byStatus: Record<string, number> = {};
    for (const o of orders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

    const hourCounts = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
    for (const o of validOrders) hourCounts[o.createdAt.getHours()]!.orders += 1;

    return {
      granularity: hourly ? ("hour" as const) : ("day" as const),
      totals: summarize(orders),
      previous: summarize(prevOrders),
      trend: [...trendMap.values()],
      byType,
      byPayment,
      byStatus,
      byBranch,
      byHour: hourCounts,
    };
  }
}
