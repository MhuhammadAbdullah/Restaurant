import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import type { AppJwtPayload, CustomerJwtPayload, StaffJwtPayload } from "@restaurant/auth";
import type { Env } from "../../config/env.schema";

export type TokenPair = { accessToken: string; refreshToken: string; refreshTokenHash: string };

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issueStaffTokens(payload: Omit<StaffJwtPayload, "aud">): Promise<TokenPair> {
    return this.issue({ ...payload, aud: "staff" });
  }

  async issueCustomerTokens(payload: Omit<CustomerJwtPayload, "aud">): Promise<TokenPair> {
    return this.issue({ ...payload, aud: "customer" });
  }

  private async issue(payload: AppJwtPayload): Promise<TokenPair> {
    const jti = randomUUID();
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      expiresIn: this.config.get("JWT_ACCESS_TTL", { infer: true }),
    });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti },
      {
        secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
        expiresIn: this.config.get("JWT_REFRESH_TTL", { infer: true }),
      },
    );
    return { accessToken, refreshToken, refreshTokenHash: this.hashToken(refreshToken) };
  }

  async verifyAccessToken(token: string): Promise<AppJwtPayload> {
    return this.jwt.verifyAsync<AppJwtPayload>(token, {
      secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
    });
  }

  async verifyRefreshToken(token: string): Promise<AppJwtPayload> {
    return this.jwt.verifyAsync<AppJwtPayload>(token, {
      secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
    });
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
