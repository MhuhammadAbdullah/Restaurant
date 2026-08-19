import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StaffNotificationsController } from "./staff-notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";

@Module({
  imports: [AuthModule],
  controllers: [StaffNotificationsController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
