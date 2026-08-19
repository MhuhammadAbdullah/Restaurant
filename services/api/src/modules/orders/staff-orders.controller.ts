import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  addOrderItemsSchema,
  assignRiderSchema,
  changeOrderTypeSchema,
  confirmPaymentSchema,
  logPrintEventSchema,
  orderItemInputSchema,
  recordOrderPaymentSchema,
  transferOrderBranchSchema,
  updateDeliveryEtaSchema,
  updateOrderDeliveryDetailsSchema,
  updateOrderItemQuantitySchema,
  updateOrderStatusSchema,
  updateRiderDeliveryStatusSchema,
  type AddOrderItemsInput,
  type AssignRiderInput,
  type ChangeOrderTypeInput,
  type ConfirmPaymentInput,
  type LogPrintEventInput,
  type OrderItemInput,
  type RecordOrderPaymentInput,
  type TransferOrderBranchInput,
  type UpdateDeliveryEtaInput,
  type UpdateOrderDeliveryDetailsInput,
  type UpdateOrderItemQuantityInput,
  type UpdateOrderStatusInput,
  type UpdateRiderDeliveryStatusInput,
} from "@restaurant/validation";
import type { OrderSource, OrderStatus } from "@restaurant/database";
import type { StaffJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { OrdersService } from "./orders.service";

@Controller("staff/orders")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class StaffOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly auditLogs: AuditLogService,
  ) {}

  @RequirePermission("orders.view")
  @Get()
  async list(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("branchId") branchId?: string,
    @Query("status") status?: OrderStatus,
    @Query("source") source?: OrderSource,
    @Query("type") type?: string,
    @Query("paymentStatus") paymentStatus?: string,
    @Query("search") search?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("take") take?: string,
    @Query("customerId") customerId?: string,
    @Query("contactPhone") contactPhone?: string,
  ) {
    // Optional cap for callers that only need a small slice (e.g. a dashboard "recent orders"
    // widget) — never allowed above the list view's own default ceiling.
    const data = await this.orders.listOrdersForStaff(
      staff,
      { branchId, status, source, type, paymentStatus, search, from, to, customerId, contactPhone },
      take ? Math.min(Number(take), 500) : undefined,
    );
    return { success: true, data };
  }

  @RequirePermission("orders.export")
  @Get("export.csv")
  async exportCsv(
    @CurrentStaff() staff: StaffJwtPayload,
    @Res() res: Response,
    @Query("branchId") branchId?: string,
    @Query("status") status?: OrderStatus,
    @Query("source") source?: OrderSource,
    @Query("type") type?: string,
    @Query("paymentStatus") paymentStatus?: string,
    @Query("search") search?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const csv = await this.orders.exportOrdersCsv(staff, { branchId, status, source, type, paymentStatus, search, from, to });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @RequirePermission("orders.view")
  @Get(":id")
  async findOne(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const data = await this.orders.getOrderForStaff(staff, id);
    return { success: true, data };
  }

  /** Unified status-history timeline — derived from AuditLog (no separate table), same branch scoping as the order itself. */
  @RequirePermission("orders.view")
  @Get(":id/history")
  async history(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    await this.orders.getOrderForStaff(staff, id); // branch-scope + existence check
    const data = await this.auditLogs.listForOrder(id);
    return { success: true, data };
  }

  @RequirePermission("orders.edit")
  @Patch(":id/status")
  async updateStatus(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOrderStatusSchema)) body: UpdateOrderStatusInput,
    @Req() req: Request,
  ) {
    const before = await this.orders.getOrderForStaff(staff, id);
    const data = await this.orders.updateOrderStatus(staff, id, body);
    const action = body.status === "CANCELLED" ? "order.cancel" : body.status === "REFUNDED" ? "order.refund" : "order.statusChange";
    await this.auditLogs.recordForStaff(
      staff,
      action,
      "Order",
      id,
      { oldValue: { status: before.status }, newValue: { status: body.status } },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    return { success: true, data };
  }

  @RequirePermission("pos.access")
  @Post(":id/items")
  async addItems(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addOrderItemsSchema)) body: AddOrderItemsInput,
  ) {
    const data = await this.orders.addItemsToOrder(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("orders.edit")
  @Patch(":id/items/:itemId")
  async updateItemQuantity(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateOrderItemQuantitySchema)) body: UpdateOrderItemQuantityInput,
  ) {
    const data = await this.orders.updateOrderItemQuantity(staff, id, itemId, body);
    return { success: true, data };
  }

  @RequirePermission("orders.edit")
  @Patch(":id/items/:itemId/configure")
  async configureItem(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(orderItemInputSchema)) body: OrderItemInput,
  ) {
    const data = await this.orders.configureOrderItem(staff, id, itemId, body);
    return { success: true, data };
  }

  @RequirePermission("orders.edit")
  @Delete(":id/items/:itemId")
  async removeItem(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string, @Param("itemId") itemId: string) {
    const data = await this.orders.removeOrderItem(staff, id, itemId);
    return { success: true, data };
  }

  @RequirePermission("orders.edit")
  @Patch(":id/delivery-details")
  async updateDeliveryDetails(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOrderDeliveryDetailsSchema)) body: UpdateOrderDeliveryDetailsInput,
  ) {
    const data = await this.orders.updateDeliveryDetails(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("orders.edit")
  @Patch(":id/type")
  async changeType(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(changeOrderTypeSchema)) body: ChangeOrderTypeInput,
  ) {
    const data = await this.orders.changeOrderType(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("orders.transfer")
  @Patch(":id/transfer")
  async transferBranch(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(transferOrderBranchSchema)) body: TransferOrderBranchInput,
  ) {
    const data = await this.orders.transferOrderBranch(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("orders.edit")
  @Patch(":id/delivery-eta")
  async updateDeliveryEta(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDeliveryEtaSchema)) body: UpdateDeliveryEtaInput,
  ) {
    const data = await this.orders.updateDeliveryEta(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("riders.assign")
  @Patch(":id/rider")
  async assignRider(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignRiderSchema)) body: AssignRiderInput,
  ) {
    const data = await this.orders.assignRider(staff, id, body);
    return { success: true, data };
  }

  /** Self-service delivery status update for the rider currently assigned to this order (no orders.edit needed — ownership is checked in the service). */
  @RequirePermission("orders.updateDeliveryStatus")
  @Patch(":id/rider-status")
  async updateRiderDeliveryStatus(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRiderDeliveryStatusSchema)) body: UpdateRiderDeliveryStatusInput,
  ) {
    const data = await this.orders.updateRiderDeliveryStatus(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("pos.access")
  @Post(":id/payments")
  async recordPayment(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recordOrderPaymentSchema)) body: RecordOrderPaymentInput,
  ) {
    const data = await this.orders.recordPayment(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("pos.access")
  @Post(":id/confirm-payment")
  async confirmPayment(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(confirmPaymentSchema)) body: ConfirmPaymentInput,
  ) {
    const data = await this.orders.confirmPayment(staff, id, body);
    return { success: true, data };
  }

  @RequirePermission("orders.view")
  @Get(":id/receipt/customer")
  async customerReceipt(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const data = await this.orders.getCustomerReceipt(staff, id);
    return { success: true, data };
  }

  @RequirePermission("orders.view")
  @Get(":id/receipt/kitchen")
  async kitchenReceipt(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Query("revisionId") revisionId?: string,
    @Query("full") full?: string,
  ) {
    const data = await this.orders.getKitchenReceipt(staff, id, { revisionId, full: full === "true" });
    return { success: true, data };
  }

  @RequirePermission("orders.view")
  @Get(":id/print-events")
  async printEvents(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    const data = await this.orders.listPrintEvents(staff, id);
    return { success: true, data };
  }

  @RequirePermission("orders.view")
  @Post(":id/print-events")
  async logPrintEvent(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(logPrintEventSchema)) body: LogPrintEventInput,
  ) {
    const data = await this.orders.logPrintEvent(staff, id, body);
    return { success: true, data };
  }
}
