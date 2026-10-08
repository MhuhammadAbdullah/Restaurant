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

/** Date-only strings (YYYY-MM-DD) are local calendar days, so a selected day always spans 00:00-24:00. */
function parseDay(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
}
function nextDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type FinanceReportFilters = {
  branchId?: string;
  from?: string;
  to?: string;
  source?: string;
  type?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  search?: string;
};

export type FinanceReportRow = {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  source: string;
  orderType: string;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  grandTotal: number;
  collectedAmount: number;
  outstandingAmount: number;
  refundAmount: number;
  transactionRef: string;
  paymentAttempts: number;
  /** A real, recognised sale: not cancelled/refunded and not an online order whose payment never cleared. */
  isSale: boolean;
};

/** Accounting view of the recognised sales in the period. Net sales = item subtotal minus every discount; tax and delivery fees are shown separately. */
export type SalesSummary = {
  orders: number;
  subtotal: number;
  discounts: number;
  netSales: number;
  deliveryFees: number;
  tax: number;
  totalBilled: number;
  averageOrderValue: number;
};

export type BreakdownRow = {
  key: string;
  label: string;
  orders: number;
  netSales: number;
  tax: number;
  totalBilled: number;
  collected: number;
  outstanding: number;
};
export type DailyRow = BreakdownRow & { refunds: number };

/** COD cash owed to the restaurant: held by riders after delivery vs. still on its way. */
export type CodReceivable = {
  withRiders: number;
  withRidersOrders: number;
  inTransit: number;
  inTransitOrders: number;
  aging: { label: string; orders: number; amount: number }[];
};

export type FinanceReport = {
  salesSummary: SalesSummary;
  byMethod: BreakdownRow[];
  byBranch: BreakdownRow[];
  byDay: DailyRow[];
  codReceivable: CodReceivable;
  rows: FinanceReportRow[];
  orderSummary: { totalOrderAttempts: number; successfulOrders: number; codOrders: number; onlineOrders: number };
  paymentSummary: { paid: number; pending: number; failed: number; expired: number; cancelled: number; refunded: number; partiallyPaid: number };
  financialSummary: {
    grossOrderValue: number;
    onlineCollected: number;
    codCollected: number;
    otherCollected: number;
    totalCollected: number;
    outstandingCod: number;
    pendingOnlineValue: number;
    failedExpiredValue: number;
    refundedAmount: number;
  };
};

const HIDDEN_ONLINE_STATUSES = new Set(["PENDING", "FAILED", "EXPIRED", "CANCELLED"]);

