import type { Prisma } from "@restaurant/database";

/**
 * An ONLINE-payment order whose payment hasn't cleared (or never will) is a real DB row — kept
 * forever for reconciliation/reporting (see ReportsService's finance report) — but must stay
 * invisible to day-to-day staff views (Orders list, Kitchen board, dashboard counts/revenue,
 * "new order" notifications) until PayFast's webhook confirms PAID. COD orders are never
 * affected: their paymentStatus also starts PENDING (cash not yet collected on delivery), but
 * that's a legitimate, visible "awaiting collection" state — this predicate only ever excludes
 * paymentMethod === "ONLINE" rows, so COD's PENDING/FAILED never gets touched by it.
 */
export const HIDDEN_ONLINE_PAYMENT_STATUSES = ["PENDING", "FAILED", "EXPIRED", "CANCELLED"] as const;

export function hiddenOnlinePaymentWhere(): Prisma.OrderWhereInput {
  return { NOT: { paymentMethod: "ONLINE", paymentStatus: { in: [...HIDDEN_ONLINE_PAYMENT_STATUSES] } } };
}
