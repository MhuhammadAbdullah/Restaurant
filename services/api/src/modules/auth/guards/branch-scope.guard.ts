import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";

/**
 * Blocks access to a specific branch's data unless the staff member is the Owner or is
 * explicitly assigned to that branch (StaffUserBranch). Looks for the branch id in route params,
 * query string, then body, in that order — apply on any route that touches one branch's data.
 * IDOR-proofing: a manipulated branchId in the URL/body is checked against the token's real
 * assignment list server-side, never trusted from the client.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const staff: StaffJwtPayload | undefined = request.staff;
    if (!staff) throw new ForbiddenException({ code: "NO_STAFF_CONTEXT", message: "Not authenticated as staff" });
    if (staff.isOwner || staff.allBranchesAccess) return true;

    const branchId: string | undefined =
      request.params?.branchId ?? request.query?.branchId ?? request.body?.branchId;

    if (!branchId) return true; // route isn't branch-scoped by id — nothing to check here

    if (!staff.branchIds.includes(branchId)) {
      throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this branch" });
    }
    return true;
  }
}
