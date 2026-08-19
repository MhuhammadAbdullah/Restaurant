import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@restaurant/auth";

export const PERMISSION_KEY = "requiredPermission";
/** Owner always passes. Everyone else must hold this permission via role or a per-user grant override. */
export const RequirePermission = (permission: PermissionKey) => SetMetadata(PERMISSION_KEY, permission);
