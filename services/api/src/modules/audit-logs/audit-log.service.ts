import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@restaurant/database";
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

  // ---------- Day-wise archive (admin Audit Logs page) ----------
  // Logs are only ever read one day at a time, on demand. "Day" means the admin's local calendar day, so the
  // browser sends its UTC offset (Date.getTimezoneOffset(), minutes: local = UTC - offset).

  private dayRange(day: string, tzOffsetMin: number) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!m) throw new BadRequestException({ code: "INVALID_DAY", message: "day must be YYYY-MM-DD" });
    const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + tzOffsetMin * 60_000);
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }

  /** How many entries exist on each day of a month: powers the archive calendar. No log rows are returned. */
  async daysInMonth(restaurantId: string, month: string, tzOffsetMin: number): Promise<{ day: string; count: number }[]> {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) throw new BadRequestException({ code: "INVALID_MONTH", message: "month must be YYYY-MM" });
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const start = new Date(Date.UTC(y, mo - 1, 1) + tzOffsetMin * 60_000);
    const end = new Date(Date.UTC(y, mo, 1) + tzOffsetMin * 60_000);
    const rows = await this.prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char(("createdAt" - make_interval(mins => ${tzOffsetMin}::int)), 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
      FROM audit_logs
      WHERE "restaurantId" = ${restaurantId} AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1
      ORDER BY 1`;
    return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
  }

  private dayWhere(restaurantId: string, day: string, tzOffsetMin: number, f: { entityType?: string; action?: string; staffUserId?: string; search?: string }): Prisma.AuditLogWhereInput {
    const { start, end } = this.dayRange(day, tzOffsetMin);
    const search = f.search?.trim();
    return {
      restaurantId,
      createdAt: { gte: start, lt: end },
      entityType: f.entityType || undefined,
      action: f.action || undefined,
      staffUserId: f.staffUserId === "__system" ? null : f.staffUserId || undefined,
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" } },
              { entityType: { contains: search, mode: "insensitive" } },
              { entityId: { contains: search, mode: "insensitive" } },
              { staffUser: { name: { contains: search, mode: "insensitive" } } },
              { staffUser: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
  }

  /** One page of one day's entries, plus the values for that day's filter dropdowns. Loaded from the DB only when asked for. */
  async listDay(
    restaurantId: string,
    day: string,
    tzOffsetMin: number,
    filters: { entityType?: string; action?: string; staffUserId?: string; search?: string },
    page: number,
    pageSize: number,
  ) {
    const size = Math.min(Math.max(Math.floor(pageSize) || 50, 1), 200);
    const current = Math.max(Math.floor(page) || 1, 1);
    const where = this.dayWhere(restaurantId, day, tzOffsetMin, filters);
    const dayOnly = this.dayWhere(restaurantId, day, tzOffsetMin, {});
    const [total, items, entityTypes, actions, staffGroups] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { staffUser: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (current - 1) * size,
        take: size,
      }),
      this.prisma.auditLog.groupBy({ by: ["entityType"], where: dayOnly, _count: { _all: true } }),
      this.prisma.auditLog.groupBy({ by: ["action"], where: dayOnly, _count: { _all: true } }),
      this.prisma.auditLog.groupBy({ by: ["staffUserId"], where: dayOnly, _count: { _all: true } }),
    ]);
    const staffIds = staffGroups.map((g) => g.staffUserId).filter((id): id is string => !!id);
    const staffRows = staffIds.length ? await this.prisma.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } }) : [];
    const nameOf = new Map(staffRows.map((s) => [s.id, s.name]));
    return {
      items,
      total,
      page: current,
      pageSize: size,
      pageCount: Math.max(1, Math.ceil(total / size)),
      facets: {
        entityTypes: entityTypes.map((g) => ({ value: g.entityType, count: g._count._all })).sort((a, b) => a.value.localeCompare(b.value)),
        actions: actions.map((g) => ({ value: g.action, count: g._count._all })).sort((a, b) => a.value.localeCompare(b.value)),
        staff: staffGroups
          .map((g) => ({ value: g.staffUserId ?? "__system", label: g.staffUserId ? (nameOf.get(g.staffUserId) ?? "Deleted staff") : "System", count: g._count._all }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    };
  }

  /** The whole day (with the same filters) as CSV, for keeping an offline archive copy. */
  async exportDayCsv(restaurantId: string, day: string, tzOffsetMin: number, filters: { entityType?: string; action?: string; staffUserId?: string; search?: string }): Promise<string> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.dayWhere(restaurantId, day, tzOffsetMin, filters),
      include: { staffUser: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take: 50_000,
    });
    const esc = (v: unknown) => {
      const t = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const header = ["Time (UTC)", "Staff", "Email", "Action", "Entity", "Entity ID", "Old value", "New value", "IP", "User agent"];
    const lines = rows.map((r) => [r.createdAt.toISOString(), r.staffUser?.name ?? "System", r.staffUser?.email ?? "", r.action, r.entityType, r.entityId, r.oldValue, r.newValue, r.ipAddress, r.userAgent].map(esc).join(","));
    return [header.join(","), ...lines].join("\n");
  }
}
