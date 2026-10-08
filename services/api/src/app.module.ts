import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./common/prisma/prisma.module";
import { EmailModule } from "./common/email/email.module";
import { LoyaltyModule } from "./modules/loyalty/loyalty.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { MediaModule } from "./modules/media/media.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { DealsModule } from "./modules/deals/deals.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { BranchesModule } from "./modules/branches/branches.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { CouponsModule } from "./modules/coupons/coupons.module";
import { CmsModule } from "./modules/cms/cms.module";
import { TablesModule } from "./modules/tables/tables.module";
import { KitchenModule } from "./modules/kitchen/kitchen.module";
import { ComplaintsModule } from "./modules/complaints/complaints.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { StaffModule } from "./modules/staff/staff.module";
import { RidersModule } from "./modules/riders/riders.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { AuditLogModule } from "./modules/audit-logs/audit-log.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { validateEnv } from "./config/env.schema";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    EmailModule,
    LoyaltyModule,
    HealthModule,
    AuthModule,
    MediaModule,
    CatalogModule,
    DealsModule,
    CustomersModule,
    BranchesModule,
    PaymentsModule,
    OrdersModule,
    CouponsModule,
    CmsModule,
    TablesModule,
    KitchenModule,
    ComplaintsModule,
    ReportsModule,
    // RidersModule must be registered BEFORE StaffModule: StaffController has `GET /staff/:id`, which would
    // otherwise swallow `GET /staff/riders` (treating "riders" as a staff id → STAFF_NOT_FOUND).
    RidersModule,
    StaffModule,
    NotificationsModule,
    AuditLogModule,
    RealtimeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
