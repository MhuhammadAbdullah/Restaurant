import { Injectable } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * No role ever implies a permission (roles are pure labels/identity). The only source of truth
 * is an explicit per-user StaffUserPermission(granted:true) grant — its absence IS the deny
 * state, so there's no fallback to consult. Exposed as a plain method (not just a guard) so
 * services can do a fine-grained in-handler check (e.g. "REFUNDED transitions specifically need
 * orders.refund") on top of whatever coarse permission already gates the endpoint.
 */
@Injectable()
export class PermissionsCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async hasPermission(staff: StaffJwtPayload, key: string): Promise<boolean> {
    if (staff.isOwner) return true;

    const grant = await this.prisma.staffUserPermission.findFirst({
      where: { staffUserId: staff.sub, permission: { key }, granted: true },
      select: { staffUserId: true },
    });
    return Boolean(grant);
  }
}
