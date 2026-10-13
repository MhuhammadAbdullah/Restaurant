import { IS_SERVERLESS } from "../../common/serverless";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PERMISSION_CATALOG } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";

/** The permission each Inventory page has for each action (a page without one for an action does not offer it). */
const INVENTORY_PAGES: { view?: string; create?: string; edit?: string; delete?: string }[] = [
  { view: "inventoryStock.view", create: "inventoryStock.create", edit: "inventoryStock.edit", delete: "inventoryStock.delete" },
  { view: "inventoryPurchases.view", create: "inventoryPurchases.create", edit: "inventoryPurchases.edit", delete: "inventoryPurchases.delete" },
  { view: "inventorySuppliers.view", create: "inventorySuppliers.create", edit: "inventorySuppliers.edit", delete: "inventorySuppliers.delete" },
  { view: "inventoryTransfers.view", create: "inventoryTransfers.create", delete: "inventoryTransfers.delete" },
  { view: "inventoryHistory.view" },
  { view: "inventoryRecipes.view", create: "inventoryRecipes.create", edit: "inventoryRecipes.edit", delete: "inventoryRecipes.delete" },
  { view: "inventoryReports.view" },
];

/**
 * Keeps the permissions table in step with the catalog in code, so a permission added in a new version exists in the
 * database (and shows up in Staff & Access) without a separate seed step. Also carries out one-time moves of existing
 * access when a permission is split off from an older one.
 */
