import { Module } from "@nestjs/common";
import { CloudinaryService } from "./cloudinary.service";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [CloudinaryService, MediaService],
  exports: [CloudinaryService, MediaService],
})
export class MediaModule {}
