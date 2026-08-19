import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BranchesController } from "./branches.controller";
import { BranchesService } from "./branches.service";
import { BranchResolutionService } from "./branch-resolution.service";

@Module({
  imports: [AuthModule],
  controllers: [BranchesController],
  providers: [BranchesService, BranchResolutionService],
  exports: [BranchResolutionService, BranchesService],
})
export class BranchesModule {}
