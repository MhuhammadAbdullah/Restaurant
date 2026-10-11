import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { hashPassword } from "@restaurant/auth";
import type { StaffJwtPayload } from "@restaurant/auth";
import type { CreateStaffUserInput, UpdateStaffUserInput } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";
import { StaffAuthService } from "../auth/staff-auth.service";

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  async list(filters: { search?: string; roleId?: string; status?: "ACTIVE" | "INACTIVE" } = {}) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const search = filters.search?.trim();
    return this.prisma.staffUser.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        roleId: filters.roleId,
        status: filters.status,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        allBranchesAccess: true,
        lastLoginAt: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
        branchAssignments: { select: { branch: { select: { id: true, name: true, code: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const staff = await this.prisma.staffUser.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        allBranchesAccess: true,
        lastLoginAt: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
        branchAssignments: { select: { branch: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!staff) throw new NotFoundException({ code: "STAFF_NOT_FOUND", message: "Staff member not found" });
    return staff;
  }

  async create(input: CreateStaffUserInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const existing = await this.prisma.staffUser.findFirst({ where: { restaurantId, email: input.email } });
    if (existing) throw new ConflictException({ code: "EMAIL_TAKEN", message: "A staff member with this email already exists" });

    const passwordHash = await hashPassword(input.password);
    return this.prisma.staffUser.create({
      data: {
        restaurantId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        roleId: input.roleId,
        allBranchesAccess: input.allBranchesAccess ?? false,
        branchAssignments: { create: input.allBranchesAccess ? [] : input.branchIds.map((branchId) => ({ branchId })) },
      },
      include: { role: true, branchAssignments: { include: { branch: true } } },
    });
  }

  /**
   * Self-lockout protection (never let an Owner strip their own Owner-ness, and never let anyone
   * deactivate their own account) — see StaffPermissionsService.setOverrides for the analogous
   * check on individual permission overrides.
   */
  private assertNoSelfLockout(requestingStaff: StaffJwtPayload, targetId: string, before: { roleId: string }, input: UpdateStaffUserInput) {
    if (requestingStaff.sub !== targetId) return;

    if (input.status === "INACTIVE") {
      throw new ConflictException({ code: "SELF_LOCKOUT_BLOCKED", message: "You cannot deactivate your own account." });
    }
    if (requestingStaff.isOwner && input.roleId && input.roleId !== before.roleId) {
      throw new ConflictException({ code: "SELF_LOCKOUT_BLOCKED", message: "You cannot change your own role away from Owner." });
    }
  }

  async update(id: string, input: UpdateStaffUserInput, requestingStaff: StaffJwtPayload) {
    const staff = await this.prisma.staffUser.findUnique({ where: { id }, include: { role: true, branchAssignments: true } });
    if (!staff) throw new NotFoundException({ code: "STAFF_NOT_FOUND", message: "Staff member not found" });

    this.assertNoSelfLockout(requestingStaff, id, staff, input);

    if (input.email && input.email !== staff.email) {
      const conflict = await this.prisma.staffUser.findFirst({
        where: { restaurantId: staff.restaurantId, email: input.email, id: { not: id } },
      });
      if (conflict) throw new ConflictException({ code: "EMAIL_TAKEN", message: "A staff member with this email already exists" });
    }

    // Explicit "All Branches" wins over any branchIds sent alongside it — mirrors the mutual
    // exclusivity already enforced in the admin UI's branch picker.
    if (input.allBranchesAccess === true) {
      await this.prisma.staffUserBranch.deleteMany({ where: { staffUserId: id } });
    } else if (input.branchIds) {
      await this.prisma.staffUserBranch.deleteMany({ where: { staffUserId: id } });
      await this.prisma.staffUserBranch.createMany({ data: input.branchIds.map((branchId) => ({ staffUserId: id, branchId })) });
    }

    const updated = await this.prisma.staffUser.update({
      where: { id },
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone === "" ? null : input.phone,
        roleId: input.roleId,
        allBranchesAccess: input.allBranchesAccess,
        status: input.status,
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      },
      include: { role: true, branchAssignments: { include: { branch: true } } },
    });

    // branchIds/allBranchesAccess/roleId are baked into the JWT at login/refresh time — a role or
    // branch-access change silently wouldn't apply until the staff member's token happened to
    // refresh. Reusing the existing logout() (already nulls refreshTokenHash for real logout)
    // guarantees their next silent refresh fails, forcing a fresh login that picks up the new
    // role/branch scope — caps staleness at the current access token's remaining life instead of
    // leaving it open-ended. Permission-override changes need no such handling: hasPermission()
    // already reads StaffUserPermission fresh from the DB on every request.
    const roleChanged = input.roleId !== undefined && input.roleId !== staff.roleId;
    const branchAccessChanged =
      input.allBranchesAccess !== undefined && input.allBranchesAccess !== staff.allBranchesAccess;
    const branchIdsChanged =
      input.branchIds !== undefined &&
      JSON.stringify([...input.branchIds].sort()) !== JSON.stringify(staff.branchAssignments.map((a) => a.branchId).sort());
    if (roleChanged || branchAccessChanged || branchIdsChanged || !!input.password) {
      await this.staffAuth.logout(id);
    }

    return { before: staff, after: updated };
  }

  /**
   * Deletes a staff account, whatever its history. With no history the row is removed. With history (orders,
   * payments, audit entries...) it cannot simply be removed without blanking out who did what, so the account is
   * closed instead (signed out, no login, hidden from lists, email freed) and the record is kept for the history.
   * Only deleting yourself or the last active Owner is refused.
   */
  async remove(id: string, requestingStaff: StaffJwtPayload): Promise<void> {
    if (requestingStaff.sub === id) {
      throw new ConflictException({ code: "SELF_LOCKOUT_BLOCKED", message: "You cannot delete your own account." });
    }

    const staff = await this.prisma.staffUser.findUnique({ where: { id }, include: { role: true } });
    if (!staff || staff.deletedAt) throw new NotFoundException({ code: "STAFF_NOT_FOUND", message: "Staff member not found" });

    // The only thing that can never be deleted: the last active Owner, or nobody could manage the restaurant any more.
    if (staff.role.name === "Owner") {
      const otherOwners = await this.prisma.staffUser.count({ where: { restaurantId: staff.restaurantId, id: { not: id }, deletedAt: null, status: "ACTIVE", role: { name: "Owner" } } });
      if (otherOwners === 0) {
        throw new ConflictException({ code: "LAST_OWNER", message: "This is the only active Owner. Make another person an Owner before deleting this account." });
      }
    }

    const hasHistory = await this.hasRecordedHistory(id);
    if (!hasHistory) {
      await this.prisma.staffUser.delete({ where: { id } });
      return;
    }

    // They have worked on orders / payments / complaints, so the record is kept for the history's sake but the
    // account is closed: signed out, cannot log in, hidden from every list, email freed for reuse.
    await this.prisma.$transaction([
      this.prisma.staffUserBranch.deleteMany({ where: { staffUserId: id } }),
      this.prisma.staffUserPermission.deleteMany({ where: { staffUserId: id } }),
      this.prisma.staffUser.update({
        where: { id },
        data: { deletedAt: new Date(), status: "INACTIVE", refreshTokenHash: null, email: `deleted.${id}@deleted.invalid` },
      }),
    ]);
  }

  private async hasRecordedHistory(staffUserId: string): Promise<boolean> {
    const checks = await Promise.all([
      this.prisma.order.findFirst({ where: { OR: [{ createdByStaffId: staffUserId }, { updatedByStaffId: staffUserId }, { assignedRiderId: staffUserId }] }, select: { id: true } }),
      this.prisma.orderRevision.findFirst({ where: { staffId: staffUserId }, select: { id: true } }),
      this.prisma.orderBranchTransfer.findFirst({ where: { transferredByStaffId: staffUserId }, select: { id: true } }),
      this.prisma.payment.findFirst({ where: { recordedByStaffId: staffUserId }, select: { id: true } }),
      this.prisma.printEvent.findFirst({ where: { staffId: staffUserId }, select: { id: true } }),
      this.prisma.complaint.findFirst({ where: { assignedToStaffId: staffUserId }, select: { id: true } }),
      this.prisma.complaintMessage.findFirst({ where: { senderStaffId: staffUserId }, select: { id: true } }),
      this.prisma.auditLog.findFirst({ where: { staffUserId }, select: { id: true } }),
    ]);
    return checks.some((row) => row !== null);
  }

  async listRoles() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.role.findMany({ where: { restaurantId }, orderBy: { name: "asc" } });
  }
}
