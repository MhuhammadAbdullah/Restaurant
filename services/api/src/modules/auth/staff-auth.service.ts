import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { hashPassword, verifyPassword } from "@restaurant/auth";
import type { StaffLoginInput } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TokensService } from "./tokens.service";

// A person can be signed in on this many devices at once; the oldest one is dropped beyond that.
const MAX_SESSIONS_PER_STAFF = 25;
// A refresh token that has not been used for this long no longer works (sessions in daily use never reach it).
const SESSION_IDLE_DAYS = 120;
// A refresh token is swapped for a new one once it is this old, so a session in daily use keeps sliding forward.
const ROTATE_AFTER_MS = 12 * 60 * 60 * 1000;
// Older tokens of the same session stay valid, so two tabs refreshing at the same moment never sign each other out.
const KEPT_TOKEN_HASHES = 5;

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

    await this.prisma.staffUser.update({ where: { id: staff.id }, data: { lastLoginAt: new Date() } });
    await this.startSession(staff.id, pair.refreshTokenHash);

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role.name },
    };
  }

  /** Records a new signed-in device and tidies up old or surplus ones. */
  private async startSession(staffId: string, tokenHash: string) {
    await this.prisma.staffSession.create({ data: { staffUserId: staffId, tokenHashes: [tokenHash] } });
    await this.prisma.staffSession.deleteMany({ where: { staffUserId: staffId, lastUsedAt: { lt: new Date(Date.now() - SESSION_IDLE_DAYS * 86_400_000) } } });
    const all = await this.prisma.staffSession.findMany({ where: { staffUserId: staffId }, orderBy: { lastUsedAt: "desc" }, select: { id: true } });
    if (all.length > MAX_SESSIONS_PER_STAFF) {
      await this.prisma.staffSession.deleteMany({ where: { id: { in: all.slice(MAX_SESSIONS_PER_STAFF).map((x) => x.id) } } });
    }
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
    // A deactivated or deleted account cannot keep a session alive.
    if (!staff || staff.status !== "ACTIVE" || staff.deletedAt) {
      throw new UnauthorizedException({ code: "REFRESH_TOKEN_REVOKED", message: "Session no longer valid" });
    }

    const incomingHash = this.tokens.hashToken(refreshToken);
    let session = await this.prisma.staffSession.findFirst({ where: { staffUserId: staff.id, tokenHashes: { has: incomingHash } } });
    if (!session && staff.refreshTokenHash === incomingHash) {
      // a login from before sessions existed: carry it over instead of signing the person out
      session = await this.prisma.staffSession.create({ data: { staffUserId: staff.id, tokenHashes: [incomingHash] } });
    }
    if (!session) {
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

    // The refresh token is only replaced now and then; in between the same one keeps working.
    const issuedAtMs = ((payload as { iat?: number }).iat ?? 0) * 1000;
    const rotate = Date.now() - issuedAtMs > ROTATE_AFTER_MS;
    await this.prisma.staffSession.update({
      where: { id: session.id },
      data: {
        lastUsedAt: new Date(),
        ...(rotate ? { tokenHashes: [...session.tokenHashes, pair.refreshTokenHash].slice(-KEPT_TOKEN_HASHES) } : {}),
      },
    });

    return { accessToken: pair.accessToken, refreshToken: rotate ? pair.refreshToken : refreshToken };
  }

  /** Signs out one device (when its refresh token is given) or, without it, every device of this person. */
  async logout(staffId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.staffSession.deleteMany({ where: { staffUserId: staffId, tokenHashes: { has: this.tokens.hashToken(refreshToken) } } });
      return;
    }
    await this.prisma.staffSession.deleteMany({ where: { staffUserId: staffId } });
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
    await this.prisma.staffUser.update({ where: { id: staff.id }, data: { passwordHash: await hashPassword(input.newPassword), refreshTokenHash: null } });
    await this.prisma.staffSession.deleteMany({ where: { staffUserId: staff.id } });
    await this.startSession(staff.id, pair.refreshTokenHash);
    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  }

  /** Used by seeding/admin-invite flows — kept here so password policy lives in one place. */
  async hashNewPassword(plain: string) {
    return hashPassword(plain);
  }
}
