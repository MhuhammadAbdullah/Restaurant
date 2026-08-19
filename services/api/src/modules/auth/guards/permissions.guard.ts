import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { PermissionsCheckService } from "../permissions-check.service";

/**
 * Must run after StaffJwtAuthGuard (needs req.staff already populated).
 * Owner bypasses every check (Rule 1). Otherwise: per-user override (grant/revoke) wins over
 * the role's default permission set.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsCheck: PermissionsCheckService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const staff: StaffJwtPayload | undefined = request.staff;
    if (!staff) throw new ForbiddenException({ code: "NO_STAFF_CONTEXT", message: "Not authenticated as staff" });

    const allowed = await this.permissionsCheck.hasPermission(staff, required);
    if (!allowed) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: `Missing permission: ${required}` });
    }
    return true;
  }
}
