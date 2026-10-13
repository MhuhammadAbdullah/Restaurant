import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import {
  adjustStockSchema,
  bulkIdsSchema,
  bulkItemsSchema,
  createInventoryItemSchema,
  createPurchaseOrderSchema,
  createTransferSchema,
  receivePurchaseOrderSchema,
  supplierSchema,
  updateInventoryItemSchema,
  updatePurchaseOrderSchema,
  updateSupplierSchema,
  type AdjustStockInput,
  type BulkIdsInput,
  type BulkItemsInput,
  type CreateInventoryItemInput,
  type CreatePurchaseOrderInput,
  type CreateTransferInput,
  type ReceivePurchaseOrderInput,
  type SupplierInput,
  type UpdateInventoryItemInput,
  type UpdatePurchaseOrderInput,
} from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { BadRequestException } from "@nestjs/common";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { InventoryService } from "./inventory.service";
import { InventoryOpsService } from "./inventory-ops.service";

const branchLevelSchema = z.object({ branchId: z.string().min(1), level: z.number().min(0).max(100_000_000).nullable() });
type BranchLevelInput = z.infer<typeof branchLevelSchema>;
const statusSchema = z.object({ status: z.enum(["ORDERED", "CANCELLED"]) });

@Controller("inventory")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly ops: InventoryOpsService,
    private readonly audit: AuditLogService,
  ) {}

  private log(staff: StaffJwtPayload, req: Request, action: string, entity: string, id: string, value: unknown) {
    return this.audit.recordForStaff(staff, action, entity, id, { newValue: value as never }, { ip: req.ip, userAgent: req.headers["user-agent"] });
  }

  // ---- stock overview
  // The stock list also feeds the item pickers of purchases, transfers and history, so those pages may read it too.
  @RequirePermission("inventoryStock.view", "inventoryPurchases.view", "inventoryTransfers.view", "inventoryHistory.view")
  @Get("stock")
  async stock(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId?: string, @Query("search") search?: string, @Query("onlyLow") onlyLow?: string, @Query("includeInactive") includeInactive?: string) {
    return { success: true, data: await this.inventory.listStock(staff, branchId || undefined, { search: search || undefined, onlyLow: onlyLow === "true", includeInactive: includeInactive === "true" }) };
  }

  @RequirePermission("inventoryStock.view")
  @Get("summary")
  async summary(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId?: string) {
    return { success: true, data: await this.inventory.summary(staff, branchId || undefined) };
  }

  // ---- items
  @RequirePermission("inventoryStock.create")
  @Post("items/bulk")
  async bulkItems(@Body(new ZodValidationPipe(bulkItemsSchema)) body: BulkItemsInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.inventory.bulkCreate(staff, body);
    await this.log(staff, req, "inventory.item.bulkCreate", "InventoryItem", "bulk", data);
    return { success: true, data };
  }

  @RequirePermission("inventoryStock.create")
  @Post("items")
  async createItem(@Body(new ZodValidationPipe(createInventoryItemSchema)) body: CreateInventoryItemInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.inventory.createItem(body);
    await this.log(staff, req, "inventory.item.create", "InventoryItem", data.id, { name: data.name, unit: data.unit });
    return { success: true, data };
  }

  @RequirePermission("inventoryStock.edit")
  @Patch("items/:id")
  async updateItem(@Param("id") id: string, @Body(new ZodValidationPipe(updateInventoryItemSchema)) body: UpdateInventoryItemInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.inventory.updateItem(id, body);
    await this.log(staff, req, "inventory.item.update", "InventoryItem", id, body);
    return { success: true, data };
  }

  @RequirePermission("inventoryStock.delete")
  @Post("items/bulk-delete")
  async removeItems(@Body(new ZodValidationPipe(bulkIdsSchema)) body: BulkIdsInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.inventory.removeItems(body.ids);
    await this.log(staff, req, "inventory.item.bulkDelete", "InventoryItem", "bulk", { ids: body.ids, ...data });
    return { success: true, data };
  }

  @RequirePermission("inventoryStock.delete")
  @Delete("items/:id")
  async removeItem(@Param("id") id: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.inventory.removeItem(id);
    await this.log(staff, req, "inventory.item.delete", "InventoryItem", id, data);
    return { success: true, data };
  }

  // ---- stock changes
  @RequirePermission("inventoryStock.edit")
  @Post("stock/adjust")
  async adjust(@Body(new ZodValidationPipe(adjustStockSchema)) body: AdjustStockInput, @CurrentStaff() staff: StaffJwtPayload) {
    return { success: true, data: await this.inventory.adjust(staff, body) };
  }

  @RequirePermission("inventoryStock.edit")
  @Put("stock/min-level")
  async branchLevel(@Body(new ZodValidationPipe(branchLevelSchema)) body: BranchLevelInput & { itemId?: string }, @CurrentStaff() staff: StaffJwtPayload, @Query("itemId") itemId?: string) {
    if (!itemId) throw new BadRequestException({ code: "ITEM_REQUIRED", message: "itemId is required" });
    return { success: true, data: await this.inventory.setBranchMinLevel(staff, body.branchId, itemId, body.level) };
  }

  @RequirePermission("inventoryHistory.view")
  @Get("movements")
  async movements(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query("branchId") branchId?: string,
    @Query("itemId") itemId?: string,
    @Query("type") type?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return { success: true, data: await this.inventory.movements(staff, { branchId: branchId || undefined, itemId: itemId || undefined, type: type || undefined, from: from || undefined, to: to || undefined, page: Number(page) || 1, pageSize: Number(pageSize) || 25 }) };
  }

  @RequirePermission("inventoryHistory.view")
  @Get("reconcile")
  async reconcile(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId?: string) {
    return { success: true, data: await this.inventory.reconcile(staff, branchId || undefined) };
  }

  @RequirePermission("inventoryReports.view")
  @Get("reports")
  async report(@CurrentStaff() staff: StaffJwtPayload, @Query("from") from: string, @Query("to") to: string, @Query("branchId") branchId?: string) {
    const f = from && !Number.isNaN(Date.parse(from)) ? from : new Date(Date.now() - 30 * 86_400_000).toISOString();
    const t = to && !Number.isNaN(Date.parse(to)) ? to : new Date().toISOString();
    return { success: true, data: await this.inventory.report(staff, { branchId: branchId || undefined, from: f, to: t }) };
  }

  // ---- suppliers
  @RequirePermission("inventorySuppliers.view", "inventoryPurchases.view")
  @Get("suppliers")
  async suppliers(@Query("includeInactive") includeInactive?: string) {
    return { success: true, data: await this.ops.listSuppliers(includeInactive === "true") };
  }

  @RequirePermission("inventorySuppliers.create")
  @Post("suppliers")
  async createSupplier(@Body(new ZodValidationPipe(supplierSchema)) body: SupplierInput) {
    return { success: true, data: await this.ops.createSupplier(body) };
  }

  @RequirePermission("inventorySuppliers.edit")
  @Patch("suppliers/:id")
  async updateSupplier(@Param("id") id: string, @Body(new ZodValidationPipe(updateSupplierSchema)) body: Partial<SupplierInput>) {
    return { success: true, data: await this.ops.updateSupplier(id, body) };
  }

  @RequirePermission("inventorySuppliers.delete")
  @Post("suppliers/bulk-delete")
  async removeSuppliers(@Body(new ZodValidationPipe(bulkIdsSchema)) body: BulkIdsInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.ops.removeSuppliers(body.ids);
    await this.log(staff, req, "inventory.supplier.bulkDelete", "Supplier", "bulk", { ids: body.ids, ...data });
    return { success: true, data };
  }

  @RequirePermission("inventorySuppliers.delete")
  @Delete("suppliers/:id")
  async removeSupplier(@Param("id") id: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.ops.removeSupplier(id);
    await this.log(staff, req, "inventory.supplier.delete", "Supplier", id, data);
    return { success: true, data };
  }

  // ---- purchase orders
  @RequirePermission("inventoryPurchases.view")
  @Get("purchase-orders")
  async purchaseOrders(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId?: string, @Query("status") status?: string) {
    return { success: true, data: await this.ops.listPurchaseOrders(staff, { branchId: branchId || undefined, status: status || undefined }) };
  }

  @RequirePermission("inventoryPurchases.create")
  @Post("purchase-orders")
  async createPurchaseOrder(@Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: CreatePurchaseOrderInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.ops.createPurchaseOrder(staff, body);
    await this.log(staff, req, "inventory.po.create", "PurchaseOrder", data.id, { number: data.number });
    return { success: true, data };
  }

  @RequirePermission("inventoryPurchases.edit")
  @Patch("purchase-orders/:id")
  async updatePurchaseOrder(@Param("id") id: string, @Body(new ZodValidationPipe(updatePurchaseOrderSchema)) body: UpdatePurchaseOrderInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.ops.updatePurchaseOrder(staff, id, body);
    await this.log(staff, req, "inventory.po.update", "PurchaseOrder", id, { number: data.number });
    return { success: true, data };
  }

  @RequirePermission("inventoryPurchases.delete")
  @Post("purchase-orders/bulk-delete")
  async deletePurchaseOrders(@Body(new ZodValidationPipe(bulkIdsSchema)) body: BulkIdsInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.ops.deletePurchaseOrders(staff, body.ids);
    await this.log(staff, req, "inventory.po.bulkDelete", "PurchaseOrder", "bulk", { ids: body.ids, ...data });
    return { success: true, data };
  }

  @RequirePermission("inventoryPurchases.delete")
  @Delete("purchase-orders/:id")
  async deletePurchaseOrder(@Param("id") id: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.ops.deletePurchaseOrder(staff, id);
    await this.log(staff, req, "inventory.po.delete", "PurchaseOrder", id, data);
    return { success: true, data };
  }

  @RequirePermission("inventoryPurchases.edit")
  @Patch("purchase-orders/:id/status")
  async purchaseOrderStatus(@Param("id") id: string, @Body(new ZodValidationPipe(statusSchema)) body: { status: "ORDERED" | "CANCELLED" }, @CurrentStaff() staff: StaffJwtPayload) {
    return { success: true, data: await this.ops.setPurchaseOrderStatus(staff, id, body.status) };
  }

  @RequirePermission("inventoryPurchases.edit")
  @Post("purchase-orders/:id/receive")
  async receive(@Param("id") id: string, @Body(new ZodValidationPipe(receivePurchaseOrderSchema)) body: ReceivePurchaseOrderInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.ops.receivePurchaseOrder(staff, id, body);
    await this.log(staff, req, "inventory.po.receive", "PurchaseOrder", id, { number: data.number });
    return { success: true, data };
  }

  // ---- transfers
  @RequirePermission("inventoryTransfers.view")
  @Get("transfers")
  async transfers(@CurrentStaff() staff: StaffJwtPayload, @Query("branchId") branchId?: string) {
    return { success: true, data: await this.ops.listTransfers(staff, branchId || undefined) };
  }

  @RequirePermission("inventoryTransfers.delete")
  @Post("transfers/bulk-delete")
  async reverseTransfers(@Body(new ZodValidationPipe(bulkIdsSchema)) body: BulkIdsInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.ops.reverseTransfers(staff, body.ids);
    await this.log(staff, req, "inventory.transfer.bulkDelete", "StockTransfer", "bulk", { ids: body.ids, ...data });
    return { success: true, data };
  }

  @RequirePermission("inventoryTransfers.delete")
  @Delete("transfers/:id")
  async reverseTransfer(@Param("id") id: string, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.ops.reverseTransfer(staff, id);
    await this.log(staff, req, "inventory.transfer.delete", "StockTransfer", id, data);
    return { success: true, data };
  }

  @RequirePermission("inventoryTransfers.create")
  @Post("transfers")
  async createTransfer(@Body(new ZodValidationPipe(createTransferSchema)) body: CreateTransferInput, @CurrentStaff() staff: StaffJwtPayload, @Req() req: Request) {
    const data = await this.ops.createTransfer(staff, body);
    await this.log(staff, req, "inventory.transfer", "StockTransfer", data.number, { from: body.fromBranchId, to: body.toBranchId });
    return { success: true, data };
  }
}
