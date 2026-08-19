import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { OrderStatus, OrderSource, Prisma } from "@restaurant/database";
import type {
  AddOrderItemsInput,
  AssignRiderInput,
  ChangeOrderTypeInput,
  ConfirmPaymentInput,
  CreateOrderInput,
  CreatePosOrderInput,
  LogPrintEventInput,
  OrderItemInput,
  PushSubscribeInput,
  RecordOrderPaymentInput,
  TransferOrderBranchInput,
  UpdateDeliveryEtaInput,
  UpdateOrderDeliveryDetailsInput,
  UpdateOrderItemQuantityInput,
  UpdateOrderStatusInput,
  UpdateRiderDeliveryStatusInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { resolveLoyaltyConfig } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PermissionsCheckService } from "../auth/permissions-check.service";
import { BranchResolutionService } from "../branches/branch-resolution.service";
import { ProductPricingService, type ProductLineBreakdown } from "./product-pricing.service";
import { DealPricingService } from "../deals/deal-pricing.service";
import { PaymentsService } from "../payments/payments.service";
import { CouponsService } from "../coupons/coupons.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PushService } from "../notifications/push.service";
import { EmailService, type OrderConfirmationEmailParams } from "../../common/email/email.service";
import type { Env } from "../../config/env.schema";

/** Terminal statuses that free up a dine-in table and stop counting an order as "open". */
const TERMINAL_STATUSES: OrderStatus[] = ["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"];

// Mirrors apps/web's PICKUP_TYPES / DELIVERY_TYPES — kept in sync manually since the two apps
// don't share a validation package for order-type classification.
const PICKUP_ORDER_TYPES = ["ONLINE_PICKUP", "TAKEAWAY"];
const DELIVERY_ORDER_TYPES = ["ONLINE_DELIVERY", "DELIVERY"];

type PricedLine =
  | { kind: "product"; input: Extract<OrderItemInput, { kind: "product" }>; priced: ProductLineBreakdown }
  | {
      kind: "deal";
      input: Extract<OrderItemInput, { kind: "deal" }>;
      priced: Awaited<ReturnType<DealPricingService["priceSelections"]>>;
    };

function assertStaffBranchAccess(staff: StaffJwtPayload, branchId: string) {
  if (staff.isOwner || staff.allBranchesAccess) return;
  if (!staff.branchIds.includes(branchId)) {
    throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this branch" });
  }
}

/**
 * `orderIncludes()` uses a blanket relational `include`, so it returns every scalar Order column
 * — including `internalNotes`, which is staff-only (CLAUDE.md §13/new spec §17: kitchen/prep
 * notes must not reach the customer). Customer- and guest-facing reads must strip it before the
 * response leaves the service; staff reads (getOrderForStaff) intentionally keep it.
 */
function stripStaffOnlyOrderFields<T extends { internalNotes: string | null }>(order: T): Omit<T, "internalNotes"> {
  const { internalNotes: _internalNotes, ...rest } = order;
  return rest;
}

/**
 * Rounds up to the next 5-minute mark with zero seconds/ms — `updateDeliveryEta` rejects anything
 * that isn't exactly 5-minute-aligned, so the very first ETA an order ever gets (computed here at
 * creation time from `Date.now() + branch.estimatedDeliveryMins`) must already be aligned, or
 * every subsequent ±5 click would inherit the same misalignment and fail validation. Rounds up
 * (never down) so the estimate never gets less generous than the branch's configured minutes.
 */
function roundUpToFiveMinutes(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const remainder = d.getMinutes() % 5;
  if (remainder !== 0) d.setMinutes(d.getMinutes() + (5 - remainder));
  return d;
}

