import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  createOrderSchema,
  previewCouponSchema,
  pushSubscribeSchema,
  type CreateOrderInput,
  type PreviewCouponInput,
  type PushSubscribeInput,
} from "@restaurant/validation";
import type { CustomerJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { OrdersService } from "./orders.service";

@Controller("orders")
@UseGuards(CustomerJwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async create(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
  ) {
    const data = await this.orders.createOnlineOrder(customer.sub, body);
    return { success: true, data };
  }

  @Get()
  async list(@CurrentCustomer() customer: CustomerJwtPayload) {
    const data = await this.orders.listOrdersForCustomer(customer.sub);
    return { success: true, data };
  }

  @Get(":orderNumber")
  async findOne(@CurrentCustomer() customer: CustomerJwtPayload, @Param("orderNumber") orderNumber: string) {
    const data = await this.orders.getOrderForCustomer(customer.sub, orderNumber);
    return { success: true, data };
  }

  /** Guest checkout (CLAUDE.md §11 — "Guest checkout optional"): no account, no saved address/loyalty. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("guest")
  async createGuest(@Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput) {
    const data = await this.orders.createOnlineOrder(null, body);
    return { success: true, data };
  }

  // Guarded even for reads: the order number is a sequential, guessable identifier (unlike the
  // old raw cuid), so throttling here is real defense-in-depth against enumeration attempts —
  // on top of the terminal-status expiry enforced in getOrderForGuest.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get("guest/:orderNumber")
  async findOneGuest(@Param("orderNumber") orderNumber: string) {
    const data = await this.orders.getOrderForGuest(orderNumber);
    return { success: true, data };
  }

  @Public()
  @Post("coupon-preview")
  async previewCoupon(@Body(new ZodValidationPipe(previewCouponSchema)) body: PreviewCouponInput) {
    const data = await this.orders.previewCoupon(body.branchId, body.code, body.items);
    return { success: true, data };
  }

  // Public: the order-tracking page (registered customer or guest alike) is where the browser
  // permission prompt happens, so this can't require the customer auth guard. Order-scoped, not
  // account-scoped — see PushSubscription's schema comment.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(":orderNumber/push-subscribe")
  async pushSubscribe(@Param("orderNumber") orderNumber: string, @Body(new ZodValidationPipe(pushSubscribeSchema)) body: PushSubscribeInput) {
    await this.orders.subscribeToPush(orderNumber, body);
    return { success: true };
  }
}
