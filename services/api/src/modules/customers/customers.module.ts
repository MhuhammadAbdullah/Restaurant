import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CustomersController } from "./customers.controller";
import { StaffCustomersController } from "./staff-customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [CustomersController, StaffCustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
