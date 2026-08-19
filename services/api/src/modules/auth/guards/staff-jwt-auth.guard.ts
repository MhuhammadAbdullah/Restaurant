import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isStaffPayload } from "@restaurant/auth";
import { TokensService } from "../tokens.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

@Injectable()
export class StaffJwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException({ code: "NO_TOKEN", message: "Authentication required" });

    try {
      const payload = await this.tokens.verifyAccessToken(token);
      if (!isStaffPayload(payload)) {
        throw new UnauthorizedException({ code: "WRONG_AUDIENCE", message: "Staff token required" });
      }
      request.staff = payload;
      return true;
    } catch {
      throw new UnauthorizedException({ code: "INVALID_TOKEN", message: "Invalid or expired session" });
    }
  }

  private extractToken(request: { headers: Record<string, string | undefined> }): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return undefined;
    return header.slice("Bearer ".length);
  }
}
