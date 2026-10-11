import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@restaurant/auth";

export const PERMISSION_KEY = "requiredPermission";
/**
 * Owner always passes. Everyone else must hold at least ONE of the listed permissions (via role or a per-user grant).
 * List several when more than one job legitimately needs the same data, e.g. a kitchen cook and a cashier both
 * print receipts, so neither should need the unrelated "orders.view" just to do their own work.
 */
export const RequirePermission = (...permissions: PermissionKey[]) => SetMetadata(PERMISSION_KEY, permissions);
