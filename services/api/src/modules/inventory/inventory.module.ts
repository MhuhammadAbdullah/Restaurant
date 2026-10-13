import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryOpsService } from "./inventory-ops.service";

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryOpsService],
  exports: [InventoryService],
})
export class InventoryModule {}
