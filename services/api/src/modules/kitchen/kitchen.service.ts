import { ForbiddenException, Injectable } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { OrdersService } from "../orders/orders.service";
import { hiddenOnlinePaymentWhere } from "../orders/order-visibility";

function assertBranchAccess(staff: StaffJwtPayload, branchId: string) {
  if (staff.isOwner) return;
  if (!staff.branchIds.includes(branchId)) {
    throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this branch" });
  }
}

// PENDING is deliberately excluded — an order Admin hasn't accepted yet has nothing for the
// kitchen to act on (see the new Accept workflow in OrdersService.updateOrderStatus). POS orders
// skip PENDING entirely (start CONFIRMED), so this only actually holds back unaccepted online
// orders. CANCELLED is included (read-only on the board) so kitchen staff can see an order was
// called off and stop preparing it — not because kitchen ever transitions an order into that status.
const KITCHEN_STATUSES = ["CONFIRMED", "PREPARING", "READY", "CANCELLED"] as const;
// Cancelled tickets only matter while the kitchen might still be cooking them — older ones would just clutter the board forever.
const CANCELLED_VISIBLE_MS = 12 * 60 * 60 * 1000;

/**
 * Kitchen board data deliberately excludes financial/customer PII (CLAUDE.md §13 —
 * "Financial/customer PII hidden unless permitted"): no grandTotal, no payment info, no
 * customer phone/address, just what's needed to cook and hand off the order.
 */
@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly orders: OrdersService,
  ) {}

  async listOrders(staff: StaffJwtPayload, branchId: string) {
    assertBranchAccess(staff, branchId);

    return this.prisma.order.findMany({
      // KITCHEN_STATUSES already excludes PENDING (an unaccepted order), which is the normal
      // path — this predicate is defense-in-depth in case a hidden ONLINE order ever ends up
      // CONFIRMED/PREPARING/etc. despite the Accept-guard in OrdersService.updateOrderStatus.
      where: {
        ...hiddenOnlinePaymentWhere(),
        branchId,
        OR: [
          { status: { in: KITCHEN_STATUSES.filter((s) => s !== "CANCELLED") } },
          { status: "CANCELLED", updatedAt: { gte: new Date(Date.now() - CANCELLED_VISIBLE_MS) } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        orderNumber: true,
        type: true,
        source: true,
        status: true,
        specialInstructions: true,
        createdAt: true,
        table: { select: { number: true, name: true } },
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            quantity: true,
            specialInstructions: true,
            orderRevisionId: true,
            choices: { select: { nameSnapshot: true } },
            addons: { select: { nameSnapshot: true, quantity: true } },
            dealSlots: {
              select: {
                nameSnapshot: true,
                dealSlot: { select: { label: true } },
                choices: { select: { nameSnapshot: true } },
                addons: { select: { nameSnapshot: true, quantity: true } },
              },
            },
          },
        },
      },
    });
  }

  async startPreparing(staff: StaffJwtPayload, orderId: string) {
    return this.transition(staff, orderId, "PREPARING");
  }

  async markReady(staff: StaffJwtPayload, orderId: string) {
    return this.transition(staff, orderId, "READY");
  }

  /**
   * READY has no further kitchen-board action today — this closes it out. Delivery-type orders
   * (POS DELIVERY / online ONLINE_DELIVERY) go to OUT_FOR_DELIVERY (still in transit); everything
   * else (dine-in/walk-in/takeaway/pickup) goes straight to COMPLETED. Delegates to
   * OrdersService.updateOrderStatus so table-release logic isn't duplicated here.
   */
  async markCompleted(staff: StaffJwtPayload, orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    assertBranchAccess(staff, order.branchId);
    const nextStatus = order.type === "DELIVERY" || order.type === "ONLINE_DELIVERY" ? "OUT_FOR_DELIVERY" : "COMPLETED";
    return this.orders.updateOrderStatus(staff, orderId, { status: nextStatus });
  }

  private async transition(staff: StaffJwtPayload, orderId: string, status: "PREPARING" | "READY") {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    assertBranchAccess(staff, order.branchId);
    const updated = await this.prisma.order.update({ where: { id: orderId }, data: { status } });
    this.realtime.emitOrderStatusChanged({
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      customerId: order.customerId,
      order: updated,
    });
    return updated;
  }
}
