/**
 * The timer shown for an active order, and the time each kind of order is expected to take.
 *
 * Each branch sets how many minutes every kind of order should take (delivery, takeaway, online pickup, dine-in). The
 * timer counts DOWN from the moment the order was placed to that time, and past it shows how late the order is. Customers
 * are told the same time. If the order already carries its own time (`estimatedDeliveryAt`, set when it was placed or
 * adjusted by staff) that is used instead, so a changed branch setting never moves an order that is already in progress.
 *
 * It always comes from timestamps the order already has, so it stays right when a screen is closed and opened again.
 * Only an order whose branch has no time set (0 minutes) counts up instead. Finished or called-off orders have no timer.
 */
export type BranchTimes = {
  estimatedDeliveryMins?: number | null;
  estimatedTakeawayMins?: number | null;
  estimatedPickupMins?: number | null;
  estimatedDineInMins?: number | null;
};

export type OrderTimerInput = {
  type: string;
  status: string;
  createdAt: string | Date;
  /** The order's own promised time (set at placement, or changed by staff). */
  estimatedDeliveryAt?: string | Date | null;
  /** The branch's configured times, used when the order has no time of its own. */
  branch?: BranchTimes | null;
};

export type OrderTimer = {
  kind: "countdown" | "elapsed";
  /** Whole seconds: time left (negative = late) for a countdown, time since placed for elapsed. */
  seconds: number;
  /** The whole time the order was given, in seconds (countdown only); lets a screen draw a progress bar. */
  totalSeconds: number | null;
  /** "12:30" or "1:05:09". */
  text: string;
  /** Short word shown with it. */
  suffix: "left" | "late" | "elapsed";
  tone: "ok" | "warn" | "late" | "neutral";
};

const FINISHED = new Set(["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"]);
const COOKING = new Set(["PENDING", "CONFIRMED", "PREPARING"]);
export const DELIVERY_ORDER_TYPES = new Set(["DELIVERY", "ONLINE_DELIVERY"]);

/** The branch's expected minutes for this kind of order (0 when none is set). */
export function minutesForOrderType(type: string, branch?: BranchTimes | null): number {
  if (!branch) return 0;
  const mins = DELIVERY_ORDER_TYPES.has(type)
    ? branch.estimatedDeliveryMins
    : type === "DINE_IN"
      ? branch.estimatedDineInMins
      : type === "ONLINE_PICKUP"
        ? branch.estimatedPickupMins
        : branch.estimatedTakeawayMins; // TAKEAWAY and WALK_IN: taken at the counter
  return mins && mins > 0 ? mins : 0;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.abs(Math.trunc(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function orderTimer(order: OrderTimerInput, nowMs: number): OrderTimer | null {
  if (FINISHED.has(order.status)) return null;
  const created = new Date(order.createdAt).getTime();
  if (!Number.isFinite(created)) return null;

  const own = order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt).getTime() : NaN;
  const mins = minutesForOrderType(order.type, order.branch);
  const promised = Number.isFinite(own) ? own : mins > 0 ? created + mins * 60_000 : null;

  if (promised != null) {
    const left = Math.trunc((promised - nowMs) / 1000);
    const total = Math.max(60, Math.round((promised - created) / 1000));
    // amber for the last fifth of the time (and never less than 3 minutes), red once it is late
    const tone = left < 0 ? "late" : left <= Math.max(180, total * 0.2) ? "warn" : "ok";
    return { kind: "countdown", seconds: left, totalSeconds: total, text: formatClock(left), suffix: left < 0 ? "late" : "left", tone };
  }

  const elapsed = Math.max(0, Math.trunc((nowMs - created) / 1000));
  const minutes = elapsed / 60;
  const tone = !COOKING.has(order.status) ? "neutral" : minutes >= 20 ? "late" : minutes >= 10 ? "warn" : "ok";
  return { kind: "elapsed", seconds: elapsed, totalSeconds: null, text: formatClock(elapsed), suffix: "elapsed", tone };
}
