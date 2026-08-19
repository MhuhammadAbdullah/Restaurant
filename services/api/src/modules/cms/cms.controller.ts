import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  createBannerSchema,
  updateBannerSchema,
  updateRestaurantSettingsSchema,
  type CreateBannerInput,
  type StaticPageSlug,
  type UpdateBannerInput,
  type UpdateRestaurantSettingsInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { Public } from "../auth/decorators/public.decorator";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CmsService } from "./cms.service";

@Controller("cms")
export class CmsController {
  constructor(
    private readonly cms: CmsService,
    private readonly auditLogs: AuditLogService,
  ) {}

  @Public()
  @Get("sections")
  async sections() {
    const data = await this.cms.listSections();
    return { success: true, data };
  }

  @Public()
  @Get("banners")
  async banners() {
    const data = await this.cms.listBanners();
    return { success: true, data };
  }

  @Public()
  @Get("restaurant")
  async restaurant() {
    const data = await this.cms.getRestaurantInfo();
    return { success: true, data };
  }

  @Public()
  @Get("pages/:slug")
  async page(@Param("slug") slug: string) {
    const data = await this.cms.getStaticPage(slug as StaticPageSlug);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("settings.manage")
  @Patch("restaurant")
  async updateRestaurant(
    @Body(new ZodValidationPipe(updateRestaurantSettingsSchema)) body: UpdateRestaurantSettingsInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const data = await this.cms.updateRestaurantSettings(body);
    await this.auditLogs.recordForStaff(
      staff,
      "restaurant.update",
      "Restaurant",
      data.id,
      { newValue: body },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.view")
  @Get("admin/banners")
  async adminBanners() {
    const data = await this.cms.adminListBanners();
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.create")
  @Post("admin/banners")
  async createBanner(
    @Body(new ZodValidationPipe(createBannerSchema)) body: CreateBannerInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const data = await this.cms.createBanner(body);
    await this.auditLogs.recordForStaff(
      staff,
      "banner.create",
      "Banner",
      data.id,
      { newValue: body },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.edit")
  @Patch("admin/banners/:id")
  async updateBanner(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBannerSchema)) body: UpdateBannerInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const data = await this.cms.updateBanner(id, body);
    await this.auditLogs.recordForStaff(
      staff,
      "banner.update",
      "Banner",
      id,
      { newValue: body },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.delete")
  @Delete("admin/banners/:id")
  async deleteBanner(@Param("id") id: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    await this.cms.deleteBanner(id);
    await this.auditLogs.recordForStaff(staff, "banner.delete", "Banner", id, {}, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data: { id } };
  }
}
