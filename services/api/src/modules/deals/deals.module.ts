import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DealsController } from "./deals.controller";
import { DealsService } from "./deals.service";
import { DealPricingService } from "./deal-pricing.service";

@Module({
  imports: [AuthModule],
  controllers: [DealsController],
  providers: [DealsService, DealPricingService],
  exports: [DealPricingService],
})
export class DealsModule {}
