import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddComplaintMessageInput,
  AssignComplaintInput,
  CreateComplaintInput,
  UpdateComplaintStatusInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import type { ComplaintCategory, ComplaintStatus, Prisma } from "@restaurant/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";
import { AuditLogService } from "../audit-logs/audit-log.service";

function assertStaffBranchAccess(staff: StaffJwtPayload, branchId: string | null) {
  if (staff.isOwner || staff.allBranchesAccess || !branchId) return;
  if (!staff.branchIds.includes(branchId)) {
    throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this branch" });
  }
}

// A customer's ComplaintOrderType selection is a loose, human description ("Delivery") — this
// maps it to the internal OrderType values it could plausibly correspond to, purely to decide
// whether a resolved order is worth auto-linking. Never used to reject the complaint outright.
const ORDER_TYPE_MATCHES: Record<string, string[]> = {
  DELIVERY: ["ONLINE_DELIVERY", "DELIVERY"],
  PICKUP: ["ONLINE_PICKUP"],
  TAKEAWAY: ["TAKEAWAY", "WALK_IN"],
  DINE_IN: ["DINE_IN"],
};

const COMPLAINT_LIST_INCLUDE = {
  customer: { select: { name: true, phone: true, email: true } },
  branch: { select: { name: true, city: true } },
  order: { select: { orderNumber: true } },
};

