import { Module } from "@nestjs/common";
import { CloudinaryService } from "./cloudinary.service";
import { MediaController } from "./media.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class MediaModule {}
