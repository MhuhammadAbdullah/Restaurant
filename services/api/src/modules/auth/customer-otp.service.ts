import { randomInt } from "node:crypto";
import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { hashPassword, verifyPassword } from "@restaurant/auth";
import type { RequestEmailOtpInput, VerifyLoginOtpInput, VerifyRegisterOtpInput } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";
import { EmailService } from "../../common/email/email.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { TokensService } from "./tokens.service";

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

/**
 * Passwordless customer auth: email in -> 6-digit code out (via EmailService) -> code back in ->
 * session issued. Login and registration share this same OTP mechanism (CLAUDE.md's "same form"
 * requirement) but are kept as distinct `purpose`s so a code requested for one can't complete
 * the other — otherwise an attacker who intercepts a login code for someone else's email could
 * use it to *register* a new account under that email instead.
 */
@Injectable()
export class CustomerOtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
    private readonly email: EmailService,
    private readonly loyalty: LoyaltyService,
    private readonly tokens: TokensService,
  ) {}

  async requestOtp(input: RequestEmailOtpInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const existing = await this.prisma.customer.findUnique({
      where: { restaurantId_email: { restaurantId, email: input.email } },
    });

    if (input.purpose === "LOGIN" && !existing) {
      throw new NotFoundException({
        code: "EMAIL_NOT_REGISTERED",
        message: "No account found with this email — please register instead.",
      });
    }
    if (input.purpose === "REGISTER" && existing) {
      throw new ConflictException({
        code: "EMAIL_ALREADY_REGISTERED",
        message: "An account with this email already exists — please log in instead.",
      });
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    // Send before persisting: a failed send should leave no OTP row behind, so a retry doesn't
    // have to compete with a phantom code the user never actually received.
    await this.email.sendOtpEmail(input.email, code, input.purpose);

    await this.prisma.emailOtp.create({
      data: { restaurantId, email: input.email, codeHash, purpose: input.purpose, expiresAt },
    });

    return { expiresInSeconds: OTP_TTL_MINUTES * 60 };
  }

  private async consumeOtp(restaurantId: string, email: string, purpose: "LOGIN" | "REGISTER", code: string) {
    const otp = await this.prisma.emailOtp.findFirst({
      where: { restaurantId, email, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) {
      throw new UnauthorizedException({ code: "OTP_NOT_FOUND", message: "Request a new code for this email." });
    }
    if (otp.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: "OTP_EXPIRED", message: "This code has expired — request a new one." });
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException({ code: "OTP_TOO_MANY_ATTEMPTS", message: "Too many incorrect attempts — request a new code." });
    }

    const valid = await verifyPassword(code, otp.codeHash);
    if (!valid) {
      await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException({ code: "OTP_INVALID", message: "Incorrect code." });
    }

    await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  }

  async verifyLogin(input: VerifyLoginOtpInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    await this.consumeOtp(restaurantId, input.email, "LOGIN", input.code);

    const customer = await this.prisma.customer.findFirst({
      where: { restaurantId, email: input.email, status: "ACTIVE" },
    });
    if (!customer) {
      throw new NotFoundException({ code: "EMAIL_NOT_REGISTERED", message: "No account found with this email." });
    }

    return this.issueSession(customer.id, restaurantId, customer);
  }

  async verifyRegister(input: VerifyRegisterOtpInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    await this.consumeOtp(restaurantId, input.email, "REGISTER", input.code);

    // Race-condition guard: someone else could have registered the same email/phone in the
    // window between the OTP request and this verify call.
    const [emailTaken, phoneTaken] = await Promise.all([
      this.prisma.customer.findUnique({ where: { restaurantId_email: { restaurantId, email: input.email } } }),
      this.prisma.customer.findUnique({ where: { restaurantId_phone: { restaurantId, phone: input.phone } } }),
    ]);
    if (emailTaken) {
      throw new ConflictException({ code: "EMAIL_ALREADY_REGISTERED", message: "An account with this email already exists." });
    }
    // A POS walk-in profile (guest, no email yet) is claimed by registering with the same phone: the
    // customer keeps their order history instead of being told the phone is taken.
    const claimable = phoneTaken && phoneTaken.isGuest && !phoneTaken.email && phoneTaken.status === "ACTIVE" ? phoneTaken : null;
    if (phoneTaken && !claimable) {
      throw new ConflictException({ code: "PHONE_TAKEN", message: "An account with this phone number already exists." });
    }

    const loyaltyConfig = await this.loyalty.getConfig(restaurantId);

    if (claimable) {
      const claimed = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id: claimable.id },
          data: { name: input.name, email: input.email, gender: input.gender, dob: input.dob, isGuest: false },
          include: { loyaltyAccount: true },
        });
        const account = updated.loyaltyAccount ?? (await tx.loyaltyAccount.create({ data: { customerId: updated.id, pointsBalance: 0 } }));
        await this.loyalty.awardSignupBonus(tx, account.id, loyaltyConfig);
        return updated;
      });
      return this.issueSession(claimed.id, restaurantId, claimed);
    }

    const customer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          restaurantId,
          name: input.name,
          email: input.email,
          phone: input.phone,
          gender: input.gender,
          dob: input.dob,
          isGuest: false,
          loyaltyAccount: { create: { pointsBalance: 0 } },
        },
        include: { loyaltyAccount: true },
      });
      await this.loyalty.awardSignupBonus(tx, created.loyaltyAccount!.id, loyaltyConfig);
      return created;
    });

    return this.issueSession(customer.id, restaurantId, customer);
  }

  private async issueSession(customerId: string, restaurantId: string, customer: { name: string; phone: string; email: string | null }) {
    const pair = await this.tokens.issueCustomerTokens({ sub: customerId, restaurantId });
    await this.prisma.customer.update({ where: { id: customerId }, data: { refreshTokenHash: pair.refreshTokenHash } });

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      customer: { id: customerId, name: customer.name, phone: customer.phone, email: customer.email },
    };
  }
}