function productLinesFor(pricedLines: PricedLine[]): { productId: string; lineTotal: number }[] {
  return pricedLines
    .filter((l): l is Extract<PricedLine, { kind: "product" }> => l.kind === "product")
    .map((l) => ({ productId: l.priced.productId, lineTotal: l.priced.lineTotal }));
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
    private readonly branchResolution: BranchResolutionService,
    private readonly productPricing: ProductPricingService,
    private readonly dealPricing: DealPricingService,
    private readonly payments: PaymentsService,
    private readonly coupons: CouponsService,
    private readonly auditLogs: AuditLogService,
    private readonly permissionsCheck: PermissionsCheckService,
    private readonly realtime: RealtimeGateway,
    private readonly loyalty: LoyaltyService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {}

  /**
   * CLAUDE.md §9 order creation logic, steps 1-25. Every price, discount, and eligibility check
   * is recomputed here from the database — a client-submitted total is only used to assert
   * equality (Rule 8/9/16), never trusted directly.
   */
  async createOnlineOrder(customerId: string | null, input: CreateOrderInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();

    if (input.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) {
        const full = customerId ? await this.getOrderForCustomer(customerId, existing.orderNumber) : await this.getOrderForGuest(existing.orderNumber);
        return { order: full, paymentRedirectUrl: undefined };
      }
    }

    if (!customerId) {
      if (input.addressId) {
        throw new BadRequestException({ code: "GUEST_ADDRESS_INVALID", message: "Guest checkout requires a new address, not a saved one" });
      }
      if (input.loyaltyPointsToRedeem > 0) {
        throw new BadRequestException({ code: "GUEST_LOYALTY_UNAVAILABLE", message: "Loyalty points require an account" });
      }
    }

    // Fraud prevention: a logged-in customer's own account block wins over a phone lookup (their
    // contactPhone on this particular order might not even match their account phone), while a
    // guest checkout has no account at all — only a phone — so that's what gets checked instead.
    if (customerId) {
      const account = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { status: true } });
      if (account?.status === "INACTIVE") {
        throw new ForbiddenException({ code: "ACCOUNT_BLOCKED", message: "Your account has been blocked from placing orders. Please contact the restaurant." });
      }
    } else {
      await this.assertPhoneNotBlocked(restaurantId, input.contactPhone);
    }

    // 1-2: resolve customer (given), branch re-validation (Rule 7)
    const branch = await this.prisma.branch.findUnique({ where: { id: input.branchId } });
    if (!branch || branch.restaurantId !== restaurantId || branch.status !== "ACTIVE") {
      throw new BadRequestException({ code: "BRANCH_UNAVAILABLE", message: "Selected branch is not available" });
    }

    // Menu browsing is allowed while a branch is closed, but placing an order is not —
    // re-check hours here regardless of order type (client-side gating is UX only).
    if (!this.branchResolution.isBranchOpen(branch)) {
      throw new BadRequestException({
        code: "BRANCH_CLOSED",
        message: "This branch is currently closed. Please check back during opening hours.",
      });
    }

    let deliveryAddressSnapshot: {
      addressId?: string;
      city: string;
      area: string;
      addressLine: string;
      landmark?: string;
      contactNumber?: string;
    } | null = null;

    if (input.type === "ONLINE_DELIVERY") {
      if (input.addressId) {
        const address = await this.prisma.customerAddress.findUnique({ where: { id: input.addressId } });
        if (!address || address.customerId !== customerId) {
          throw new NotFoundException({ code: "ADDRESS_NOT_FOUND", message: "Address not found" });
        }
        deliveryAddressSnapshot = {
          addressId: address.id,
          city: address.city,
          area: address.area,
          addressLine: address.addressLine,
          landmark: address.landmark ?? undefined,
          contactNumber: address.contactNumber ?? undefined,
        };
      } else if (input.newAddress) {
        deliveryAddressSnapshot = { ...input.newAddress };
      }

      const stillEligible = await this.branchResolution.isStillEligible(branch.id, {
        city: deliveryAddressSnapshot!.city,
        area: deliveryAddressSnapshot!.area,
        orderType: "DELIVERY",
      });
      if (!stillEligible) {
        throw new BadRequestException({
          code: "BRANCH_NO_LONGER_ELIGIBLE",
          message: "Sorry, delivery is currently unavailable in your selected area.",
        });
      }
    } else {
      if (!branch.pickupEnabled) {
        throw new BadRequestException({ code: "PICKUP_UNAVAILABLE", message: "Pickup is not available at this branch" });
      }
    }

    // 5-11: price every line item server-side (products + deals independently)
    const pricedLines = await this.priceLineItems(branch.id, input.items);
    const subtotal = this.sumLineItems(pricedLines);

    if (input.type === "ONLINE_DELIVERY" && subtotal < branch.minimumOrder) {
      throw new BadRequestException({
        code: "BELOW_MINIMUM_ORDER",
        message: `Minimum order for this branch is Rs. ${branch.minimumOrder / 100}`,
      });
    }

    // 11-12: tax + delivery fee
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const loyaltyConfig = resolveLoyaltyConfig(restaurant.settings);
    const taxAmount = Math.round(subtotal * (Number(restaurant.defaultTaxPct) / 100));
    const deliveryFee = input.type === "ONLINE_DELIVERY" ? branch.deliveryFee : 0;
    const discountAmount = 0;

    // 13: coupon validation (server-priced, never trusted from client)
    let couponPricing: { couponId: string; code: string; discountAmount: number } | null = null;
    if (input.couponCode) {
      couponPricing = await this.coupons.validateAndPrice({
        restaurantId,
        code: input.couponCode,
        customerId,
        productLines: productLinesFor(pricedLines),
      });
    }
    const couponDiscountAmount = couponPricing?.discountAmount ?? 0;

    // 14-15: loyalty redemption validation
    let loyaltyDiscountAmount = 0;
    if (customerId && input.loyaltyPointsToRedeem > 0) {
      if (!loyaltyConfig.enabled) {
        throw new BadRequestException({ code: "LOYALTY_DISABLED", message: "The loyalty program is currently unavailable" });
      }
      const loyaltyAccount = await this.prisma.loyaltyAccount.findUnique({ where: { customerId } });
      if (!loyaltyAccount || loyaltyAccount.pointsBalance < input.loyaltyPointsToRedeem) {
        throw new BadRequestException({ code: "INSUFFICIENT_LOYALTY_POINTS", message: "Not enough loyalty points" });
      }
      loyaltyDiscountAmount = input.loyaltyPointsToRedeem * loyaltyConfig.redemptionValuePaisaPerPoint;
    }

    const grandTotal = subtotal + taxAmount + deliveryFee - discountAmount - couponDiscountAmount - loyaltyDiscountAmount;
    if (grandTotal < 0) {
      throw new BadRequestException({ code: "DISCOUNT_EXCEEDS_TOTAL", message: "Discounts cannot exceed the order total" });
    }

    // 16-17: payment method / gift rules (Rule 14-16)
    let paymentMethod = input.paymentMethod;
    if (input.isGift) {
      paymentMethod = "ONLINE"; // enforced regardless of client input (Rule 15)
    }

    if (input.clientTotal !== undefined && input.clientTotal !== grandTotal) {
      throw new BadRequestException({
        code: "TOTAL_MISMATCH",
        message: "Your cart total is out of date. Please refresh and try again.",
        details: { serverTotal: grandTotal, clientTotal: input.clientTotal },
      });
    }

    const estimatedDeliveryAt =
      input.type === "ONLINE_DELIVERY" ? roundUpToFiveMinutes(new Date(Date.now() + branch.estimatedDeliveryMins * 60_000)) : null;

    // 18-25: create order + items + ledgers + payment, atomically.
    // Explicit timeout: default Prisma interactive-transaction timeout is 5s — this block does
    // order + item creation, loyalty ledger writes, payment +
    // receipt rows, and a notification insert, all sequentially against a remote pooled
    // connection, which can genuinely exceed 5s under real network latency (observed directly:
    // registered-customer checkout intermittently failed with "Transaction not found" once
    // loyalty's extra isGuest lookup pushed it over the line — guest checkout skips the
    // loyalty block entirely, which is why only the logged-in path was affected).
    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.nextOrderNumber(tx, restaurantId);

      const created = await tx.order.create({
        data: {
          orderNumber,
          restaurantId,
          branchId: branch.id,
          customerId,
          idempotencyKey: input.idempotencyKey,
          type: input.type,
          source: "ONLINE",
          status: "PENDING",
          paymentMethod,
          paymentStatus: "PENDING",
          isGift: input.isGift,
          giftRecipientName: input.gift?.recipientName,
          giftRecipientPhone: input.gift?.recipientPhone,
          giftRecipientAddress: input.gift?.recipientAddress,
          giftRecipientCity: input.gift?.recipientCity,
          giftRecipientArea: input.gift?.recipientArea,
          giftRecipientLandmark: input.gift?.recipientLandmark,
          giftMessage: input.gift?.message,
          deliveryAddressSnapshot: deliveryAddressSnapshot?.addressLine,
          deliveryCity: deliveryAddressSnapshot?.city,
          deliveryArea: deliveryAddressSnapshot?.area,
          deliveryLandmark: deliveryAddressSnapshot?.landmark,
          addressId: deliveryAddressSnapshot?.addressId,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          contactAlternatePhone: input.contactAlternatePhone,
          contactEmail: input.contactEmail,
          subtotal,
          taxAmount,
          deliveryFee,
          discountAmount,
          loyaltyPointsRedeemed: input.loyaltyPointsToRedeem,
          loyaltyDiscountAmount,
          couponCode: couponPricing?.code,
          couponDiscountAmount,
          grandTotal,
          changeRequestAmount: paymentMethod === "COD" ? input.changeRequestAmount : undefined,
          specialInstructions: input.specialInstructions,
          estimatedDeliveryAt,
        },
      });

      await this.createOrderItems(tx, created.id, branch.id, pricedLines);

      if (couponPricing) {
        await tx.couponRedemption.create({
          data: { couponId: couponPricing.couponId, orderId: created.id, customerId, discountAmount: couponPricing.discountAmount },
        });
      }

      if (customerId && input.loyaltyPointsToRedeem > 0) {
        const loyaltyAccount = await tx.loyaltyAccount.findUniqueOrThrow({ where: { customerId } });
        await tx.loyaltyTransaction.create({
          data: {
            loyaltyAccountId: loyaltyAccount.id,
            type: "REDEEMED",
            points: -input.loyaltyPointsToRedeem,
            orderId: created.id,
            branchId: branch.id,
            note: `Redeemed on order ${orderNumber}`,
          },
        });
        await tx.loyaltyAccount.update({
          where: { id: loyaltyAccount.id },
          data: { pointsBalance: loyaltyAccount.pointsBalance - input.loyaltyPointsToRedeem },
        });
      }

      if (customerId) {
        await this.loyalty.awardPoints(tx, {
          customerId,
          orderId: created.id,
          orderNumber,
          branchId: branch.id,
          amountPaisa: grandTotal,
          config: loyaltyConfig,
        });
      }

      await tx.payment.create({
        data: {
          orderId: created.id,
          method: paymentMethod,
          provider: paymentMethod === "COD" ? "cod" : "payfast",
          status: "PENDING",
          amount: grandTotal,
        },
      });

      await tx.receipt.create({ data: { orderId: created.id } });

      if (customerId) {
        await tx.notification.create({
          data: {
            restaurantId,
            recipientType: "CUSTOMER",
            recipientCustomerId: customerId,
            orderId: created.id,
            type: "ORDER_CONFIRMED",
            title: "Order placed",
            message: `Your order ${orderNumber} has been placed.`,
          },
        });
      }

      return created;
    }, { timeout: 15000 });

    let paymentRedirectUrl: string | undefined;
    if (paymentMethod === "ONLINE" && grandTotal > 0) {
      const initiated = await this.payments.initiateForOrder(order.id);
      paymentRedirectUrl = initiated.redirectUrl;
    }
    // Every new online order starts (and stays) PENDING regardless of payment method/status — a
    // paid COD/online order is not the same thing as a kitchen-reviewed one. Only an explicit
    // Admin "Accept" (updateOrderStatus PENDING → CONFIRMED) moves it forward and sends the
    // confirmation email; see updateOrderStatus / sendAcceptanceEmailIfApplicable below.

    const full = customerId ? await this.getOrderForCustomer(customerId, order.orderNumber) : await this.getOrderForGuest(order.orderNumber);
    this.realtime.emitOrderCreated({ restaurantId, branchId: branch.id, order: full });
    await this.notifications.notifyStaffNewOrder(full);

    return { order: full, paymentRedirectUrl };
  }

  /**
   * Fired only when an order genuinely transitions PENDING → CONFIRMED (i.e. Admin clicked
   * "Accept") — never at order placement. Registered customers get their account email; guests
   * only if they typed one at checkout. Errors are swallowed (logged) so a slow/failed email
   * provider never fails the status-change response the staff member is waiting on.
   */
  private async sendAcceptanceEmailIfApplicable(orderId: string, restaurantId: string): Promise<void> {
    const full = await this.prisma.order.findUnique({ where: { id: orderId }, include: this.orderIncludes() }).catch((e) => {
      this.logger.error(`Failed to load order ${orderId} for acceptance email: ${e instanceof Error ? e.message : e}`);
      return null;
    });
    if (!full) return;
    const recipientEmail = full.customer?.email ?? full.contactEmail;
    if (!recipientEmail) return;
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });

    const isPickup = PICKUP_ORDER_TYPES.includes(full.type);
    const isDelivery = DELIVERY_ORDER_TYPES.includes(full.type);
    await this.sendOrderConfirmationEmailSafely({
      to: recipientEmail,
      customerName: full.customer?.name ?? full.contactName ?? null,
      orderNumber: full.orderNumber,
      restaurantName: restaurant.name,
      createdAt: full.createdAt,
      orderType: full.type,
      isPickup,
      isDelivery,
      branchName: full.branch.name,
      branchAddress: full.branch.address,
      branchPhone: full.branch.phone,
      deliveryAddress: full.deliveryAddressSnapshot
        ? `${full.deliveryAddressSnapshot}${full.deliveryArea ? `, ${full.deliveryArea}` : ""}`
        : null,
      items: full.items.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity, lineTotalPaisa: i.lineTotal })),
      paymentMethod: full.paymentMethod,
      subtotalPaisa: full.subtotal,
      taxPaisa: full.taxAmount,
      deliveryFeePaisa: full.deliveryFee,
      discountPaisa: full.discountAmount + full.couponDiscountAmount,
      loyaltyDiscountPaisa: full.loyaltyDiscountAmount,
      grandTotalPaisa: full.grandTotal,
    });
  }

  private async sendOrderConfirmationEmailSafely(params: Omit<OrderConfirmationEmailParams, "statusUrl">): Promise<void> {
    try {
      const webOrigin = this.config.get("CORS_ORIGINS", { infer: true }).split(",")[0];
      await this.email.sendOrderConfirmationEmail({
        ...params,
        // The guest link naturally expires once the order reaches a terminal status (see
        // getOrderForGuest) — this is a deliberate tradeoff, not a bug, since guest orders have
        // no login to gate access, so the number-based URL can't stay a permanent secret.
        statusUrl: `${webOrigin}/order-confirmation/${params.orderNumber}`,
      });
    } catch (e) {
      this.logger.error(`Failed to send order confirmation email for order ${params.orderNumber}: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * POS orders (Dine-In/Walk-In/Takeaway/Delivery, CLAUDE.md §13): same pricing engine as online
   * orders (no parallel price logic — Rule 8/9), created by a staff member at a branch they're
   * assigned to. Cash is marked PAID immediately; Card/QR stay PENDING until a separate
   * confirm-payment call — a click alone never marks a card/QR payment successful.
   */
  async createPosOrder(staff: StaffJwtPayload, input: CreatePosOrderInput) {
    assertStaffBranchAccess(staff, input.branchId);
    const restaurantId = await this.restaurantContext.getRestaurantId();

    if (input.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return this.getOrderForStaff(staff, existing.id);
    }

    const branch = await this.prisma.branch.findUnique({ where: { id: input.branchId } });
    if (!branch || branch.restaurantId !== restaurantId || branch.status !== "ACTIVE") {
      throw new BadRequestException({ code: "BRANCH_UNAVAILABLE", message: "Selected branch is not available" });
    }
    if (input.type === "DINE_IN" && !branch.dineInEnabled) {
      throw new BadRequestException({ code: "DINE_IN_UNAVAILABLE", message: "Dine-in is not available at this branch" });
    }
    if (input.type === "DELIVERY" && !branch.deliveryEnabled) {
      throw new BadRequestException({ code: "DELIVERY_UNAVAILABLE", message: "Delivery is not available at this branch" });
    }

    let table = null;
    if (input.tableId) {
      table = await this.prisma.restaurantTable.findUnique({ where: { id: input.tableId } });
      if (!table || table.branchId !== branch.id) {
        throw new NotFoundException({ code: "TABLE_NOT_FOUND", message: "Table not found at this branch" });
      }
    }

    const customerId = await this.resolveOrCreateCustomer(restaurantId, input.customerId, input.customerPhone, input.customerName);
    if (customerId) {
      const account = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { status: true } });
      if (account?.status === "INACTIVE") {
        throw new ForbiddenException({ code: "ACCOUNT_BLOCKED", message: "This customer has been blocked from placing orders" });
      }
    } else {
      await this.assertPhoneNotBlocked(restaurantId, input.customerPhone);
    }

    const pricedLines = await this.priceLineItems(branch.id, input.items);
    const subtotal = this.sumLineItems(pricedLines);

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const loyaltyConfig = resolveLoyaltyConfig(restaurant.settings);
    const taxAmount = Math.round(subtotal * (Number(restaurant.defaultTaxPct) / 100));
    const deliveryFee = input.type === "DELIVERY" ? branch.deliveryFee : 0;

    let couponPricing: { couponId: string; code: string; discountAmount: number } | null = null;
    if (input.couponCode) {
      couponPricing = await this.coupons.validateAndPrice({
        restaurantId,
        code: input.couponCode,
        customerId,
        productLines: productLinesFor(pricedLines),
      });
    }
    const couponDiscountAmount = couponPricing?.discountAmount ?? 0;

    let loyaltyDiscountAmount = 0;
    if (customerId && input.loyaltyPointsToRedeem > 0) {
      if (!loyaltyConfig.enabled) {
        throw new BadRequestException({ code: "LOYALTY_DISABLED", message: "The loyalty program is currently unavailable" });
      }
      const loyaltyAccount = await this.prisma.loyaltyAccount.findUnique({ where: { customerId } });
      if (!loyaltyAccount || loyaltyAccount.pointsBalance < input.loyaltyPointsToRedeem) {
        throw new BadRequestException({ code: "INSUFFICIENT_LOYALTY_POINTS", message: "Not enough loyalty points" });
      }
      loyaltyDiscountAmount = input.loyaltyPointsToRedeem * loyaltyConfig.redemptionValuePaisaPerPoint;
    }

    const grandTotal = subtotal + taxAmount + deliveryFee - couponDiscountAmount - loyaltyDiscountAmount;
    if (grandTotal < 0) {
      throw new BadRequestException({ code: "DISCOUNT_EXCEEDS_TOTAL", message: "Discounts cannot exceed the order total" });
    }

    if (input.clientTotal !== undefined && input.clientTotal !== grandTotal) {
      throw new BadRequestException({
        code: "TOTAL_MISMATCH",
        message: "Total is out of date. Please refresh and try again.",
        details: { serverTotal: grandTotal, clientTotal: input.clientTotal },
      });
    }

    if (input.paymentMethod === "CASH" && input.amountTendered !== undefined && input.amountTendered < grandTotal) {
      throw new BadRequestException({ code: "INSUFFICIENT_CASH_TENDERED", message: "Amount tendered is less than the total due" });
    }

    // Dine-in orders stay open/unpaid at placement regardless of the payment-method selector —
    // the customer hasn't paid yet, they're still eating. Real payment happens later via
    // recordPayment/confirmPayment once the bill is requested (see closeDineInOrderIfFullyPaid).
    const isCash = input.paymentMethod === "CASH" && input.type !== "DINE_IN";

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.nextOrderNumber(tx, restaurantId);

      const created = await tx.order.create({
        data: {
          orderNumber,
          restaurantId,
          branchId: branch.id,
          customerId,
          createdByStaffId: staff.sub,
          idempotencyKey: input.idempotencyKey,
          tableId: input.tableId,
          type: input.type,
          source: "POS",
          status: "CONFIRMED",
          paymentMethod: input.paymentMethod,
          paymentStatus: isCash ? "PAID" : "PENDING",
          deliveryAddressSnapshot: input.deliveryAddress?.addressLine,
          deliveryCity: input.deliveryAddress?.city,
          deliveryArea: input.deliveryAddress?.area,
          deliveryLandmark: input.deliveryAddress?.landmark,
          contactName: input.customerName,
          contactPhone: input.customerPhone,
          subtotal,
          taxAmount,
          deliveryFee,
          couponCode: couponPricing?.code,
          couponDiscountAmount,
          loyaltyPointsRedeemed: input.loyaltyPointsToRedeem,
          loyaltyDiscountAmount,
          grandTotal,
          specialInstructions: input.specialInstructions,
        },
      });

      await this.createOrderItems(tx, created.id, branch.id, pricedLines);

      if (couponPricing) {
        await tx.couponRedemption.create({
          data: { couponId: couponPricing.couponId, orderId: created.id, customerId, discountAmount: couponPricing.discountAmount },
        });
      }

      if (customerId && input.loyaltyPointsToRedeem > 0) {
        const loyaltyAccount = await tx.loyaltyAccount.findUniqueOrThrow({ where: { customerId } });
        await tx.loyaltyTransaction.create({
          data: {
            loyaltyAccountId: loyaltyAccount.id,
            type: "REDEEMED",
            points: -input.loyaltyPointsToRedeem,
            orderId: created.id,
            branchId: branch.id,
            note: `Redeemed on order ${orderNumber}`,
          },
        });
        await tx.loyaltyAccount.update({
          where: { id: loyaltyAccount.id },
          data: { pointsBalance: loyaltyAccount.pointsBalance - input.loyaltyPointsToRedeem },
        });
      }

      // Loyalty is earned once the payment actually clears — for cash that's immediate; for
      // card/QR it happens in confirmPayment() instead, never before money is actually in hand.
      if (isCash && customerId) {
        await this.loyalty.awardPoints(tx, {
          customerId,
          orderId: created.id,
          orderNumber,
          branchId: branch.id,
          amountPaisa: grandTotal,
          config: loyaltyConfig,
        });
      }

      // Dine-in gets no Payment row yet at all — there's no real attempt to record until the
      // customer actually requests the bill, and the amount would go stale the moment more items
      // are added anyway. A real Payment row is only ever created later, via recordPayment.
      if (input.type !== "DINE_IN") {
        await tx.payment.create({
          data: {
            orderId: created.id,
            method: input.paymentMethod,
            provider: "pos",
            status: isCash ? "PAID" : "PENDING",
            amount: grandTotal,
            amountTendered: isCash ? input.amountTendered : undefined,
            recordedByStaffId: staff.sub,
            paidAt: isCash ? new Date() : undefined,
          },
        });
      }
      await tx.receipt.create({ data: { orderId: created.id } });

      if (table) {
        await tx.restaurantTable.update({ where: { id: table.id }, data: { status: "OCCUPIED" } });
      }

      return created;
    }, { timeout: 15000 }); // see createOnlineOrder's transaction comment — same sequential-write timeout risk

    const full = await this.getOrderForStaff(staff, order.id);
    this.realtime.emitOrderCreated({ restaurantId, branchId: branch.id, order: full });
    return full;
  }

  /**
   * Server-validated coupon preview — re-prices the cart the same way order creation does, but
   * persists nothing (no CouponRedemption row), so it's safe to call on every keystroke/blur.
   * Per-customer usage limit is only enforced at actual order creation (this preview doesn't
   * require proving who the caller is, to keep it usable from an unauthenticated checkout page).
   */
  async previewCoupon(branchId: string, code: string, items: OrderItemInput[]) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const pricedLines = await this.priceLineItems(branchId, items);
    const result = await this.coupons.validateAndPrice({
      restaurantId,
      code,
      customerId: null,
      productLines: productLinesFor(pricedLines),
    });
    return { couponCode: result.code, discountAmount: result.discountAmount };
  }

  /**
   * "Add Items" (CLAUDE.md §35-38 equivalent): a customer asks for more food after the original
   * order already went to the kitchen. Same order id/number, same pricing engine — the new items
   * are tagged with an OrderRevision so the kitchen ticket can print just what's new.
   *
   * Full recompute, not a delta-increment: subtotal/tax are re-derived from the COMPLETE item set
   * (existing items keep their already-snapshotted price — never re-priced — plus the freshly
   * priced new items), and any already-applied coupon is re-validated against that complete
   * eligible line set so its discount automatically follows newly-added eligible items instead of
   * staying locked to whatever was in the cart when the coupon was first applied. Mirrors
   * recomputeOrderTotalsFromItems's shape (used by removeOrderItem) rather than inventing a new one.
   */
  async addItemsToOrder(staff: StaffJwtPayload, orderId: string, input: AddOrderItemsInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "ORDER_CLOSED", message: "This order is closed and cannot be amended" });
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.orderRevision.findFirst({ where: { orderId, note: `idempotency:${input.idempotencyKey}` } });
      if (existing) return this.getOrderForStaff(staff, orderId);
    }

    const existingItems = await this.prisma.orderItem.findMany({ where: { orderId } });
    const pricedLines = await this.priceLineItems(order.branchId, input.items);
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: order.restaurantId } });

    const newSubtotal = existingItems.reduce((s, i) => s + i.lineTotal, 0) + this.sumLineItems(pricedLines);
    const newTax = Math.round(newSubtotal * (Number(restaurant.defaultTaxPct) / 100));

    let couponDiscountAmount = order.couponDiscountAmount;
    if (order.couponCode) {
      try {
        const existingLines = existingItems
          .filter((i): i is typeof i & { productId: string } => i.productId !== null)
          .map((i) => ({ productId: i.productId, lineTotal: i.lineTotal }));
        const result = await this.coupons.validateAndPrice({
          restaurantId: order.restaurantId,
          code: order.couponCode,
          customerId: order.customerId,
          productLines: [...existingLines, ...productLinesFor(pricedLines)],
        });
        couponDiscountAmount = result.discountAmount;
      } catch {
        // Coupon became invalid since it was first applied (e.g. expired mid-meal) — keep the
        // previous discount rather than blocking the waiter from adding food over an unrelated edge case.
      }
    }

    const previousGrandTotal = order.grandTotal;
    const newGrandTotal = Math.max(
      0,
      newSubtotal + newTax + order.deliveryFee - order.discountAmount - couponDiscountAmount - order.loyaltyDiscountAmount,
    );

    await this.prisma.$transaction(async (tx) => {
      const revision = await tx.orderRevision.create({
        data: {
          orderId,
          staffId: staff.sub,
          previousGrandTotal,
          newGrandTotal,
          note: input.idempotencyKey ? `idempotency:${input.idempotencyKey}` : input.note,
        },
      });

      await this.createOrderItems(tx, orderId, order.branchId, pricedLines, revision.id);

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: newSubtotal,
          taxAmount: newTax,
          couponDiscountAmount,
          grandTotal: newGrandTotal,
          updatedByStaffId: staff.sub,
        },
      });
    });

    await this.recomputeOrderPaymentStatus(orderId);

    await this.auditLogs.recordForStaff(staff, "order.itemsAdded", "Order", orderId, {
      newValue: { itemCount: input.items.length },
    });

    const full = await this.getOrderForStaff(staff, orderId);
    this.realtime.emitOrderItemsAdded({ restaurantId: order.restaurantId, branchId: order.branchId, order: full });
    return full;
  }

  /** Editable contact/delivery-address fields — stored as a snapshot on the order itself (never mutates the customer's saved address book), so history stays intact even if the customer's profile changes later. */
  async updateDeliveryDetails(staff: StaffJwtPayload, orderId: string, input: UpdateOrderDeliveryDetailsInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "ORDER_CLOSED", message: "This order is closed and cannot be amended" });
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactAlternatePhone: input.contactAlternatePhone === "" ? null : input.contactAlternatePhone,
        contactEmail: input.contactEmail === "" ? null : input.contactEmail,
        deliveryAddressSnapshot: input.deliveryAddressSnapshot,
        deliveryCity: input.deliveryCity,
        deliveryArea: input.deliveryArea,
        deliveryLandmark: input.deliveryLandmark === "" ? null : input.deliveryLandmark,
        updatedByStaffId: staff.sub,
      },
    });

    await this.auditLogs.recordForStaff(staff, "order.deliveryDetailsUpdated", "Order", orderId, { newValue: input });
    const full = await this.getOrderForStaff(staff, orderId);
    this.realtime.emitOrderUpdated({ restaurantId: order.restaurantId, branchId: order.branchId, customerId: order.customerId, order: updated });
    return full;
  }

  /**
   * Delivery ↔ Pickup toggle. Only defined within the same source's pair (an online order can
   * only swap between ONLINE_DELIVERY/ONLINE_PICKUP, a POS order between DELIVERY/TAKEAWAY) —
   * there's no sensible equivalent for DINE_IN/WALK_IN, so those are simply not offered.
   * Delivery fee is a flat per-branch amount (not distance-based), so swapping it in/out and
   * re-deriving grandTotal from the order's own stored components is exact, not an estimate.
   */
  async changeOrderType(staff: StaffJwtPayload, orderId: string, input: ChangeOrderTypeInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "ORDER_CLOSED", message: "This order is closed and cannot be amended" });
    }

    const allowedSwap: Partial<Record<string, string>> = {
      ONLINE_DELIVERY: "ONLINE_PICKUP",
      ONLINE_PICKUP: "ONLINE_DELIVERY",
      DELIVERY: "TAKEAWAY",
      TAKEAWAY: "DELIVERY",
    };
    if (allowedSwap[order.type] !== input.type) {
      throw new BadRequestException({ code: "INVALID_TYPE_CHANGE", message: `Cannot change a ${order.type} order to ${input.type}` });
    }

    const becomingDelivery = input.type === "ONLINE_DELIVERY" || input.type === "DELIVERY";
    if (becomingDelivery && !order.deliveryAddressSnapshot) {
      throw new BadRequestException({ code: "ADDRESS_REQUIRED", message: "Set a delivery address before switching this order to delivery" });
    }

    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: order.branchId } });
    const newDeliveryFee = becomingDelivery ? branch.deliveryFee : 0;
    const newGrandTotal = Math.max(
      0,
      order.subtotal + order.taxAmount + newDeliveryFee - order.discountAmount - order.couponDiscountAmount - order.loyaltyDiscountAmount,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.orderRevision.create({
        data: { orderId, staffId: staff.sub, previousGrandTotal: order.grandTotal, newGrandTotal, note: `Order type changed: ${order.type} → ${input.type}` },
      });
      return tx.order.update({
        where: { id: orderId },
        data: { type: input.type, deliveryFee: newDeliveryFee, grandTotal: newGrandTotal, updatedByStaffId: staff.sub },
      });
    });
    await this.recomputeOrderPaymentStatus(orderId);

    await this.auditLogs.recordForStaff(staff, "order.typeChanged", "Order", orderId, { oldValue: { type: order.type }, newValue: { type: input.type } });
    const full = await this.getOrderForStaff(staff, orderId);
    this.realtime.emitOrderUpdated({ restaurantId: order.restaurantId, branchId: order.branchId, customerId: order.customerId, order: updated });
    return full;
  }

  /**
   * Moves an order to a different branch (CLAUDE.md §6/§25 — "never silently change the branch").
   * Requires access to BOTH branches (source, per the usual staff-branch check, and destination —
   * you can't hand an order to a branch you can't also see). Writes an OrderBranchTransfer audit
   * row in the same transaction as the branchId change, mirroring OrderRevision's append-only
   * pattern. Pickup location and delivery ETA are both derived live from order.branch, so no
   * separate field needs updating for those (see OrderDetailModal's Pickup/Delivery sections).
   */
  async transferOrderBranch(staff: StaffJwtPayload, orderId: string, input: TransferOrderBranchInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);
    assertStaffBranchAccess(staff, input.toBranchId);

    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "ORDER_CLOSED", message: "This order is closed and cannot be transferred" });
    }
    if (order.branchId === input.toBranchId) {
      throw new BadRequestException({ code: "SAME_BRANCH", message: "Order is already at this branch" });
    }
    if (order.type === "DINE_IN") {
      throw new BadRequestException({ code: "DINE_IN_NOT_TRANSFERABLE", message: "Dine-in orders are tied to a table and cannot be transferred between branches" });
    }

    const toBranch = await this.prisma.branch.findUnique({ where: { id: input.toBranchId } });
    if (!toBranch || toBranch.restaurantId !== order.restaurantId || toBranch.status !== "ACTIVE") {
      throw new BadRequestException({ code: "BRANCH_UNAVAILABLE", message: "Destination branch is not available" });
    }
    if (DELIVERY_ORDER_TYPES.includes(order.type) && !toBranch.deliveryEnabled) {
      throw new BadRequestException({ code: "DELIVERY_UNAVAILABLE", message: "Destination branch does not offer delivery" });
    }
    if (PICKUP_ORDER_TYPES.includes(order.type) && !toBranch.pickupEnabled) {
      throw new BadRequestException({ code: "PICKUP_UNAVAILABLE", message: "Destination branch does not offer pickup" });
    }

    const fromBranchId = order.branchId;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.orderBranchTransfer.create({
        data: { orderId, fromBranchId, toBranchId: input.toBranchId, transferredByStaffId: staff.sub, note: input.note },
      });
      // A rider assigned at the old branch has no standing at the new one — the new branch picks
      // a rider of their own via the normal "Assign Rider" flow.
      return tx.order.update({
        where: { id: orderId },
        data: { branchId: input.toBranchId, assignedRiderId: null, riderAssignedAt: null, tableId: null, updatedByStaffId: staff.sub },
      });
    });

    await this.auditLogs.recordForStaff(staff, "order.branchTransferred", "Order", orderId, {
      oldValue: { branchId: fromBranchId },
      newValue: { branchId: input.toBranchId, note: input.note },
    });

    const full = await this.getOrderForStaff(staff, orderId);
    this.realtime.emitOrderBranchTransferred({
      restaurantId: order.restaurantId,
      fromBranchId,
      toBranchId: input.toBranchId,
      customerId: order.customerId,
      order: updated,
    });
    return full;
  }

  /** 5-minute-increment delivery ETA adjustment (spec: "do not use arbitrary minute values"). */
  async updateDeliveryEta(staff: StaffJwtPayload, orderId: string, input: UpdateDeliveryEtaInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "ORDER_CLOSED", message: "This order is closed" });
    }

    const eta = new Date(input.estimatedDeliveryAt);
    if (eta.getMinutes() % 5 !== 0 || eta.getSeconds() !== 0) {
      throw new BadRequestException({ code: "INVALID_ETA_INCREMENT", message: "Delivery time must be set in 5-minute increments" });
    }

    const updated = await this.prisma.order.update({ where: { id: orderId }, data: { estimatedDeliveryAt: eta, updatedByStaffId: staff.sub } });
    await this.auditLogs.recordForStaff(staff, "order.deliveryEtaChanged", "Order", orderId, { newValue: { estimatedDeliveryAt: eta } });
    const full = await this.getOrderForStaff(staff, orderId);
    this.realtime.emitOrderUpdated({ restaurantId: order.restaurantId, branchId: order.branchId, customerId: order.customerId, order: updated });
    void this.notifications.notifyDeliveryEtaChanged(
      { id: order.id, restaurantId: order.restaurantId, orderNumber: order.orderNumber, customerId: order.customerId },
      eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
    return full;
  }

  /** Assigns (or clears, if riderId is null) the rider handling this order's delivery. Rider must belong to the order's own branch — a Hyderabad order can't be handed to a DHA rider. */
  async assignRider(staff: StaffJwtPayload, orderId: string, input: AssignRiderInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "ORDER_CLOSED", message: "This order is closed" });
    }

    if (input.riderId) {
      const rider = await this.prisma.staffUser.findUnique({
        where: { id: input.riderId },
        select: { restaurantId: true, role: { select: { name: true } }, branchAssignments: { select: { branchId: true } } },
      });
      if (!rider || rider.restaurantId !== order.restaurantId || rider.role.name !== "Rider") {
        throw new BadRequestException({ code: "RIDER_NOT_FOUND", message: "Rider not found" });
      }
      if (!rider.branchAssignments.some((a) => a.branchId === order.branchId)) {
        throw new BadRequestException({ code: "RIDER_WRONG_BRANCH", message: "This rider is not assigned to the order's branch" });
      }
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { assignedRiderId: input.riderId, riderAssignedAt: input.riderId ? new Date() : null, updatedByStaffId: staff.sub },
    });

    await this.auditLogs.recordForStaff(staff, input.riderId ? "order.riderAssigned" : "order.riderUnassigned", "Order", orderId, { newValue: { riderId: input.riderId } });
    const full = await this.getOrderForStaff(staff, orderId);
    this.realtime.emitOrderUpdated({ restaurantId: order.restaurantId, branchId: order.branchId, customerId: order.customerId, order: updated });
    return full;
  }

  /** Self-service delivery status update — only the rider this order is assigned to (or the Owner) may call this, regardless of branch/permission overrides. */
  async updateRiderDeliveryStatus(staff: StaffJwtPayload, orderId: string, input: UpdateRiderDeliveryStatusInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    if (!staff.isOwner && order.assignedRiderId !== staff.sub) {
      throw new ForbiddenException({ code: "NOT_YOUR_DELIVERY", message: "This order is not assigned to you" });
    }
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "ORDER_CLOSED", message: "This order is already closed" });
    }
    return this.updateOrderStatus(staff, orderId, { status: input.status });
  }

  /** Changes an existing line's quantity and re-derives order totals from the current item set — never trusts a client-submitted total. */
  async updateOrderItemQuantity(staff: StaffJwtPayload, orderId: string, orderItemId: string, input: UpdateOrderItemQuantityInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "ORDER_CLOSED", message: "This order is closed and cannot be amended" });
    }

    const item = await this.prisma.orderItem.findUnique({ where: { id: orderItemId } });
    if (!item || item.orderId !== orderId) throw new NotFoundException({ code: "ORDER_ITEM_NOT_FOUND", message: "Order item not found" });

    await this.prisma.orderItem.update({ where: { id: orderItemId }, data: { quantity: input.quantity, lineTotal: item.unitPrice * input.quantity } });
    await this.recomputeOrderTotalsFromItems(staff, order, `Updated quantity: ${item.nameSnapshot} → ${input.quantity}`);
    await this.auditLogs.recordForStaff(staff, "order.itemQuantityChanged", "Order", orderId, {
      oldValue: { item: item.nameSnapshot, quantity: item.quantity },
      newValue: { item: item.nameSnapshot, quantity: input.quantity },
    });

    const full = await this.getOrderForStaff(staff, orderId);
    this.realtime.emitOrderUpdated({ restaurantId: order.restaurantId, branchId: order.branchId, customerId: order.customerId, order: full });
    return full;
  }

  /**
   * Full reconfigure of an existing product line — quantity, choices, and add-ons all replaced
   * in one shot and re-priced server-side (never trusts a client-sent price). Deal lines aren't
   * supported here (there's no deal-slot equivalent UI for this yet) — use remove + re-add for
   * those. The item keeps its id/position in the order; only its content changes.
   */
  async configureOrderItem(staff: StaffJwtPayload, orderId: string, orderItemId: string, input: OrderItemInput) {
    if (input.kind !== "product") {
      throw new BadRequestException({ code: "DEAL_ITEM_NOT_EDITABLE", message: "Deal items can't be reconfigured — remove and re-add instead" });
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "ORDER_CLOSED", message: "This order is closed and cannot be amended" });
    }

    const existing = await this.prisma.orderItem.findUnique({ where: { id: orderItemId } });
    if (!existing || existing.orderId !== orderId) throw new NotFoundException({ code: "ORDER_ITEM_NOT_FOUND", message: "Order item not found" });
    if (!existing.productId) {
      throw new BadRequestException({ code: "DEAL_ITEM_NOT_EDITABLE", message: "Deal items can't be reconfigured — remove and re-add instead" });
    }

    const priced = await this.productPricing.priceItem(order.branchId, input);

    await this.prisma.orderItem.update({
      where: { id: orderItemId },
      data: {
        productId: priced.productId,
        nameSnapshot: priced.productName,
        quantity: priced.quantity,
        unitPrice: priced.unitPrice,
        regularUnitPrice: priced.regularUnitPrice,
        lineTotal: priced.lineTotal,
        specialInstructions: input.specialInstructions,
        choices: {
          deleteMany: {},
          create: priced.choices.map((c) => ({
            choiceOptionId: c.choiceOptionId,
            nameSnapshot: c.name,
            priceAdjustmentSnapshot: c.priceAdjustment,
            regularPriceAdjustmentSnapshot: c.regularPriceAdjustment,
          })),
        },
        addons: {
          deleteMany: {},
          create: priced.addons.map((a) => ({
            addonId: a.addonId,
            nameSnapshot: a.name,
            priceSnapshot: a.price,
            regularPriceSnapshot: a.regularPrice,
            quantity: a.quantity,
          })),
        },
      },
    });

    await this.recomputeOrderTotalsFromItems(staff, order, `Updated: ${priced.productName}`);
    await this.auditLogs.recordForStaff(staff, "order.itemConfigured", "Order", orderId, { newValue: { item: priced.productName, quantity: priced.quantity } });

    const full = await this.getOrderForStaff(staff, orderId);
    this.realtime.emitOrderUpdated({ restaurantId: order.restaurantId, branchId: order.branchId, customerId: order.customerId, order: full });
    return full;
  }

  /** Removes a line entirely. */
  async removeOrderItem(staff: StaffJwtPayload, orderId: string, orderItemId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "ORDER_CLOSED", message: "This order is closed and cannot be amended" });
    }

    const item = await this.prisma.orderItem.findUnique({ where: { id: orderItemId } });
    if (!item || item.orderId !== orderId) throw new NotFoundException({ code: "ORDER_ITEM_NOT_FOUND", message: "Order item not found" });

    const remainingCount = await this.prisma.orderItem.count({ where: { orderId } });
    if (remainingCount <= 1) {
      throw new BadRequestException({ code: "LAST_ITEM", message: "An order must have at least one item — cancel the order instead" });
    }

    await this.prisma.orderItem.delete({ where: { id: orderItemId } });
    await this.recomputeOrderTotalsFromItems(staff, order, `Removed: ${item.nameSnapshot}`);
    await this.auditLogs.recordForStaff(staff, "order.itemRemoved", "Order", orderId, { oldValue: { item: item.nameSnapshot, lineTotal: item.lineTotal } });

    const full = await this.getOrderForStaff(staff, orderId);
    this.realtime.emitOrderUpdated({ restaurantId: order.restaurantId, branchId: order.branchId, customerId: order.customerId, order: full });
    return full;
  }

  /** Re-derives subtotal/tax/grandTotal from the current item set after a quantity/removal edit, writes a revision, and syncs payment status. Discount/coupon/loyalty amounts stay as their original snapshot (not re-validated against the new subtotal) — grandTotal is clamped at 0 as a safety floor. */
  private async recomputeOrderTotalsFromItems(staff: StaffJwtPayload, order: { id: string; restaurantId: string; grandTotal: number; deliveryFee: number; discountAmount: number; couponDiscountAmount: number; loyaltyDiscountAmount: number }, note: string) {
    const items = await this.prisma.orderItem.findMany({ where: { orderId: order.id } });
    const newSubtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: order.restaurantId } });
    const newTax = Math.round(newSubtotal * (Number(restaurant.defaultTaxPct) / 100));
    const newGrandTotal = Math.max(
      0,
      newSubtotal + newTax + order.deliveryFee - order.discountAmount - order.couponDiscountAmount - order.loyaltyDiscountAmount,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.orderRevision.create({ data: { orderId: order.id, staffId: staff.sub, previousGrandTotal: order.grandTotal, newGrandTotal, note } });
      await tx.order.update({ where: { id: order.id }, data: { subtotal: newSubtotal, taxAmount: newTax, grandTotal: newGrandTotal, updatedByStaffId: staff.sub } });
    });
    await this.recomputeOrderPaymentStatus(order.id);
  }

  /** Collects a payment against an order — used for the remaining balance after items are added, or a split/partial cash+card settlement. */
  async recordPayment(staff: StaffJwtPayload, orderId: string, input: RecordOrderPaymentInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);

    const alreadyPaid = order.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
    const balanceDue = order.grandTotal - alreadyPaid;
    if (input.amount > balanceDue) {
      throw new BadRequestException({ code: "PAYMENT_EXCEEDS_BALANCE", message: `Balance due is only Rs. ${balanceDue / 100}` });
    }
    if (input.method === "CASH" && input.amountTendered !== undefined && input.amountTendered < input.amount) {
      throw new BadRequestException({ code: "INSUFFICIENT_CASH_TENDERED", message: "Amount tendered is less than the payment amount" });
    }

    const isCash = input.method === "CASH";
    await this.prisma.payment.create({
      data: {
        orderId,
        method: input.method,
        provider: "pos",
        status: isCash ? "PAID" : "PENDING",
        amount: input.amount,
        amountTendered: isCash ? input.amountTendered : undefined,
        recordedByStaffId: staff.sub,
        paidAt: isCash ? new Date() : undefined,
      },
    });

    if (isCash) {
      await this.recomputeOrderPaymentStatus(orderId);
      await this.closeDineInOrderIfFullyPaid(orderId);
    }
    await this.auditLogs.recordForStaff(staff, "order.paymentRecorded", "Order", orderId, { newValue: input });

    return this.getOrderForStaff(staff, orderId);
  }

  /** Card/QR payments never flip to PAID from a click alone — this is the explicit confirmation step. */
  async confirmPayment(staff: StaffJwtPayload, orderId: string, input: ConfirmPaymentInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);

    const payment = input.paymentId
      ? await this.prisma.payment.findUnique({ where: { id: input.paymentId } })
      : await this.prisma.payment.findFirst({ where: { orderId, status: "PENDING" }, orderBy: { createdAt: "desc" } });

    if (!payment || payment.orderId !== orderId) {
      throw new NotFoundException({ code: "PAYMENT_NOT_FOUND", message: "No pending payment found for this order" });
    }
    if (payment.status !== "PENDING") {
      throw new BadRequestException({ code: "PAYMENT_NOT_PENDING", message: "This payment has already been settled" });
    }

    const loyaltyConfig = order.customerId ? await this.loyalty.getConfig(order.restaurantId) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID", paidAt: new Date(), recordedByStaffId: staff.sub } });

      if (order.customerId && loyaltyConfig) {
        await this.loyalty.awardPoints(tx, {
          customerId: order.customerId,
          orderId,
          orderNumber: order.orderNumber,
          branchId: order.branchId,
          amountPaisa: payment.amount,
          config: loyaltyConfig,
        });
      }
    });

    await this.recomputeOrderPaymentStatus(orderId);
    await this.closeDineInOrderIfFullyPaid(orderId);
    await this.auditLogs.recordForStaff(staff, "order.paymentConfirmed", "Payment", payment.id, {});

    return this.getOrderForStaff(staff, orderId);
  }

  private async recomputeOrderPaymentStatus(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } });
    const paidTotal = order.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
    const status = paidTotal <= 0 ? "PENDING" : paidTotal >= order.grandTotal ? "PAID" : "PARTIALLY_PAID";
    if (status !== order.paymentStatus) {
      await this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: status } });
    }
  }

  /**
   * A dine-in table's bill is settled the moment its order is fully paid — unlike delivery/pickup,
   * there's no separate "delivered" event to wait for, so payment completion IS the closing event.
   * Reuses the exact status value ("COMPLETED") and table-release shape updateOrderStatus already
   * uses for its own manual terminal-status transition — this is just triggered from the payment
   * path instead of a staff-picked status, scoped strictly to DINE_IN so every other order type's
   * existing status-driven lifecycle is untouched.
   */
  private async closeDineInOrderIfFullyPaid(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.type !== "DINE_IN" || order.paymentStatus !== "PAID" || TERMINAL_STATUSES.includes(order.status)) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: "COMPLETED" } });
      if (order.tableId) await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });
    });
  }

  /**
   * Customer receipt: full billing breakdown + branding, pulled from the restaurant/branch
   * records so nothing is hardcoded. No PDF generation library is installed and there's no
   * server-side print target — the admin renders this as a print-optimized page and calls
   * window.print(), which is the realistic pattern for a thermal receipt printer.
   */
  async getCustomerReceipt(staff: StaffJwtPayload, orderId: string) {
    const order = await this.getOrderForStaff(staff, orderId);
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: order.restaurantId } });
    return { restaurant: this.receiptBranding(restaurant), order };
  }

  /**
   * Kitchen ticket: preparation info only (no pricing/coupon/customer-email noise). Scoping:
   *  - no params            → original order items only (what the kitchen first saw)
   *  - revisionId given     → just that amendment's items ("ADDITIONAL ITEMS" ticket)
   *  - full=true            → every item regardless of revision ("Reprint Full Kitchen Order")
   * This is what stops an "Add Items" amendment from making the kitchen re-prepare everything.
   */
  async getKitchenReceipt(staff: StaffJwtPayload, orderId: string, opts: { revisionId?: string; full?: boolean }) {
    const order = await this.getOrderForStaff(staff, orderId);
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: order.restaurantId } });

    let items = order.items;
    let revision: (typeof order.revisions)[number] | null = null;
    let isAdditional = false;
    if (opts.revisionId) {
      revision = order.revisions.find((r) => r.id === opts.revisionId) ?? null;
      if (!revision) throw new NotFoundException({ code: "REVISION_NOT_FOUND", message: "Order revision not found" });
      items = items.filter((i) => i.orderRevisionId === opts.revisionId);
      isAdditional = true;
    } else if (!opts.full) {
      // Default mode: "whatever the kitchen hasn't already been sent," not just "original items" —
      // otherwise a second, third, fourth round of added items would each need the caller to know
      // and pass the exact right revisionId. Since every kitchen print is logged as a PrintEvent,
      // anything created after the most recent one is unprinted, regardless of how many separate
      // addItemsToOrder calls happened in between (CLAUDE.md: never resend items already sent).
      const lastKitchenPrint = await this.prisma.printEvent.findFirst({
        where: { orderId, type: { in: ["KITCHEN", "KITCHEN_ADDITIONAL"] }, status: "PRINTED" },
        orderBy: { createdAt: "desc" },
      });
      if (!lastKitchenPrint) {
        items = items.filter((i) => i.orderRevisionId == null);
      } else {
        const freshRevisionIds = new Set(order.revisions.filter((r) => r.createdAt > lastKitchenPrint.createdAt).map((r) => r.id));
        items = items.filter((i) => i.orderRevisionId && freshRevisionIds.has(i.orderRevisionId));
        isAdditional = true;
      }
    }

    return {
      restaurant: {
        name: restaurant.name,
        kitchenReceiptHeaderText: restaurant.kitchenReceiptHeaderText,
        kitchenReceiptFooterText: restaurant.kitchenReceiptFooterText,
      },
      order: { ...order, items },
      isAdditional,
      isFullReprint: !!opts.full,
    };
  }

  async logPrintEvent(staff: StaffJwtPayload, orderId: string, input: LogPrintEventInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);

    return this.prisma.printEvent.create({
      data: { orderId, type: input.type, status: input.status, revisionId: input.revisionId, staffId: staff.sub },
    });
  }

  async listPrintEvents(staff: StaffJwtPayload, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);

    return this.prisma.printEvent.findMany({
      where: { orderId },
      include: { staff: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  private receiptBranding(restaurant: {
    name: string;
    logoUrl: string | null;
    receiptLogoUrl: string | null;
    receiptTaxNumber: string | null;
    currency: string;
    contactPhone: string | null;
    contactEmail: string | null;
    socialLinks: unknown;
    receiptFooterText: string | null;
    receiptThankYouMessage: string | null;
  }) {
    return {
      name: restaurant.name,
      // A dedicated receipt logo (often a simplified black & white mark) falls back to the
      // main logo so nothing renders blank just because this optional field was never set.
      logoUrl: restaurant.receiptLogoUrl ?? restaurant.logoUrl,
      taxNumber: restaurant.receiptTaxNumber,
      currency: restaurant.currency,
      contactPhone: restaurant.contactPhone,
      contactEmail: restaurant.contactEmail,
      socialLinks: restaurant.socialLinks,
      footerText: restaurant.receiptFooterText,
      thankYouMessage: restaurant.receiptThankYouMessage,
    };
  }

  /**
   * A phone with no Customer row at all is never blocked (nothing to check against) — a pure
   * guest checkout only becomes blockable once an admin blocks it, which materializes a real
   * Customer row for that phone (see CustomersService.blockGuestPhone). Once that row exists,
   * this check catches it here regardless of channel — guest online checkout or POS walk-in.
   */
  private async assertPhoneNotBlocked(restaurantId: string, phone: string | undefined): Promise<void> {
    if (!phone) return;
    const existing = await this.prisma.customer.findUnique({
      where: { restaurantId_phone: { restaurantId, phone } },
      select: { status: true },
    });
    if (existing?.status === "INACTIVE") {
      throw new ForbiddenException({ code: "PHONE_BLOCKED", message: "This phone number has been blocked from placing orders. Please contact the restaurant." });
    }
  }

  /** Looks up an existing customer by explicit id or phone; creates a lightweight profile on the fly if a phone+name is given and none exists, so repeat POS customers build real order/loyalty history instead of duplicating records. */
  private async resolveOrCreateCustomer(
    restaurantId: string,
    customerId: string | undefined,
    phone: string | undefined,
    name: string | undefined,
  ): Promise<string | null> {
    if (customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer || customer.restaurantId !== restaurantId) {
        throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      return customer.id;
    }
    if (!phone) return null;

    const existing = await this.prisma.customer.findUnique({ where: { restaurantId_phone: { restaurantId, phone } } });
    if (existing) return existing.id;
    if (!name) return null; // phone alone isn't enough to create a profile — stays a guest/unidentified order

    // Walk-in/POS profiles are created without ever going through email OTP — phone is already
    // unique per restaurant, so a placeholder built from it satisfies the (now required, unique)
    // email column without colliding across customers. passwordHash stays unset: this customer
    // never logs in with a password, only OTP if they later claim the profile with a real email.
    const created = await this.prisma.customer.create({
      data: { restaurantId, name, phone, email: `pos-${phone}@placeholder.internal` },
    });
    return created.id;
  }

  // ---------- Staff-facing order management (admin dashboard, kitchen) ----------

  async listOrdersForStaff(
    staff: StaffJwtPayload,
    filters: {
      branchId?: string;
      status?: OrderStatus;
      source?: OrderSource;
      type?: string;
      paymentStatus?: string;
      search?: string;
      from?: string;
      to?: string;
      customerId?: string;
      contactPhone?: string;
    },
    take = 500,
  ) {
    if (filters.branchId) assertStaffBranchAccess(staff, filters.branchId);
    // `to` arrives as a date-only string (YYYY-MM-DD) from the <input type="date"> picker — parsed
    // literally it's UTC midnight, which would exclude every order placed later that same day.
    // Advance to the start of the next day and use an exclusive upper bound instead.
    const toExclusive = filters.to ? new Date(new Date(filters.to).getTime() + 24 * 60 * 60 * 1000) : undefined;
    return this.prisma.order.findMany({
      where: {
        branchId: filters.branchId ?? (staff.isOwner ? undefined : { in: staff.branchIds }),
        status: filters.status,
        source: filters.source,
        type: filters.type as never,
        paymentStatus: filters.paymentStatus as never,
        createdAt: filters.from || toExclusive ? { gte: filters.from ? new Date(filters.from) : undefined, lt: toExclusive } : undefined,
        // Powers the admin customer-detail order history. `customerId` alone for a normal
        // registered profile. `contactPhone` alone (with customerId forced null) for a pure
        // guest identity that never got a Customer record. Both together for an isGuest profile
        // whose id now exists (e.g. a blocked guest phone was just materialized into a real
        // Customer row) — its *older* orders are still only tagged by contactPhone since blocking
        // never retroactively relinks history, so an AND here would hide exactly the order
        // history an admin is blocking someone to go look at.
        ...(filters.customerId && filters.contactPhone
          ? { OR: [{ customerId: filters.customerId }, { customerId: null, contactPhone: filters.contactPhone }] }
          : filters.customerId
            ? { customerId: filters.customerId }
            : filters.contactPhone
              ? { customerId: null, contactPhone: filters.contactPhone }
              : {}),
        ...(filters.search
          ? {
              OR: [
                { orderNumber: { contains: filters.search, mode: "insensitive" } },
                { contactName: { contains: filters.search, mode: "insensitive" } },
                { contactPhone: { contains: filters.search } },
                { customer: { name: { contains: filters.search, mode: "insensitive" } } },
                { customer: { phone: { contains: filters.search } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        branch: true,
        table: true,
        customer: { select: { name: true, phone: true } },
        assignedRider: { select: { name: true } },
      },
      // Defense-in-depth: even if the admin UI's default date window is bypassed (e.g. a direct
      // API call with no range), never let one query pull unbounded history off the DB.
      take,
    });
  }

  async exportOrdersCsv(
    staff: StaffJwtPayload,
    filters: { branchId?: string; status?: OrderStatus; source?: OrderSource; type?: string; paymentStatus?: string; search?: string; from?: string; to?: string },
  ): Promise<string> {
    // Export is a deliberate, one-off admin action (not a page-load) — give it a much higher
    // ceiling than the list view's default so a real report never gets silently truncated.
    const orders = await this.listOrdersForStaff(staff, filters, 20_000);
    const header = ["Order #", "Date", "Branch", "Source", "Type", "Status", "Payment Method", "Payment Status", "Customer", "Phone", "Grand Total (Rs.)"];
    const rows = orders.map((o) => [
      o.orderNumber,
      o.createdAt.toISOString(),
      o.branch.name,
      o.source,
      o.type,
      o.status,
      o.paymentMethod,
      o.paymentStatus,
      o.customer?.name ?? "",
      o.customer?.phone ?? "",
      (o.grandTotal / 100).toFixed(2),
    ]);
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    return [header, ...rows].map((row) => row.map((cell) => escape(String(cell))).join(",")).join("\n");
  }

  async getOrderForStaff(staff: StaffJwtPayload, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: this.orderIncludes() });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);
    return order;
  }

  async updateOrderStatus(staff: StaffJwtPayload, orderId: string, input: UpdateOrderStatusInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    assertStaffBranchAccess(staff, order.branchId);

    // Cancel/refund are destructive/financial actions — require the specific permission on top
    // of the general orders.edit that gates this endpoint (a cashier who can advance PREPARING
    // → READY shouldn't automatically be able to cancel or refund an order).
    if (input.status === "CANCELLED" && !(await this.permissionsCheck.hasPermission(staff, "orders.cancel"))) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Missing permission: orders.cancel" });
    }
    if (input.status === "REFUNDED" && !(await this.permissionsCheck.hasPermission(staff, "orders.refund"))) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Missing permission: orders.refund" });
    }

    // "Accept" is nothing more than the Admin-only PENDING → CONFIRMED transition — this is what
    // sends the confirmation email and the accompanying customer notification/push. Every other
    // transition never emails.
    const isAccepting = order.status === "PENDING" && input.status === "CONFIRMED";

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: orderId },
        data: { status: input.status, internalNotes: input.internalNotes, updatedByStaffId: staff.sub },
      });

      // Free the table once the order reaches a terminal state — a table occupied at POS
      // creation never released itself otherwise.
      if (order.tableId && TERMINAL_STATUSES.includes(input.status)) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });
      }

      return result;
    });

    await this.notifications.notifyOrderStatusChanged(updated, { isAccepting });

    this.realtime.emitOrderStatusChanged({
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      customerId: order.customerId,
      order: updated,
    });

    if (isAccepting) {
      void this.sendAcceptanceEmailIfApplicable(orderId, order.restaurantId);
    }

    return updated;
  }

  /** One shared counter across every source — ORD-YYYYMMDD-#### regardless of whether the order came from the website or POS. */
  private async nextOrderNumber(tx: Prisma.TransactionClient, restaurantId: string): Promise<string> {
    const seq = await tx.restaurantOrderSequence.upsert({
      where: { restaurantId },
      create: { restaurantId, nextValue: 1 },
      update: { nextValue: { increment: 1 } },
    });
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `ORD-${datePart}-${String(seq.nextValue).padStart(4, "0")}`;
  }

  private async priceLineItems(branchId: string, items: OrderItemInput[]): Promise<PricedLine[]> {
    const pricedLines: PricedLine[] = [];
    for (const item of items) {
      if (item.kind === "product") {
        const priced = await this.productPricing.priceItem(branchId, item);
        pricedLines.push({ kind: "product", input: item, priced });
      } else {
        const dealAvailability = await this.prisma.dealBranchAvailability.findUnique({
          where: { dealId_branchId: { dealId: item.dealId, branchId } },
        });
        if (!dealAvailability?.isAvailable) {
          throw new BadRequestException({ code: "DEAL_UNAVAILABLE_AT_BRANCH", message: "This deal is not available at the selected branch" });
        }
        const priced = await this.dealPricing.priceSelections(item.dealId, item.selections);
        pricedLines.push({ kind: "deal", input: item, priced });
      }
    }
    return pricedLines;
  }

  private sumLineItems(pricedLines: PricedLine[]): number {
    return pricedLines.reduce((sum, line) => {
      return sum + (line.kind === "product" ? line.priced.lineTotal : line.priced.dealPrice * line.input.quantity);
    }, 0);
  }

  private async createOrderItems(
    tx: Prisma.TransactionClient,
    orderId: string,
    branchId: string,
    pricedLines: PricedLine[],
    orderRevisionId?: string,
  ) {
    for (const line of pricedLines) {
      if (line.kind === "product") {
        await tx.orderItem.create({
          data: {
            orderId,
            orderRevisionId,
            productId: line.priced.productId,
            nameSnapshot: line.priced.productName,
            quantity: line.priced.quantity,
            unitPrice: line.priced.unitPrice,
            regularUnitPrice: line.priced.regularUnitPrice,
            lineTotal: line.priced.lineTotal,
            specialInstructions: line.input.specialInstructions,
            choices: {
              create: line.priced.choices.map((c) => ({
                choiceOptionId: c.choiceOptionId,
                nameSnapshot: c.name,
                priceAdjustmentSnapshot: c.priceAdjustment,
                regularPriceAdjustmentSnapshot: c.regularPriceAdjustment,
              })),
            },
            addons: {
              create: line.priced.addons.map((a) => ({
                addonId: a.addonId,
                nameSnapshot: a.name,
                priceSnapshot: a.price,
                regularPriceSnapshot: a.regularPrice,
                quantity: a.quantity,
              })),
            },
          },
        });
      } else {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId,
            orderRevisionId,
            dealId: line.priced.dealId,
            nameSnapshot: line.priced.dealName,
            quantity: line.input.quantity,
            unitPrice: line.priced.dealPrice,
            regularUnitPrice: line.priced.originalPrice,
            lineTotal: line.priced.dealPrice * line.input.quantity,
            specialInstructions: line.input.specialInstructions,
          },
        });

        for (const slot of line.priced.slots) {
          await tx.orderItemDealSlot.create({
            data: {
              orderItemId: orderItem.id,
              dealSlotId: slot.dealSlotId,
              productId: slot.productId,
              nameSnapshot: slot.productName,
              choices: {
                create: slot.choices.map((c) => ({
                  choiceOptionId: c.choiceOptionId,
                  nameSnapshot: c.name,
                  priceAdjustmentSnapshot: c.priceAdjustment,
                  regularPriceAdjustmentSnapshot: c.regularPriceAdjustment,
                })),
              },
              addons: {
                create: slot.addons.map((a) => ({
                  addonId: a.addonId,
                  nameSnapshot: a.name,
                  priceSnapshot: a.price,
                  regularPriceSnapshot: a.regularPrice,
                  quantity: a.quantity,
                })),
              },
            },
          });
        }
      }
    }
  }

  /** URL-facing lookups use the human-readable orderNumber, not the raw db id — ownership is verified via the JWT, so no expiry needed here: a registered customer's own order history stays permanently reachable. */
  async getOrderForCustomer(customerId: string, orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: this.orderIncludes(),
    });
    if (!order || order.customerId !== customerId) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    }
    return stripStaffOnlyOrderFields(order);
  }

  /**
   * Guest orders have no account to own them, and (per explicit product decision) the
   * orderNumber in the URL is sequential/guessable — unlike the old raw cuid, it's not a safe
   * standalone access credential. So a guest order's confirmation/tracking link only works while
   * the order is still active; once it reaches a terminal state (delivered, completed, cancelled,
   * or refunded) the link expires and 404s even with the exact correct orderNumber, closing the
   * window an attacker could use to enumerate completed orders' names/phones/addresses.
   */
  async getOrderForGuest(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: this.orderIncludes(),
    });
    if (!order || order.customerId) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    }
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new NotFoundException({ code: "ORDER_ACCESS_EXPIRED", message: "This order is complete and its tracking link has expired." });
    }
    return stripStaffOnlyOrderFields(order);
  }

  /** Order-scoped Web Push opt-in from the tracking/confirmation page — works for guests too, since it's keyed by orderId, not a customer account. */
  async subscribeToPush(orderNumber: string, subscription: PushSubscribeInput) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber }, select: { id: true } });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found" });
    await this.push.subscribe(order.id, subscription);
  }

  async listOrdersForCustomer(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: { items: true, branch: true },
    });
  }

  private orderIncludes() {
    return {
      branch: true,
      table: true,
      customer: { select: { id: true, name: true, phone: true, email: true } },
      assignedRider: { select: { id: true, name: true, phone: true } },
      items: {
        include: {
          product: true,
          deal: true,
          choices: true,
          addons: true,
          dealSlots: { include: { choices: true, addons: true } },
        },
      },
      payments: true,
      receipt: true,
      revisions: { orderBy: { createdAt: "asc" as const } },
      branchTransfers: {
        orderBy: { createdAt: "asc" as const },
        include: { fromBranch: { select: { id: true, name: true } }, toBranch: { select: { id: true, name: true } }, transferredByStaff: { select: { name: true } } },
      },
      couponRedemption: true,
    };
  }
}
