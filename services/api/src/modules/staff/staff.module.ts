import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { StaffPermissionsService } from "./staff-permissions.service";

@Module({
  imports: [AuthModule],
  controllers: [StaffController],
  providers: [StaffService, StaffPermissionsService],
})
export class StaffModule {}
