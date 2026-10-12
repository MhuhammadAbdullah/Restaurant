import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { createBlogPostSchema, updateBlogPostSchema, type CreateBlogPostInput, type UpdateBlogPostInput } from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { Public } from "../auth/decorators/public.decorator";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { BlogService } from "./blog.service";

@Controller("blog")
export class BlogController {
  constructor(
    private readonly blog: BlogService,
    private readonly auditLogs: AuditLogService,
  ) {}

  @Public()
  @Get("posts")
  async list(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const data = await this.blog.listPublic(Number(page) || 1, Number(pageSize) || 9);
    return { success: true, data };
  }

  @Public()
  @Get("slugs")
  async slugs() {
    const data = await this.blog.listSlugs();
    return { success: true, data };
  }

  @Public()
  @Get("posts/:slug")
  async detail(@Param("slug") slug: string) {
    const data = await this.blog.getPublic(slug);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.view")
  @Get("admin/posts")
  async adminList() {
    const data = await this.blog.adminList();
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.view")
  @Get("admin/posts/:id")
  async adminGet(@Param("id") id: string) {
    const data = await this.blog.adminGet(id);
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.create")
  @Post("admin/posts")
  async create(@Body(new ZodValidationPipe(createBlogPostSchema)) body: CreateBlogPostInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.blog.create(body);
    await this.auditLogs.recordForStaff(staff, "blog.create", "BlogPost", data.id, { newValue: { title: data.title, status: data.status } }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.edit")
  @Patch("admin/posts/:id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateBlogPostSchema)) body: UpdateBlogPostInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.blog.update(id, body);
    await this.auditLogs.recordForStaff(staff, "blog.update", "BlogPost", id, { newValue: { title: data.title, status: data.status } }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @UseGuards(StaffJwtAuthGuard, PermissionsGuard)
  @RequirePermission("cms.delete")
  @Delete("admin/posts/:id")
  async remove(@Param("id") id: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    await this.blog.remove(id);
    await this.auditLogs.recordForStaff(staff, "blog.delete", "BlogPost", id, {}, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data: { id } };
  }
}
