import { Injectable } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { PushService } from "./push.service";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "has been received",
  CONFIRMED: "has been accepted",
  PREPARING: "is being prepared",
  READY: "is ready",
  OUT_FOR_DELIVERY: "is out for delivery",
  DELIVERED: "has been delivered",
  COMPLETED: "has been completed",
  CANCELLED: "has been cancelled",
  REFUNDED: "has been refunded",
};

type NewOrderNotifyInput = {
  id: string;
  restaurantId: string;
  branchId: string;
  orderNumber: string;
  type: string;
  grandTotal: number;
  contactName: string | null;
  customer?: { name: string } | null;
  branch: { name: string };
};

type StatusChangeNotifyInput = {
  id: string;
  restaurantId: string;
  orderNumber: string;
  customerId: string | null;
  status: string;
};

/**
 * Central fan-out point for both notification channels this system has (in-app Notification rows
 * — powers the admin bell and the customer notification center — and order-scoped Web Push).
 * Every "tell someone about an order event" call in the app should go through here rather than
 * writing `prisma.notification.create` or calling PushService directly, so channel logic stays in
 * one place.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  /**
   * One Notification row per relevant staff member (Owner + anyone assigned to this branch) so
   * read state is per-person. Sound/bell trigger only fires here — never on routine status
   * changes. Riders are deliberately excluded — they get their own assigned-delivery view, not
   * general "a new order came in" alerts meant for whoever's managing the front desk.
   */
  async notifyStaffNewOrder(order: NewOrderNotifyInput): Promise<void> {
    const recipients = await this.prisma.staffUser.findMany({
      where: {
        restaurantId: order.restaurantId,
        role: { name: { not: "Rider" } },
        OR: [{ role: { name: "Owner" } }, { branchAssignments: { some: { branchId: order.branchId } } }],
      },
      select: { id: true },
    });
    if (recipients.length === 0) return;

    const customerName = order.customer?.name ?? order.contactName ?? "Guest";
    const amount = (order.grandTotal / 100).toFixed(0);
    const title = "New order";
    const message = `${order.orderNumber} — ${customerName} — ${order.branch.name} — Rs. ${amount} — ${order.type.replace(/_/g, " ")}`;
    await this.prisma.notification.createMany({
      data: recipients.map((r) => ({
        restaurantId: order.restaurantId,
        recipientType: "STAFF" as const,
        recipientStaffId: r.id,
        orderId: order.id,
        type: "NEW_ORDER",
        title,
        message,
      })),
    });

    this.realtime.emitStaffNotification({ restaurantId: order.restaurantId, branchId: order.branchId, notification: { title, message, orderId: order.id } });
  }

  /** Customer-facing: in-app Notification Center row (registered customers only) + order-scoped push (works for guests too). */
  async notifyOrderStatusChanged(order: StatusChangeNotifyInput, opts: { isAccepting: boolean } = { isAccepting: false }): Promise<void> {
    const label = STATUS_LABEL[order.status] ?? `is now ${order.status.replace(/_/g, " ")}`;
    const title = opts.isAccepting ? "Order accepted" : "Order update";
    const message = `Your order ${order.orderNumber} ${label}.`;

    if (order.customerId) {
      await this.prisma.notification.create({
        data: {
          restaurantId: order.restaurantId,
          recipientType: "CUSTOMER",
          recipientCustomerId: order.customerId,
          orderId: order.id,
          type: "ORDER_STATUS_CHANGED",
          title,
          message,
        },
      });
    }

    void this.push.sendToOrder(order.id, { title, body: message, url: `/order-confirmation/${order.orderNumber}` });
  }

  async notifyDeliveryEtaChanged(order: { id: string; restaurantId: string; orderNumber: string; customerId: string | null }, etaLabel: string): Promise<void> {
    const title = "Delivery time updated";
    const message = `Your order ${order.orderNumber}'s estimated delivery time is now ${etaLabel}.`;

    if (order.customerId) {
      await this.prisma.notification.create({
        data: {
          restaurantId: order.restaurantId,
          recipientType: "CUSTOMER",
          recipientCustomerId: order.customerId,
          orderId: order.id,
          type: "DELIVERY_ETA_CHANGED",
          title,
          message,
        },
      });
    }

    void this.push.sendToOrder(order.id, { title, body: message, url: `/order-confirmation/${order.orderNumber}` });
  }

  // ---------- Staff notification list (admin bell) ----------

  async listForStaff(staff: StaffJwtPayload, take = 30) {
    return this.prisma.notification.findMany({
      where: { recipientType: "STAFF", recipientStaffId: staff.sub },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async unreadCountForStaff(staff: StaffJwtPayload): Promise<number> {
    return this.prisma.notification.count({ where: { recipientType: "STAFF", recipientStaffId: staff.sub, isRead: false } });
  }

  async markReadForStaff(staff: StaffJwtPayload, id: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id, recipientType: "STAFF", recipientStaffId: staff.sub }, data: { isRead: true } });
  }

  async markAllReadForStaff(staff: StaffJwtPayload): Promise<void> {
    await this.prisma.notification.updateMany({ where: { recipientType: "STAFF", recipientStaffId: staff.sub, isRead: false }, data: { isRead: true } });
  }

  // ---------- Customer notification center ----------

  async listForCustomer(customerId: string, take = 30) {
    return this.prisma.notification.findMany({
      where: { recipientType: "CUSTOMER", recipientCustomerId: customerId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async unreadCountForCustomer(customerId: string): Promise<number> {
    return this.prisma.notification.count({ where: { recipientType: "CUSTOMER", recipientCustomerId: customerId, isRead: false } });
  }

  async markReadForCustomer(customerId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id, recipientType: "CUSTOMER", recipientCustomerId: customerId }, data: { isRead: true } });
  }

  async markAllReadForCustomer(customerId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { recipientType: "CUSTOMER", recipientCustomerId: customerId, isRead: false }, data: { isRead: true } });
  }
}