const COMPLAINT_INCLUDE = {
  messages: { orderBy: { createdAt: "asc" as const }, include: { attachments: true, senderStaff: { select: { name: true } } } },
  attachments: true,
  order: { select: { orderNumber: true, type: true, status: true, grandTotal: true, createdAt: true } },
  product: { select: { name: true } },
  branch: { select: { name: true, city: true, area: true } },
  assignedToStaff: { select: { name: true } },
  customer: { select: { name: true, phone: true, email: true } },
};

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
    private readonly auditLogs: AuditLogService,
  ) {}

  // ---------- Customer-facing ----------

  async createComplaint(customerId: string | null, input: CreateComplaintInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const orderNumberInput = input.orderNumber?.trim() || undefined;

    // Resolve (never trust) the customer-typed order number: only link it as `orderId` when it
    // actually exists and belongs to the branch the customer selected — otherwise the raw text
    // is still kept on the complaint for staff to search/reference manually.
    let orderId: string | undefined;
    if (orderNumberInput) {
      const order = await this.prisma.order.findFirst({
        where: { orderNumber: orderNumberInput, restaurantId },
      });
      const branchMatches = !order || !input.branchId || order.branchId === input.branchId;
      const typeMatches = !order || !input.orderType || ORDER_TYPE_MATCHES[input.orderType]?.includes(order.type);
      if (order && branchMatches && typeMatches) {
        orderId = order.id;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const complaintNumber = await this.nextComplaintNumber(tx, restaurantId);
      return tx.complaint.create({
        data: {
          complaintNumber,
          restaurantId,
          customerId,
          branchId: input.branchId,
          orderId,
          orderNumberInput,
          orderType: input.orderType,
          productId: input.productId,
          contactName: input.contactName,
          contactPhone: input.contactPhone || undefined,
          contactEmail: input.contactEmail || undefined,
          category: input.category,
          subject: input.subject,
          description: input.description,
          attachments: { create: input.attachmentUrls.map((url) => ({ url })) },
        },
        include: COMPLAINT_INCLUDE,
      });
    });
  }

  private async nextComplaintNumber(tx: Prisma.TransactionClient, restaurantId: string): Promise<string> {
    const seq = await tx.restaurantComplaintSequence.upsert({
      where: { restaurantId },
      create: { restaurantId, nextValue: 1 },
      update: { nextValue: { increment: 1 } },
    });
    return `CMP-${String(seq.nextValue).padStart(5, "0")}`;
  }

  async listForCustomer(customerId: string) {
    return this.prisma.complaint.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: { order: { select: { orderNumber: true } } },
    });
  }

  async getForCustomer(customerId: string, id: string) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id }, include: COMPLAINT_INCLUDE });
    if (!complaint || complaint.customerId !== customerId) {
      throw new NotFoundException({ code: "COMPLAINT_NOT_FOUND", message: "Complaint not found" });
    }
    // Internal notes are staff-only — never surface them to the customer viewing their own thread.
    return { ...complaint, messages: complaint.messages.filter((m) => !m.isInternalNote) };
  }

  async addCustomerMessage(customerId: string, id: string, input: AddComplaintMessageInput) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    if (!complaint || complaint.customerId !== customerId) {
      throw new NotFoundException({ code: "COMPLAINT_NOT_FOUND", message: "Complaint not found" });
    }
    return this.prisma.complaintMessage.create({
      data: {
        complaintId: id,
        senderType: "CUSTOMER",
        senderCustomerId: customerId,
        message: input.message,
        isInternalNote: false,
        attachments: { create: input.attachmentUrls.map((url) => ({ url, complaint: { connect: { id } } })) },
      },
      include: { attachments: true },
    });
  }

  // ---------- Staff-facing ----------

  async listForStaff(
    staff: StaffJwtPayload,
    filters: { branchId?: string; status?: ComplaintStatus; category?: ComplaintCategory; search?: string; from?: Date; to?: Date },
  ) {
    if (filters.branchId) assertStaffBranchAccess(staff, filters.branchId);
    const search = filters.search?.trim();

    return this.prisma.complaint.findMany({
      where: {
        restaurantId: await this.restaurantContext.getRestaurantId(),
        branchId: filters.branchId ?? (staff.isOwner ? undefined : { in: staff.branchIds }),
        status: filters.status,
        category: filters.category,
        createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
        ...(search
          ? {
              OR: [
                { complaintNumber: { contains: search, mode: "insensitive" as const } },
                { orderNumberInput: { contains: search, mode: "insensitive" as const } },
                { contactName: { contains: search, mode: "insensitive" as const } },
                { contactPhone: { contains: search } },
                { contactEmail: { contains: search, mode: "insensitive" as const } },
                { customer: { name: { contains: search, mode: "insensitive" as const } } },
                { customer: { phone: { contains: search } } },
                { customer: { email: { contains: search, mode: "insensitive" as const } } },
                { order: { orderNumber: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: COMPLAINT_LIST_INCLUDE,
    });
  }

  private async getOwnedByStaff(staff: StaffJwtPayload, id: string) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id }, include: COMPLAINT_INCLUDE });
    if (!complaint) throw new NotFoundException({ code: "COMPLAINT_NOT_FOUND", message: "Complaint not found" });
    assertStaffBranchAccess(staff, complaint.branchId);
    return complaint;
  }

  async getForStaff(staff: StaffJwtPayload, id: string) {
    return this.getOwnedByStaff(staff, id);
  }

  /** Chronological status/assignment timeline for one complaint — derived from AuditLog, same branch scoping as the complaint itself. */
  async getHistory(staff: StaffJwtPayload, id: string) {
    await this.getOwnedByStaff(staff, id);
    return this.auditLogs.listForComplaint(id);
  }

  async assign(staff: StaffJwtPayload, id: string, input: AssignComplaintInput) {
    await this.getOwnedByStaff(staff, id);
    return this.prisma.complaint.update({
      where: { id },
      data: { assignedToStaffId: input.staffUserId, status: "UNDER_REVIEW" },
    });
  }

  async addStaffMessage(staff: StaffJwtPayload, id: string, input: AddComplaintMessageInput) {
    await this.getOwnedByStaff(staff, id);
    const message = await this.prisma.complaintMessage.create({
      data: {
        complaintId: id,
        senderType: "STAFF",
        senderStaffId: staff.sub,
        message: input.message,
        isInternalNote: input.isInternalNote,
        attachments: { create: input.attachmentUrls.map((url) => ({ url, complaint: { connect: { id } } })) },
      },
      include: { attachments: true },
    });
    if (!input.isInternalNote) {
      await this.prisma.complaint.update({
        where: { id },
        data: { status: "IN_PROGRESS" },
      });
    }
    return message;
  }

  async updateStatus(staff: StaffJwtPayload, id: string, input: UpdateComplaintStatusInput) {
    const complaint = await this.getOwnedByStaff(staff, id);
    const updated = await this.prisma.complaint.update({ where: { id }, data: { status: input.status } });

    // Guest complaints have no account to notify through — staff follow up via contactPhone/contactEmail instead.
    if (complaint.customerId) {
      await this.prisma.notification.create({
        data: {
          restaurantId: complaint.restaurantId,
          recipientType: "CUSTOMER",
          recipientCustomerId: complaint.customerId,
          type: "COMPLAINT_UPDATED",
          title: "Complaint update",
          message: `Your complaint "${complaint.subject}" is now ${input.status}.`,
        },
      });
    }

    return updated;
  }
}
