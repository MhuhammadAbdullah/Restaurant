import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BranchesModule } from "../branches/branches.module";
import { DealsModule } from "../deals/deals.module";
import { PaymentsModule } from "../payments/payments.module";
import { CouponsModule } from "../coupons/coupons.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersController } from "./orders.controller";
import { StaffOrdersController } from "./staff-orders.controller";
import { PosOrdersController } from "./pos-orders.controller";
import { OrdersService } from "./orders.service";
import { ProductPricingService } from "./product-pricing.service";

@Module({
  imports: [AuthModule, BranchesModule, DealsModule, forwardRef(() => PaymentsModule), CouponsModule, NotificationsModule],
  controllers: [OrdersController, StaffOrdersController, PosOrdersController],
  providers: [OrdersService, ProductPricingService],
  exports: [OrdersService, ProductPricingService],
})
export class OrdersModule {}