@Injectable()
export class PermissionSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Skipped on Vercel (it would run on every cold start); the cron job calls sync() instead. */
  async onModuleInit() {
    if (IS_SERVERLESS) return;
    await this.sync();
  }

  async sync() {
    try {
      const existing = new Set((await this.prisma.permission.findMany({ select: { key: true } })).map((p) => p.key));
      const missing = PERMISSION_CATALOG.filter((p) => !existing.has(p.key));
      for (const p of missing) {
        await this.prisma.permission.create({ data: { key: p.key, module: p.module, action: p.action, description: p.description } });
      }
      if (missing.length > 0) this.logger.log(`Added ${missing.length} new permission(s): ${missing.map((m) => m.key).join(", ")}`);
      await this.copySettingsAccessToSeo();
      await this.copyProductAccessToInventory();
      await this.splitInventoryAccess();
    } catch (e) {
      this.logger.error(`Permission sync failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Inventory is new: once, give everyone who manages products the matching inventory access so the module is usable straight away. */
  private async copyProductAccessToInventory() {
    const restaurants = await this.prisma.restaurant.findMany({ select: { id: true, settings: true } });
    for (const r of restaurants) {
      const settings = (r.settings as Record<string, unknown> | null) ?? {};
      const done = (settings.permissionMigrations as Record<string, boolean> | undefined) ?? {};
      if (done.inventoryFromProducts) continue;
      const pairs: [string, string][] = [
        ...INVENTORY_PAGES.flatMap((p) => (p.view ? [["products.view", p.view] as [string, string]] : [])),
        ...INVENTORY_PAGES.flatMap((p) => (p.create ? [["products.edit", p.create] as [string, string]] : [])),
        ...INVENTORY_PAGES.flatMap((p) => (p.edit ? [["products.edit", p.edit] as [string, string]] : [])),
        ...INVENTORY_PAGES.flatMap((p) => (p.delete ? [["products.delete", p.delete] as [string, string]] : [])),
      ];
      let copied = 0;
      for (const [oldKey, newKey] of pairs) {
        const [oldPerm, newPerm] = await Promise.all([this.prisma.permission.findUnique({ where: { key: oldKey } }), this.prisma.permission.findUnique({ where: { key: newKey } })]);
        if (!oldPerm || !newPerm) continue;
        const rows = await this.prisma.staffUserPermission.findMany({ where: { permissionId: oldPerm.id, granted: true, staffUser: { restaurantId: r.id } } });
        for (const row of rows) {
          await this.prisma.staffUserPermission.upsert({
            where: { staffUserId_permissionId: { staffUserId: row.staffUserId, permissionId: newPerm.id } },
            create: { staffUserId: row.staffUserId, permissionId: newPerm.id, granted: true },
            update: {},
          });
          copied++;
        }
      }
      // Re-read: the settings may have changed while we worked.
      const fresh = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: r.id }, select: { settings: true } });
      const freshSettings = (fresh.settings as Record<string, unknown> | null) ?? {};
      const freshDone = (freshSettings.permissionMigrations as Record<string, boolean> | undefined) ?? {};
      await this.prisma.restaurant.update({ where: { id: r.id }, data: { settings: { ...freshSettings, permissionMigrations: { ...freshDone, inventoryFromProducts: true } } as never } });
      if (copied > 0) this.logger.log(`Gave ${copied} existing Products grant(s) the matching Inventory access`);
    }
  }

  /** Inventory used to have one set of permissions for all its pages. Once, give everyone who had them the same access on every page, so nobody loses a page. */
  private async splitInventoryAccess() {
    const restaurants = await this.prisma.restaurant.findMany({ select: { id: true, settings: true } });
    for (const r of restaurants) {
      const settings = (r.settings as Record<string, unknown> | null) ?? {};
      const done = (settings.permissionMigrations as Record<string, boolean> | undefined) ?? {};
      if (done.inventorySplit) continue;
      const pairs: [string, string][] = [];
      for (const action of ["view", "create", "edit", "delete"] as const) {
        for (const page of INVENTORY_PAGES) if (page[action]) pairs.push(["inventory." + action, page[action] as string]);
      }
      let copied = 0;
      for (const [oldKey, newKey] of pairs) {
        const [oldPerm, newPerm] = await Promise.all([this.prisma.permission.findUnique({ where: { key: oldKey } }), this.prisma.permission.findUnique({ where: { key: newKey } })]);
        if (!oldPerm || !newPerm) continue;
        const rows = await this.prisma.staffUserPermission.findMany({ where: { permissionId: oldPerm.id, granted: true, staffUser: { restaurantId: r.id } } });
        for (const row of rows) {
          await this.prisma.staffUserPermission.upsert({
            where: { staffUserId_permissionId: { staffUserId: row.staffUserId, permissionId: newPerm.id } },
            create: { staffUserId: row.staffUserId, permissionId: newPerm.id, granted: true },
            update: {},
          });
          copied++;
        }
      }
      const fresh = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: r.id }, select: { settings: true } });
      const freshSettings = (fresh.settings as Record<string, unknown> | null) ?? {};
      const freshDone = (freshSettings.permissionMigrations as Record<string, boolean> | undefined) ?? {};
      await this.prisma.restaurant.update({ where: { id: r.id }, data: { settings: { ...freshSettings, permissionMigrations: { ...freshDone, inventorySplit: true } } as never } });
      if (copied > 0) this.logger.log(`Gave ${copied} existing Inventory grant(s) the matching access on each Inventory page`);
    }
  }

  /** SEO & Marketing used to be covered by the Settings permissions. Once, give everyone who had those the matching SEO access so nobody loses a page. */
  private async copySettingsAccessToSeo() {
    const restaurants = await this.prisma.restaurant.findMany({ select: { id: true, settings: true } });
    for (const r of restaurants) {
      const settings = (r.settings as Record<string, unknown> | null) ?? {};
      const done = (settings.permissionMigrations as Record<string, boolean> | undefined) ?? {};
      if (done.seoFromSettings) continue;
      const pairs: [string, string][] = [["settings.view", "seo.view"], ["settings.manage", "seo.manage"]];
      let copied = 0;
      for (const [oldKey, newKey] of pairs) {
        const [oldPerm, newPerm] = await Promise.all([this.prisma.permission.findUnique({ where: { key: oldKey } }), this.prisma.permission.findUnique({ where: { key: newKey } })]);
        if (!oldPerm || !newPerm) continue;
        const rows = await this.prisma.staffUserPermission.findMany({ where: { permissionId: oldPerm.id, granted: true, staffUser: { restaurantId: r.id } } });
        for (const row of rows) {
          await this.prisma.staffUserPermission.upsert({
            where: { staffUserId_permissionId: { staffUserId: row.staffUserId, permissionId: newPerm.id } },
            create: { staffUserId: row.staffUserId, permissionId: newPerm.id, granted: true },
            update: {},
          });
          copied++;
        }
      }
      await this.prisma.restaurant.update({ where: { id: r.id }, data: { settings: { ...settings, permissionMigrations: { ...done, seoFromSettings: true } } as never } });
      if (copied > 0) this.logger.log(`Gave ${copied} existing Settings grant(s) the matching SEO access`);
    }
  }
}
