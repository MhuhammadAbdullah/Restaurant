import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CmsController } from "./cms.controller";
import { CmsService } from "./cms.service";

@Module({
  imports: [AuthModule],
  controllers: [CmsController],
  providers: [CmsService],
})
export class CmsModule {}
