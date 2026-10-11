import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PERMISSION_CATALOG } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Keeps the permissions table in step with the catalog in code, so a permission added in a new version exists in the
 * database (and shows up in Staff & Access) without a separate seed step. Also carries out one-time moves of existing
 * access when a permission is split off from an older one.
 */
@Injectable()
export class PermissionSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const existing = new Set((await this.prisma.permission.findMany({ select: { key: true } })).map((p) => p.key));
      const missing = PERMISSION_CATALOG.filter((p) => !existing.has(p.key));
      for (const p of missing) {
        await this.prisma.permission.create({ data: { key: p.key, module: p.module, action: p.action, description: p.description } });
      }
      if (missing.length > 0) this.logger.log(`Added ${missing.length} new permission(s): ${missing.map((m) => m.key).join(", ")}`);
      await this.copySettingsAccessToSeo();
    } catch (e) {
      this.logger.error(`Permission sync failed: ${e instanceof Error ? e.message : e}`);
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
