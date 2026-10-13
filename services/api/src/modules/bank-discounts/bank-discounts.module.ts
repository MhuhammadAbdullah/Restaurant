import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BankDiscountsController } from "./bank-discounts.controller";
import { BankDiscountsService } from "./bank-discounts.service";

@Module({
  imports: [AuthModule],
  controllers: [BankDiscountsController],
  providers: [BankDiscountsService],
})
export class BankDiscountsModule {}
