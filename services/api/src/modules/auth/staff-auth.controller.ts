import { Body, Controller, Get, HttpCode, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { Throttle } from "@nestjs/throttler";
import { refreshTokenSchema, staffLoginSchema, type StaffLoginInput } from "@restaurant/validation";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffAuthService } from "./staff-auth.service";
import { StaffJwtAuthGuard } from "./guards/staff-jwt-auth.guard";
import { Public } from "./decorators/public.decorator";
import { CurrentStaff } from "./decorators/current-staff.decorator";
import type { StaffJwtPayload } from "@restaurant/auth";
import { AuditLogService } from "../audit-logs/audit-log.service";

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  phone: z.union([z.literal(""), z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, "Enter a valid phone number")]).nullable().optional(),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128)
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/[0-9]/, "Include at least one number"),
});

@Controller("auth/staff")
@UseGuards(StaffJwtAuthGuard)
export class StaffAuthController {
  constructor(
    private readonly authService: StaffAuthService,
    private readonly auditLogs: AuditLogService,
  ) {}

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
  async logout(
    @CurrentStaff() staff: StaffJwtPayload,
    @Body(new ZodValidationPipe(z.object({ refreshToken: z.string().min(10).optional() }).default({}))) body: { refreshToken?: string },
  ) {
    await this.authService.logout(staff.sub, body.refreshToken);
    return { success: true, data: { loggedOut: true } };
  }

  @Get("profile")
  async profile(@CurrentStaff() staff: StaffJwtPayload) {
    return { success: true, data: await this.authService.getProfile(staff.sub) };
  }

  @Patch("profile")
  async updateProfile(@CurrentStaff() staff: StaffJwtPayload, @Body(new ZodValidationPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>, @Req() req: Request) {
    const data = await this.authService.updateProfile(staff.sub, { name: body.name, phone: body.phone ?? null });
    await this.auditLogs.recordForStaff(staff, "staff.profileUpdate", "StaffUser", staff.sub, { newValue: { name: data.name, phone: data.phone } }, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  /** The person changes their own password: needs the current one. Returns a fresh session so this device stays signed in. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("change-password")
  @HttpCode(200)
  async changePassword(@CurrentStaff() staff: StaffJwtPayload, @Body(new ZodValidationPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>, @Req() req: Request) {
    const data = await this.authService.changePassword(staff.sub, body);
    await this.auditLogs.recordForStaff(staff, "staff.passwordChanged", "StaffUser", staff.sub, undefined, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return { success: true, data };
  }

  @Get("me")
  async me(@CurrentStaff() staff: StaffJwtPayload) {
    const result = await this.authService.me(staff.sub);
    return { success: true, data: result };
  }
}
