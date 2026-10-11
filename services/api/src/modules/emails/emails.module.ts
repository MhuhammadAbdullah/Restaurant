import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailsController } from "./emails.controller";
import { EmailsService } from "./emails.service";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [EmailsController],
  providers: [EmailsService],
  exports: [EmailsService],
})
export class EmailsModule {}
