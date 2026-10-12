import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { CloudinaryService } from "./cloudinary.service";
import { MediaService } from "./media.service";

const registerSchema = z.object({
  url: z.string().url().max(600),
  publicId: z.string().min(1).max(300),
  filename: z.string().min(1).max(300),
  folder: z.string().max(60).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  bytes: z.number().int().nonnegative().optional(),
  format: z.string().max(20).optional(),
});
type RegisterBody = z.infer<typeof registerSchema>;

const updateSchema = z.object({
  filename: z.string().trim().min(1, "Give the image a name").max(200).optional(),
  altText: z.string().trim().max(300).optional(),
});
type UpdateBody = z.infer<typeof updateSchema>;

const bulkDeleteSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100), force: z.boolean().default(false) });
type BulkDeleteBody = z.infer<typeof bulkDeleteSchema>;

@Controller("media")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class MediaController {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly media: MediaService,
  ) {}

  @Get("cloudinary-signature")
  getSignature(@Query("folder") folder = "restaurant") {
    const data = this.cloudinary.getUploadSignature(folder);
    return { success: true, data };
  }

  // Public + folder is hardcoded (never client-supplied) so a guest can attach a photo to a
  // complaint without staff auth, while still only ever being able to sign into "complaints".
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get("complaint-upload-signature")
  getComplaintSignature() {
    const data = this.cloudinary.getUploadSignature("complaints");
    return { success: true, data };
  }

  // The library is open to every signed-in staff member: anyone who can edit a product or a category needs it to
  // choose an image there. Deleting, syncing and the usage report need website-content permissions.
  @Get("assets")
  async list(@Query("search") search?: string, @Query("folder") folder?: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    const data = await this.media.list({ search, folder, cursor, limit: limit ? Number(limit) : undefined });
    return { success: true, data };
  }

  @Post("assets")
  async register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterBody, @Req() req: { staff?: { sub?: string } }) {
    const data = await this.media.register(body, req.staff?.sub);
    return { success: true, data };
  }

  @RequirePermission("cms.create")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("assets/sync")
  async sync() {
    const data = await this.media.syncFromCloudinary();
    return { success: true, data };
  }

  @RequirePermission("cms.edit")
  @Patch("assets/:id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateSchema)) body: UpdateBody) {
    const data = await this.media.update(id, body);
    return { success: true, data };
  }

  @RequirePermission("cms.view")
  @Get("assets/:id/usage")
  async usage(@Param("id") id: string) {
    const data = await this.media.usage(id);
    return { success: true, data };
  }

  @RequirePermission("cms.delete")
  @Post("assets/bulk-delete")
  async bulkDelete(@Body(new ZodValidationPipe(bulkDeleteSchema)) body: BulkDeleteBody) {
    const data = await this.media.removeMany(body.ids, body.force);
    return { success: true, data };
  }

  @RequirePermission("cms.delete")
  @Delete("assets/:id")
  async remove(@Param("id") id: string, @Query("force") force?: string) {
    const data = await this.media.remove(id, force === "true");
    return { success: true, data };
  }
}
