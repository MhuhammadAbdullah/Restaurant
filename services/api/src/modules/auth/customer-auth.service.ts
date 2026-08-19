import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { hashPassword, verifyPassword } from "@restaurant/auth";
import type { CustomerLoginInput, CustomerRegisterInput } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";
import { TokensService } from "./tokens.service";

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  private getRestaurantId(): Promise<string> {
    return this.restaurantContext.getRestaurantId();
  }

  async register(input: CustomerRegisterInput) {
    const restaurantId = await this.getRestaurantId();
    const existing = await this.prisma.customer.findFirst({ where: { restaurantId, phone: input.phone } });
    if (existing) throw new ConflictException({ code: "PHONE_TAKEN", message: "An account with this phone number already exists" });

    const passwordHash = await hashPassword(input.password);
    const customer = await this.prisma.customer.create({
      data: {
        restaurantId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        passwordHash,
        isGuest: false,
        loyaltyAccount: { create: { pointsBalance: 0 } },
      },
    });

    const pair = await this.tokens.issueCustomerTokens({ sub: customer.id, restaurantId });
    await this.prisma.customer.update({ where: { id: customer.id }, data: { refreshTokenHash: pair.refreshTokenHash } });

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
    };
  }

  async login(input: CustomerLoginInput) {
    const restaurantId = await this.getRestaurantId();
    const customer = await this.prisma.customer.findFirst({ where: { restaurantId, phone: input.phone, status: "ACTIVE" } });
    if (!customer) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid phone or password" });

    const valid = customer.passwordHash ? await verifyPassword(input.password, customer.passwordHash) : false;
    if (!valid) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid phone or password" });

    const pair = await this.tokens.issueCustomerTokens({ sub: customer.id, restaurantId });
    await this.prisma.customer.update({ where: { id: customer.id }, data: { refreshTokenHash: pair.refreshTokenHash } });

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
    };
  }

  async refresh(refreshToken: string) {
    let payload;
    try {
      payload = await this.tokens.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException({ code: "INVALID_REFRESH_TOKEN", message: "Session expired, please log in again" });
    }
    if (payload.aud !== "customer") {
      throw new UnauthorizedException({ code: "WRONG_AUDIENCE", message: "Invalid refresh token" });
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
    const incomingHash = this.tokens.hashToken(refreshToken);
    if (!customer || customer.refreshTokenHash !== incomingHash) {
      throw new UnauthorizedException({ code: "REFRESH_TOKEN_REVOKED", message: "Session no longer valid" });
    }

    const pair = await this.tokens.issueCustomerTokens({ sub: customer.id, restaurantId: customer.restaurantId });
    await this.prisma.customer.update({ where: { id: customer.id }, data: { refreshTokenHash: pair.refreshTokenHash } });

    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  }

  async logout(customerId: string) {
    await this.prisma.customer.update({ where: { id: customerId }, data: { refreshTokenHash: null } });
  }

  async me(customerId: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: { loyaltyAccount: true },
    });
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      gender: customer.gender,
      dob: customer.dob,
      loyaltyPoints: customer.loyaltyAccount?.pointsBalance ?? 0,
    };
  }
}
