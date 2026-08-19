import { Controller, Query, Get, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { Public } from "../auth/decorators/public.decorator";
import { CloudinaryService } from "./cloudinary.service";

@Controller("media")
@UseGuards(StaffJwtAuthGuard)
export class MediaController {
  constructor(private readonly cloudinary: CloudinaryService) {}

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
}