@Injectable()
export class FinanceReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  /**
   * Every order/payment record for the range — unlike the operational Orders list
   * (order-visibility.ts), nothing is hidden here. This is the full reconciliation/audit trail:
   * COD, online paid/pending/failed/expired/cancelled, cancelled, refunded — everything.
   */
  async getReport(staff: StaffJwtPayload, filters: FinanceReportFilters): Promise<FinanceReport> {
    if (filters.branchId) assertBranchAccess(staff, filters.branchId);
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const toExclusive = filters.to ? nextDay(parseDay(filters.to)) : undefined;

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        branchId: filters.branchId ?? (staff.isOwner ? undefined : { in: staff.branchIds }),
        source: filters.source as never,
        type: filters.type as never,
        paymentMethod: filters.paymentMethod as never,
        paymentStatus: filters.paymentStatus as never,
        createdAt: filters.from || toExclusive ? { gte: filters.from ? parseDay(filters.from) : undefined, lt: toExclusive } : undefined,
        ...(filters.search
          ? {
              OR: [
                { orderNumber: { contains: filters.search, mode: "insensitive" } },
                { contactName: { contains: filters.search, mode: "insensitive" } },
                { contactPhone: { contains: filters.search } },
                { customer: { name: { contains: filters.search, mode: "insensitive" } } },
                { customer: { phone: { contains: filters.search } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        branch: { select: { name: true } },
        customer: { select: { name: true, phone: true } },
        payments: { select: { status: true, amount: true, transactionRef: true, createdAt: true } },
      },
      // Same defensive ceiling as the operational Orders export — a deliberate admin action, not
      // a page-load, so it gets a much higher cap than any list view.
      take: 20_000,
    });

    const rows: FinanceReportRow[] = orders.map((o) => {
      const collectedAmount = o.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
      const outstandingAmount = o.paymentMethod === "COD" ? Math.max(o.grandTotal - collectedAmount, 0) : 0;
      const refundAmount = o.status === "REFUNDED" ? collectedAmount : 0;
      const latest = [...o.payments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const isSale = o.status !== "CANCELLED" && o.status !== "REFUNDED" && !(o.paymentMethod === "ONLINE" && HIDDEN_ONLINE_STATUSES.has(o.paymentStatus));
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt.toISOString(),
        branchName: o.branch.name,
        customerName: o.customer?.name ?? o.contactName ?? "Guest",
        customerPhone: o.customer?.phone ?? o.contactPhone ?? "",
        source: o.source,
        orderType: o.type,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        orderStatus: o.status,
        subtotal: o.subtotal,
        discount: o.discountAmount + o.couponDiscountAmount + o.loyaltyDiscountAmount,
        deliveryFee: o.deliveryFee,
        tax: o.taxAmount,
        grandTotal: o.grandTotal,
        collectedAmount,
        outstandingAmount,
        refundAmount,
        transactionRef: latest?.transactionRef ?? "",
        paymentAttempts: o.payments.length,
        isSale,
      };
    });

    const codRows = rows.filter((r) => r.paymentMethod === "COD");
    const onlineRows = rows.filter((r) => r.paymentMethod === "ONLINE");
    const otherRows = rows.filter((r) => r.paymentMethod !== "COD" && r.paymentMethod !== "ONLINE");
    const sum = (arr: FinanceReportRow[], key: keyof FinanceReportRow) => arr.reduce((s, r) => s + (r[key] as number), 0);

    const sales = rows.filter((r) => r.isSale);
    const subtotalSum = sum(sales, "subtotal");
    const discountSum = sum(sales, "discount");
    const salesSummary: SalesSummary = {
      orders: sales.length,
      subtotal: subtotalSum,
      discounts: discountSum,
      netSales: subtotalSum - discountSum,
      deliveryFees: sum(sales, "deliveryFee"),
      tax: sum(sales, "tax"),
      totalBilled: sum(sales, "grandTotal"),
      averageOrderValue: sales.length ? Math.round(sum(sales, "grandTotal") / sales.length) : 0,
    };

    const emptyRow = (key: string, label: string): BreakdownRow => ({ key, label, orders: 0, netSales: 0, tax: 0, totalBilled: 0, collected: 0, outstanding: 0 });
    const addTo = (target: BreakdownRow, r: FinanceReportRow) => {
      target.orders += 1;
      target.netSales += r.subtotal - r.discount;
      target.tax += r.tax;
      target.totalBilled += r.grandTotal;
      target.collected += r.collectedAmount;
      target.outstanding += r.outstandingAmount;
    };
    const group = (keyOf: (r: FinanceReportRow) => { key: string; label: string }) => {
      const m = new Map<string, BreakdownRow>();
      for (const r of sales) {
        const { key, label } = keyOf(r);
        const row = m.get(key) ?? emptyRow(key, label);
        addTo(row, r);
        m.set(key, row);
      }
      return [...m.values()];
    };
    const byMethod = group((r) => ({ key: r.paymentMethod, label: r.paymentMethod })).sort((a, b) => b.totalBilled - a.totalBilled);
    const byBranch = group((r) => ({ key: r.branchName, label: r.branchName })).sort((a, b) => b.totalBilled - a.totalBilled);

    const dayMap = new Map<string, DailyRow>();
    for (const r of rows) {
      const key = localDateKey(new Date(r.createdAt));
      const day = dayMap.get(key) ?? { ...emptyRow(key, key), refunds: 0 };
      if (r.isSale) addTo(day, r);
      day.refunds += r.refundAmount;
      dayMap.set(key, day);
    }
    const byDay = [...dayMap.values()].sort((a, b) => a.key.localeCompare(b.key));

    const codOwed = sales.filter((r) => r.paymentMethod === "COD" && r.outstandingAmount > 0);
    const heldByRiders = codOwed.filter((r) => r.orderStatus === "DELIVERED" || r.orderStatus === "COMPLETED");
    const inTransitCod = codOwed.filter((r) => r.orderStatus !== "DELIVERED" && r.orderStatus !== "COMPLETED");
    const now = Date.now();
    const ageDays = (r: FinanceReportRow) => Math.floor((now - new Date(r.createdAt).getTime()) / 86_400_000);
    const buckets: { label: string; test: (days: number) => boolean }[] = [
      { label: "Today / yesterday", test: (d) => d <= 1 },
      { label: "2–3 days", test: (d) => d >= 2 && d <= 3 },
      { label: "4–7 days", test: (d) => d >= 4 && d <= 7 },
      { label: "Over 7 days", test: (d) => d > 7 },
    ];
    const codReceivable: CodReceivable = {
      withRiders: sum(heldByRiders, "outstandingAmount"),
      withRidersOrders: heldByRiders.length,
      inTransit: sum(inTransitCod, "outstandingAmount"),
      inTransitOrders: inTransitCod.length,
      aging: buckets.map((b) => {
        const list = heldByRiders.filter((r) => b.test(ageDays(r)));
        return { label: b.label, orders: list.length, amount: sum(list, "outstandingAmount") };
      }),
    };

    return {
      salesSummary,
      byMethod,
      byBranch,
      byDay,
      codReceivable,
      rows,
      orderSummary: {
        totalOrderAttempts: rows.length,
        successfulOrders: rows.filter((r) => !(r.paymentMethod === "ONLINE" && HIDDEN_ONLINE_STATUSES.has(r.paymentStatus))).length,
        codOrders: codRows.length,
        onlineOrders: onlineRows.length,
      },
      paymentSummary: {
        paid: rows.filter((r) => r.paymentStatus === "PAID").length,
        pending: rows.filter((r) => r.paymentStatus === "PENDING").length,
        failed: rows.filter((r) => r.paymentStatus === "FAILED").length,
        expired: rows.filter((r) => r.paymentStatus === "EXPIRED").length,
        cancelled: rows.filter((r) => r.paymentStatus === "CANCELLED").length,
        refunded: rows.filter((r) => r.paymentStatus === "REFUNDED").length,
        partiallyPaid: rows.filter((r) => r.paymentStatus === "PARTIALLY_PAID").length,
      },
      financialSummary: {
        grossOrderValue: sum(rows, "grandTotal"),
        onlineCollected: sum(onlineRows, "collectedAmount"),
        codCollected: sum(codRows, "collectedAmount"),
        otherCollected: sum(otherRows, "collectedAmount"),
        totalCollected: sum(rows, "collectedAmount"),
        outstandingCod: sum(codRows, "outstandingAmount"),
        pendingOnlineValue: sum(onlineRows.filter((r) => r.paymentStatus === "PENDING"), "grandTotal"),
        failedExpiredValue: sum(onlineRows.filter((r) => ["FAILED", "EXPIRED", "CANCELLED"].includes(r.paymentStatus)), "grandTotal"),
        refundedAmount: sum(rows, "refundAmount"),
      },
    };
  }

  async getExportMeta(branchId?: string): Promise<{ restaurantName: string; branchLabel: string }> {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true } });
    const branch = branchId ? await this.prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }) : null;
    return { restaurantName: restaurant.name, branchLabel: branch?.name ?? "All Branches" };
  }

  toCsv(report: FinanceReport): string {
    const header = [
      "Order #", "Date", "Branch", "Customer", "Phone", "Source", "Order Type", "Payment Method", "Payment Status", "Order Status",
      "Subtotal (Rs.)", "Discount (Rs.)", "Delivery Fee (Rs.)", "Tax (Rs.)", "Grand Total (Rs.)",
      "Collected (Rs.)", "Outstanding (Rs.)", "Refunded (Rs.)", "Transaction Ref", "Payment Attempts",
    ];
    const rupees = (paisa: number) => (paisa / 100).toFixed(2);
    const rows = report.rows.map((r) => [
      r.orderNumber, r.createdAt, r.branchName, r.customerName, r.customerPhone, r.source, r.orderType, r.paymentMethod, r.paymentStatus, r.orderStatus,
      rupees(r.subtotal), rupees(r.discount), rupees(r.deliveryFee), rupees(r.tax), rupees(r.grandTotal),
      rupees(r.collectedAmount), rupees(r.outstandingAmount), rupees(r.refundAmount), r.transactionRef, String(r.paymentAttempts),
    ]);
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    return [header, ...rows].map((row) => row.map((cell) => escape(String(cell))).join(",")).join("\n");
  }
}
