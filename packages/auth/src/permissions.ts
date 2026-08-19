/**
 * Canonical permission catalog. Permission key format: "module.action".
 * Used to seed the `permissions` table and to type-check `@RequirePermission()` decorators.
 */

const CRUD = ["view", "create", "edit", "delete"] as const;

const MODULES_WITH_STANDARD_CRUD = [
  "branches",
  "tables",
  "categories",
  "products",
  "choiceGroups",
  "addonGroups",
  "deals",
  "coupons",
  "customers",
  "staff",
  "roles",
  "complaints",
  "cms",
] as const;

export const PERMISSION_CATALOG: Array<{
  key: string;
  module: string;
  action: string;
  description: string;
}> = [
  ...MODULES_WITH_STANDARD_CRUD.flatMap((mod) =>
    CRUD.map((action) => ({
      key: `${mod}.${action}`,
      module: mod,
      action,
      description: `${action} ${mod}`,
    })),
  ),

  { key: "orders.view", module: "orders", action: "view", description: "View orders" },
  { key: "orders.create", module: "orders", action: "create", description: "Create orders" },
  { key: "orders.edit", module: "orders", action: "edit", description: "Edit orders" },
  { key: "orders.cancel", module: "orders", action: "cancel", description: "Cancel orders" },
  { key: "orders.refund", module: "orders", action: "refund", description: "Refund orders" },
  { key: "orders.export", module: "orders", action: "export", description: "Export orders" },
  { key: "orders.transfer", module: "orders", action: "transfer", description: "Transfer an order to another branch" },
  { key: "orders.updateDeliveryStatus", module: "orders", action: "updateDeliveryStatus", description: "Update delivery status of an order assigned to you (rider)" },

  { key: "pos.access", module: "pos", action: "access", description: "Access POS terminal" },
  { key: "pos.discount", module: "pos", action: "discount", description: "Apply manual discounts/coupons at POS" },
  { key: "pos.void", module: "pos", action: "void", description: "Void/remove items from an open POS order" },
  { key: "pos.refund", module: "pos", action: "refund", description: "Refund/cancel a POS order" },
  { key: "kitchen.access", module: "kitchen", action: "access", description: "Access kitchen board" },
  { key: "kitchen.updateStatus", module: "kitchen", action: "updateStatus", description: "Update kitchen order status" },

  { key: "loyalty.view", module: "loyalty", action: "view", description: "View loyalty accounts" },
  { key: "loyalty.adjust", module: "loyalty", action: "adjust", description: "Adjust loyalty points" },
  { key: "loyalty.manage", module: "loyalty", action: "manage", description: "Manage loyalty settings" },

  { key: "complaints.assign", module: "complaints", action: "assign", description: "Assign complaints" },
  { key: "complaints.reply", module: "complaints", action: "reply", description: "Reply to complaints" },
  { key: "complaints.resolve", module: "complaints", action: "resolve", description: "Resolve/close complaints" },

  { key: "reports.view", module: "reports", action: "view", description: "View reports" },
  { key: "reports.export", module: "reports", action: "export", description: "Export reports" },

  { key: "settings.view", module: "settings", action: "view", description: "View settings" },
  { key: "settings.manage", module: "settings", action: "manage", description: "Manage restaurant/branch settings" },

  { key: "permissions.manage", module: "permissions", action: "manage", description: "Manage roles & permission assignments" },

  { key: "auditLogs.view", module: "auditLogs", action: "view", description: "View audit logs" },

  { key: "customers.export", module: "customers", action: "export", description: "Export customer data" },
  { key: "customers.block", module: "customers", action: "block", description: "Block/unblock a customer by phone number" },

  { key: "riders.view", module: "riders", action: "view", description: "View riders and their delivery stats" },
  { key: "riders.assign", module: "riders", action: "assign", description: "Assign a rider to an order" },
];

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

// No role → permission default mapping exists here by design. Roles (Owner, Admin, Manager,
// Cashier, Restaurant Staff, Kitchen Staff, Rider) are pure labels — every permission for every
// staff member is an explicit, individually-made grant (StaffUserPermission), never implied by
// role. See PermissionsCheckService.hasPermission and StaffPermissionsService.
