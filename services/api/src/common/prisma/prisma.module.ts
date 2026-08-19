import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { RestaurantContextService } from "../restaurant/restaurant-context.service";

@Global()
@Module({
  providers: [PrismaService, RestaurantContextService],
  exports: [PrismaService, RestaurantContextService],
})
export class PrismaModule {}
