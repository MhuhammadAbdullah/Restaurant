import { describe, expect, it } from "vitest";
import { formatClock, minutesForOrderType, orderTimer } from "@restaurant/utils";

const at = (iso: string) => new Date(iso).getTime();
const placed = "2026-10-17T12:00:00.000Z";
const branch = { estimatedDeliveryMins: 45, estimatedTakeawayMins: 15, estimatedPickupMins: 20, estimatedDineInMins: 25 };

describe("minutes for each kind of order", () => {
  it("come from the branch's own setting for that kind", () => {
    expect(minutesForOrderType("DELIVERY", branch)).toBe(45);
    expect(minutesForOrderType("ONLINE_DELIVERY", branch)).toBe(45);
    expect(minutesForOrderType("TAKEAWAY", branch)).toBe(15);
    expect(minutesForOrderType("WALK_IN", branch)).toBe(15);
    expect(minutesForOrderType("ONLINE_PICKUP", branch)).toBe(20);
    expect(minutesForOrderType("DINE_IN", branch)).toBe(25);
  });
  it("are 0 when nothing is set", () => {
    expect(minutesForOrderType("TAKEAWAY", null)).toBe(0);
    expect(minutesForOrderType("TAKEAWAY", { estimatedTakeawayMins: 0 })).toBe(0);
    expect(minutesForOrderType("DINE_IN", {})).toBe(0);
  });
});

describe("orderTimer counts down for every kind of order", () => {
  it("each kind counts down from its own time", () => {
    const now = at("2026-10-17T12:05:00.000Z");
    expect(orderTimer({ type: "TAKEAWAY", status: "PREPARING", createdAt: placed, branch }, now)!.text).toBe("10:00");
    expect(orderTimer({ type: "ONLINE_PICKUP", status: "PREPARING", createdAt: placed, branch }, now)!.text).toBe("15:00");
    expect(orderTimer({ type: "DINE_IN", status: "PREPARING", createdAt: placed, branch }, now)!.text).toBe("20:00");
    const delivery = orderTimer({ type: "DELIVERY", status: "PREPARING", createdAt: placed, branch }, now)!;
    expect(delivery.text).toBe("40:00");
    expect(delivery.kind).toBe("countdown");
    expect(delivery.suffix).toBe("left");
    expect(delivery.totalSeconds).toBe(45 * 60);
  });

  it("the order's own time wins over the branch setting, so a later change never moves an order in progress", () => {
    const t = orderTimer({ type: "TAKEAWAY", status: "CONFIRMED", createdAt: placed, estimatedDeliveryAt: "2026-10-17T12:30:00.000Z", branch }, at("2026-10-17T12:15:30.000Z"))!;
    expect(t.text).toBe("14:30");
    expect(t.totalSeconds).toBe(30 * 60);
  });

  it("turns amber in the last fifth of the time and red when late, showing how late", () => {
    const o = { type: "TAKEAWAY", status: "PREPARING", createdAt: placed, branch }; // 15 minutes
    expect(orderTimer(o, at("2026-10-17T12:10:00.000Z"))!.tone).toBe("ok");
    expect(orderTimer(o, at("2026-10-17T12:12:00.000Z"))!.tone).toBe("warn"); // 3 minutes left
    const late = orderTimer(o, at("2026-10-17T12:17:05.000Z"))!;
    expect(late).toMatchObject({ tone: "late", suffix: "late", text: "02:05" });
    expect(late.seconds).toBe(-125);
  });

  it("a long delivery turns amber at a fifth of its time (9 of 45 minutes)", () => {
    const o = { type: "DELIVERY", status: "OUT_FOR_DELIVERY", createdAt: placed, branch };
    expect(orderTimer(o, at("2026-10-17T12:35:00.000Z"))!.tone).toBe("ok"); // 10 left
    expect(orderTimer(o, at("2026-10-17T12:37:00.000Z"))!.tone).toBe("warn"); // 8 left
  });

  it("only an order whose branch has no time set counts up", () => {
    const t = orderTimer({ type: "TAKEAWAY", status: "CONFIRMED", createdAt: placed, branch: { estimatedTakeawayMins: 0 } }, at("2026-10-17T12:03:00.000Z"))!;
    expect(t).toMatchObject({ kind: "elapsed", text: "03:00", suffix: "elapsed", totalSeconds: null });
    expect(orderTimer({ type: "DINE_IN", status: "READY", createdAt: placed }, at("2026-10-17T12:30:00.000Z"))!.tone).toBe("neutral");
  });

  it("finished or cancelled orders have no timer", () => {
    for (const status of ["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"]) {
      expect(orderTimer({ type: "DELIVERY", status, createdAt: placed, branch }, at("2026-10-17T12:10:00.000Z"))).toBeNull();
    }
  });

  it("is computed from timestamps, so it is the same after a screen is reopened", () => {
    const order = { type: "TAKEAWAY", status: "CONFIRMED", createdAt: placed, branch };
    const later = at("2026-10-17T12:07:07.000Z");
    expect(orderTimer(order, later)!.text).toBe(orderTimer({ ...order }, later)!.text);
    expect(orderTimer(order, later)!.text).toBe("07:53");
  });

  it("formats hours, and a clock that is slightly ahead never shows a negative elapsed time", () => {
    expect(formatClock(3725)).toBe("1:02:05");
    expect(orderTimer({ type: "TAKEAWAY", status: "CONFIRMED", createdAt: "2026-10-17T12:00:10.000Z" }, at("2026-10-17T12:00:00.000Z"))!.seconds).toBe(0);
  });
});
