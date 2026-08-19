import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { CustomerJwtPayload } from "@restaurant/auth";

export const CurrentCustomer = createParamDecorator((_: unknown, ctx: ExecutionContext): CustomerJwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.customer;
});
