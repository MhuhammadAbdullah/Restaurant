import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { PERMISSION_CATALOG } from "@restaurant/auth";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";

// Denying yourself these two keys would strip your own ability to ever undo it again (no other
// Owner/Admin required to intervene, unlike every other permission). Owner is unaffected either
// way since isOwner already bypasses every check — this only protects non-Owner Admins.
const SELF_LOCKOUT_PROTECTED_KEYS = new Set(["staff.edit", "permissions.manage"]);

@Injectable()
export class StaffPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Static catalog grouped by module, for the accordion UI. Reused directly from
   *  @restaurant/auth — no DB read, and guarantees the UI can never drift from what
   *  PermissionsGuard/@RequirePermission actually check against. */
  listCatalogGroupedByModule() {
    const byModule = new Map<string, typeof PERMISSION_CATALOG>();
    for (const p of PERMISSION_CATALOG) {
      if (!byModule.has(p.module)) byModule.set(p.module, []);
      byModule.get(p.module)!.push(p);
    }
    return [...byModule.entries()].map(([module, permissions]) => ({ module, permissions }));
  }

  /** Every catalog key, annotated with whether this specific user has an explicit grant for it.
   *  No role fallback — absence of a grant row IS the deny state. */
  async getEffectivePermissions(staffUserId: string) {
    const staff = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: staffUserId },
      include: { permissionOverrides: { where: { granted: true }, include: { permission: true } } },
    });
    const grantedKeys = new Set(staff.permissionOverrides.map((o) => o.permission.key));

    return PERMISSION_CATALOG.map((p) => ({ ...p, granted: grantedKeys.has(p.key) }));
  }

  /** Upserts/deletes StaffUserPermission rows for the given keys. granted=true upserts an
   *  explicit grant; granted=false or null both remove it (deny is "no row", not a stored state,
   *  so there's no distinction between the two once a role can no longer supply a default to
   *  override) — this is the one operation the individual toggle, the per-category Enable
   *  All/Disable All, and the page-level Save button all funnel through. */
  async setOverrides(staffUserId: string, overrides: { key: string; granted: boolean | null }[], requestingStaff: StaffJwtPayload) {
    if (requestingStaff.sub === staffUserId) {
      const strippingOwnAccessManagement = overrides.some((o) => SELF_LOCKOUT_PROTECTED_KEYS.has(o.key) && o.granted !== true);
      if (strippingOwnAccessManagement) {
        throw new ConflictException({
          code: "SELF_LOCKOUT_BLOCKED",
          message: "You cannot deny yourself Staff Edit or Access Management permissions.",
        });
      }
    }

    const permissions = await this.prisma.permission.findMany({ where: { key: { in: overrides.map((o) => o.key) } } });
    const permByKey = new Map(permissions.map((p) => [p.key, p]));

    await this.prisma.$transaction(
      overrides.map((o) => {
        const permission = permByKey.get(o.key);
        if (!permission) throw new BadRequestException({ code: "UNKNOWN_PERMISSION_KEY", message: `Unknown permission key: ${o.key}` });
        if (o.granted !== true) {
          return this.prisma.staffUserPermission.deleteMany({ where: { staffUserId, permissionId: permission.id } });
        }
        return this.prisma.staffUserPermission.upsert({
          where: { staffUserId_permissionId: { staffUserId, permissionId: permission.id } },
          create: { staffUserId, permissionId: permission.id, granted: true },
          update: { granted: true },
        });
      }),
    );

    return this.getEffectivePermissions(staffUserId);
  }
}
