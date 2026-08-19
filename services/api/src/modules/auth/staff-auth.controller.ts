import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { refreshTokenSchema, staffLoginSchema, type StaffLoginInput } from "@restaurant/validation";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffAuthService } from "./staff-auth.service";
import { StaffJwtAuthGuard } from "./guards/staff-jwt-auth.guard";
import { Public } from "./decorators/public.decorator";
import { CurrentStaff } from "./decorators/current-staff.decorator";
import type { StaffJwtPayload } from "@restaurant/auth";

@Controller("auth/staff")
@UseGuards(StaffJwtAuthGuard)
export class StaffAuthController {
  constructor(private readonly authService: StaffAuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(staffLoginSchema)) body: StaffLoginInput) {
    const result = await this.authService.login(body);
    return { success: true, data: result };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Body(new ZodValidationPipe(refreshTokenSchema)) body: { refreshToken: string }) {
    const result = await this.authService.refresh(body.refreshToken);
    return { success: true, data: result };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@CurrentStaff() staff: StaffJwtPayload) {
    await this.authService.logout(staff.sub);
    return { success: true, data: { loggedOut: true } };
  }

  @Get("me")
  async me(@CurrentStaff() staff: StaffJwtPayload) {
    const result = await this.authService.me(staff.sub);
    return { success: true, data: result };
  }
}
