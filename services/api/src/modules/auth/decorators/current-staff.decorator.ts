import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";

export const CurrentStaff = createParamDecorator((_: unknown, ctx: ExecutionContext): StaffJwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.staff;
});
