import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LoyaltyService } from "./loyalty.service";
import { LoyaltyController } from "./loyalty.controller";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
