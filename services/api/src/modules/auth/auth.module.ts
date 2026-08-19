import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TokensService } from "./tokens.service";
import { StaffAuthService } from "./staff-auth.service";
import { CustomerAuthService } from "./customer-auth.service";
import { CustomerOtpService } from "./customer-otp.service";
import { StaffAuthController } from "./staff-auth.controller";
import { CustomerAuthController } from "./customer-auth.controller";
import { StaffJwtAuthGuard } from "./guards/staff-jwt-auth.guard";
import { CustomerJwtAuthGuard } from "./guards/customer-jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { BranchScopeGuard } from "./guards/branch-scope.guard";
import { PermissionsCheckService } from "./permissions-check.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [StaffAuthController, CustomerAuthController],
  providers: [
    TokensService,
    StaffAuthService,
    CustomerAuthService,
    CustomerOtpService,
    StaffJwtAuthGuard,
    CustomerJwtAuthGuard,
    PermissionsGuard,
    BranchScopeGuard,
    PermissionsCheckService,
  ],
  exports: [TokensService, StaffAuthService, StaffJwtAuthGuard, CustomerJwtAuthGuard, PermissionsGuard, BranchScopeGuard, PermissionsCheckService],
})
export class AuthModule {}
