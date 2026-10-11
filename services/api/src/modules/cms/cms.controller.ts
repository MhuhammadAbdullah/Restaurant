import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  createBannerSchema,
  createPopupSchema,
  updatePopupSchema,
  type CreatePopupInput,
  type UpdatePopupInput,
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
import { PermissionsCheckService } from "../auth/permissions-check.service";
import { CmsService } from "./cms.service";

@Controller("cms")
export class CmsController {
  constructor(
    private readonly cms: CmsService,
    private readonly auditLogs: AuditLogService,
    private readonly permissionsCheck: PermissionsCheckService,
  ) {}

  @Public()
  @Get("sections")
  async sections() {
    const data = await this.cms.listSections();
    return { success: true, data };
  }

  @Public()
  @Get("banners")
  async banners(@Query("page") page?: string) {
    const data = await this.cms.listBanners(page || "HOME");
    return { success: true, data };
  }

  @Public()
  @Get("popups")
  async popups(@Query("page") page?: string) {
    const data = await this.cms.listPopups(page || "HOME");
    return { success: true, data };
  }

  @Public()
  @Post("popups/:id/view")
  async popupView(@Param("id") id: string) {
    await this.cms.trackPopup(id, "view");
    return { success: true };
  }

  @Public()
  @Post("popups/:id/click")
  async popupClick(@Param("id") id: string) {
    await this.cms.trackPopup(id, "click");
    return { success: true };
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
  @RequirePermission("settings.manage", "seo.manage")
  @Patch("restaurant")
  async updateRestaurant(
    @Body(new ZodValidationPipe(updateRestaurantSettingsSchema)) body: UpdateRestaurantSettingsInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    // Someone who may only manage SEO can change nothing but the SEO block.
    if (Object.keys(body).some((k) => k !== "seo") && !(await this.permissionsCheck.hasPermission(staff, "settings.manage"))) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Missing permission: settings.manage" });
    }
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

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.view")
  @Get("admin/popups")
  async adminPopups() {
    const data = await this.cms.adminListPopups();
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.create")
  @Post("admin/popups")
  async createPopup(
    @Body(new ZodValidationPipe(createPopupSchema)) body: CreatePopupInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const data = await this.cms.createPopup(body);
    await this.auditLogs.recordForStaff(staff, "popup.create", "MarketingPopup", data.id, { newValue: body }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.edit")
  @Patch("admin/popups/:id")
  async updatePopup(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePopupSchema)) body: UpdatePopupInput,
    @CurrentStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const data = await this.cms.updatePopup(id, body);
    await this.auditLogs.recordForStaff(staff, "popup.update", "MarketingPopup", id, { newValue: body }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.delete")
  @Delete("admin/popups/:id")
  async deletePopup(@Param("id") id: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    await this.cms.deletePopup(id);
    await this.auditLogs.recordForStaff(staff, "popup.delete", "MarketingPopup", id, {}, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data: { id } };
  }
}
