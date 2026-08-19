import { Injectable } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";

export interface AuditLogEntry {
  restaurantId: string;
  staffUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        restaurantId: entry.restaurantId,
        staffUserId: entry.staffUserId ?? undefined,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValue: entry.oldValue === undefined ? undefined : (entry.oldValue as never),
        newValue: entry.newValue === undefined ? undefined : (entry.newValue as never),
        ipAddress: entry.ipAddress ?? undefined,
        userAgent: entry.userAgent ?? undefined,
      },
    });
  }

  recordForStaff(
    staff: StaffJwtPayload,
    action: string,
    entityType: string,
    entityId: string,
    changes?: { oldValue?: unknown; newValue?: unknown },
    request?: { ip?: string; userAgent?: string },
  ) {
    return this.record({
      restaurantId: staff.restaurantId,
      staffUserId: staff.sub,
      action,
      entityType,
      entityId,
      oldValue: changes?.oldValue,
      newValue: changes?.newValue,
      ipAddress: request?.ip,
      userAgent: request?.userAgent,
    });
  }

  /** Chronological (oldest first) timeline for one order — powers the Order Detail status-history view. */
  async listForOrder(orderId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType: "Order", entityId: orderId },
      include: { staffUser: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Chronological (oldest first) timeline for one complaint — powers the Complaint Details popup's status history. */
  async listForComplaint(complaintId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType: "Complaint", entityId: complaintId },
      include: { staffUser: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async list(restaurantId: string, filters: { entityType?: string; staffUserId?: string; from?: Date; to?: Date }, take = 200) {
    return this.prisma.auditLog.findMany({
      where: {
        restaurantId,
        entityType: filters.entityType,
        staffUserId: filters.staffUserId,
        createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
      },
      include: { staffUser: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
  }
}
