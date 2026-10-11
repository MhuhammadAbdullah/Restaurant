import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { hashPassword, verifyPassword } from "@restaurant/auth";
import type { StaffLoginInput } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TokensService } from "./tokens.service";

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  async login(input: StaffLoginInput) {
    const staff = await this.prisma.staffUser.findFirst({
      where: { email: input.email, status: "ACTIVE" },
      include: { role: true, branchAssignments: true },
    });
    if (!staff) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });

    const valid = await verifyPassword(input.password, staff.passwordHash);
    if (!valid) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });

    const pair = await this.tokens.issueStaffTokens({
      sub: staff.id,
      restaurantId: staff.restaurantId,
      roleId: staff.roleId,
      branchIds: staff.branchAssignments.map((a) => a.branchId),
      isOwner: staff.role.name === "Owner",
      allBranchesAccess: staff.allBranchesAccess,
    });

    await this.prisma.staffUser.update({
      where: { id: staff.id },
      data: { refreshTokenHash: pair.refreshTokenHash, lastLoginAt: new Date() },
    });

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role.name },
    };
  }

  async refresh(refreshToken: string) {
    let payload;
    try {
      payload = await this.tokens.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException({ code: "INVALID_REFRESH_TOKEN", message: "Session expired, please log in again" });
    }
    if (payload.aud !== "staff") {
      throw new UnauthorizedException({ code: "WRONG_AUDIENCE", message: "Invalid refresh token" });
    }

    const staff = await this.prisma.staffUser.findUnique({
      where: { id: payload.sub },
      include: { role: true, branchAssignments: true },
    });
    const incomingHash = this.tokens.hashToken(refreshToken);
    if (!staff || staff.refreshTokenHash !== incomingHash) {
      throw new UnauthorizedException({ code: "REFRESH_TOKEN_REVOKED", message: "Session no longer valid" });
    }

    const pair = await this.tokens.issueStaffTokens({
      sub: staff.id,
      restaurantId: staff.restaurantId,
      roleId: staff.roleId,
      branchIds: staff.branchAssignments.map((a) => a.branchId),
      isOwner: staff.role.name === "Owner",
      allBranchesAccess: staff.allBranchesAccess,
    });
    await this.prisma.staffUser.update({ where: { id: staff.id }, data: { refreshTokenHash: pair.refreshTokenHash } });

    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  }

  async logout(staffId: string) {
    await this.prisma.staffUser.update({ where: { id: staffId }, data: { refreshTokenHash: null } });
  }

  async me(staffId: string) {
    const staff = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: staffId },
      include: {
        role: true,
        branchAssignments: { include: { branch: true } },
        // Role never implies a permission — only an explicit per-user grant does.
        permissionOverrides: { where: { granted: true }, include: { permission: true } },
      },
    });

    const isOwner = staff.role.name === "Owner";
    const grantedPermissionKeys = staff.permissionOverrides.map((o) => o.permission.key);

    // Owner is unrestricted across all branches by definition (CLAUDE.md Rule 1/4) — every
    // backend authorization check already exempts isOwner from the branchIds scope entirely, so
    // the branch *list* shown here must not depend on an explicit UserBranch row either. Reading
    // from branchAssignments (like every other role correctly does) meant a branch created after
    // the Owner's own assignments were last touched simply never appeared in their branch picker
    // — they could switch between old branches but had no way to even select a newer one.
    // A non-Owner staff member with an explicit allBranchesAccess grant gets the same live lookup.
    const showsAllBranches = isOwner || staff.allBranchesAccess;
    const branches = showsAllBranches
      ? await this.prisma.branch.findMany({ where: { restaurantId: staff.restaurantId }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } })
      : staff.branchAssignments.map((a) => ({ id: a.branch.id, name: a.branch.name, code: a.branch.code }));

    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role.name,
      isOwner,
      allBranchesAccess: staff.allBranchesAccess,
      permissions: isOwner ? ["*"] : grantedPermissionKeys,
      branches,
    };
  }

  // ---------- the signed-in person's own profile ----------

  async getProfile(staffId: string) {
    const s = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: staffId }, include: { role: { select: { name: true } } } });
    return { id: s.id, name: s.name, email: s.email, phone: s.phone, role: s.role.name, lastLoginAt: s.lastLoginAt, createdAt: s.createdAt };
  }

  /** Name and phone only. The email is the login id and the role/permissions are managed by an admin in Staff & Access. */
  async updateProfile(staffId: string, input: { name: string; phone: string | null }) {
    const s = await this.prisma.staffUser.update({
      where: { id: staffId },
      data: { name: input.name.trim(), phone: input.phone?.trim() ? input.phone.trim() : null },
      include: { role: { select: { name: true } } },
    });
    return { id: s.id, name: s.name, email: s.email, phone: s.phone, role: s.role.name, lastLoginAt: s.lastLoginAt, createdAt: s.createdAt };
  }

  /**
   * Changing your own password needs the current one. Every other signed-in device is signed out (their refresh
   * token stops working), and this session gets a fresh pair so the person is not kicked out themselves.
   */
  async changePassword(staffId: string, input: { currentPassword: string; newPassword: string }) {
    const staff = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: staffId }, include: { role: true, branchAssignments: true } });
    const valid = await verifyPassword(input.currentPassword, staff.passwordHash);
    if (!valid) throw new BadRequestException({ code: "CURRENT_PASSWORD_WRONG", message: "Your current password is not correct" });
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException({ code: "PASSWORD_UNCHANGED", message: "Your new password must be different from the current one" });
    }
    const pair = await this.tokens.issueStaffTokens({
      sub: staff.id,
      restaurantId: staff.restaurantId,
      roleId: staff.roleId,
      branchIds: staff.branchAssignments.map((a) => a.branchId),
      isOwner: staff.role.name === "Owner",
      allBranchesAccess: staff.allBranchesAccess,
    });
    await this.prisma.staffUser.update({ where: { id: staff.id }, data: { passwordHash: await hashPassword(input.newPassword), refreshTokenHash: pair.refreshTokenHash } });
    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  }

  /** Used by seeding/admin-invite flows — kept here so password policy lives in one place. */
  async hashNewPassword(plain: string) {
    return hashPassword(plain);
  }
}
