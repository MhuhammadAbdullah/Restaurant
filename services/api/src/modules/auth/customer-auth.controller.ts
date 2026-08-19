import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  customerLoginSchema,
  customerRegisterSchema,
  refreshTokenSchema,
  requestEmailOtpSchema,
  verifyLoginOtpSchema,
  verifyRegisterOtpSchema,
  type CustomerLoginInput,
  type CustomerRegisterInput,
  type RequestEmailOtpInput,
  type VerifyLoginOtpInput,
  type VerifyRegisterOtpInput,
} from "@restaurant/validation";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CustomerAuthService } from "./customer-auth.service";
import { CustomerOtpService } from "./customer-otp.service";
import { CustomerJwtAuthGuard } from "./guards/customer-jwt-auth.guard";
import { Public } from "./decorators/public.decorator";
import { CurrentCustomer } from "./decorators/current-customer.decorator";
import type { CustomerJwtPayload } from "@restaurant/auth";

@Controller("auth/customer")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerAuthController {
  constructor(
    private readonly authService: CustomerAuthService,
    private readonly otpService: CustomerOtpService,
  ) {}

  // ---------- Email OTP (the customer website's actual login/register flow) ----------

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("otp/request")
  @HttpCode(200)
  async requestOtp(@Body(new ZodValidationPipe(requestEmailOtpSchema)) body: RequestEmailOtpInput) {
    const result = await this.otpService.requestOtp(body);
    return { success: true, data: result };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("otp/verify-login")
  @HttpCode(200)
  async verifyLoginOtp(@Body(new ZodValidationPipe(verifyLoginOtpSchema)) body: VerifyLoginOtpInput) {
    const result = await this.otpService.verifyLogin(body);
    return { success: true, data: result };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("otp/verify-register")
  @HttpCode(201)
  async verifyRegisterOtp(@Body(new ZodValidationPipe(verifyRegisterOtpSchema)) body: VerifyRegisterOtpInput) {
    const result = await this.otpService.verifyRegister(body);
    return { success: true, data: result };
  }

  // ---------- Legacy phone+password (kept for backward compatibility, unused by the current site) ----------

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("register")
  @HttpCode(201)
  async register(@Body(new ZodValidationPipe(customerRegisterSchema)) body: CustomerRegisterInput) {
    const result = await this.authService.register(body);
    return { success: true, data: result };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(customerLoginSchema)) body: CustomerLoginInput) {
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
  async logout(@CurrentCustomer() customer: CustomerJwtPayload) {
    await this.authService.logout(customer.sub);
    return { success: true, data: { loggedOut: true } };
  }

  @Get("me")
  async me(@CurrentCustomer() customer: CustomerJwtPayload) {
    const result = await this.authService.me(customer.sub);
    return { success: true, data: result };
  }
}
