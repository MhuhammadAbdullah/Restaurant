import { Injectable, UnauthorizedException } from "@nestjs/common";
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

  /** Used by seeding/admin-invite flows — kept here so password policy lives in one place. */
  async hashNewPassword(plain: string) {
    return hashPassword(plain);
  }
}
