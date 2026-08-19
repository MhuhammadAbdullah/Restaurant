import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CustomerComplaintsController } from "./customer-complaints.controller";
import { StaffComplaintsController } from "./staff-complaints.controller";
import { ComplaintsService } from "./complaints.service";

@Module({
  imports: [AuthModule],
  controllers: [CustomerComplaintsController, StaffComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}
