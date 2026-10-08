import { z } from "zod";
import { idSchema, phoneSchema } from "./common";
import { dealSlotSelectionSchema } from "./deals";

const orderItemChoiceSchema = z.object({ choiceGroupId: idSchema, choiceOptionId: idSchema });
const orderItemAddonSchema = z.object({ addonId: idSchema, quantity: z.number().int().min(1).default(1) });

const productOrderItemSchema = z.object({
  kind: z.literal("product"),
  productId: idSchema,
  quantity: z.number().int().min(1).default(1),
  choices: z.array(orderItemChoiceSchema).default([]),
  addons: z.array(orderItemAddonSchema).default([]),
  specialInstructions: z.string().trim().max(500).optional(),
});
export type ProductOrderItemInput = z.infer<typeof productOrderItemSchema>;

const dealOrderItemSchema = z.object({
  kind: z.literal("deal"),
  dealId: idSchema,
  quantity: z.number().int().min(1).default(1),
  selections: z.array(dealSlotSelectionSchema).min(1),
  specialInstructions: z.string().trim().max(500).optional(),
});
export type DealOrderItemInput = z.infer<typeof dealOrderItemSchema>;

export const orderItemInputSchema = z.discriminatedUnion("kind", [productOrderItemSchema, dealOrderItemSchema]);
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

const giftDetailsSchema = z.object({
  recipientName: z.string().trim().min(1).max(120),
  recipientPhone: phoneSchema,
  recipientAddress: z.string().trim().min(1).max(300),
  recipientCity: z.string().trim().min(1).max(80),
  recipientArea: z.string().trim().min(1).max(120),
  recipientLandmark: z.string().trim().max(150).optional(),
  message: z.string().trim().max(500).optional(),
});

const newAddressSchema = z.object({
  city: z.string().trim().min(1).max(80),
  area: z.string().trim().min(1).max(120),
  addressLine: z.string().trim().min(1).max(300),
  landmark: z.string().trim().max(150).optional(),
  contactNumber: z.string().trim().max(20).optional(),
});

export const createOrderSchema = z
  .object({
    branchId: idSchema,
    type: z.enum(["ONLINE_DELIVERY", "ONLINE_PICKUP"]),
    items: z.array(orderItemInputSchema).min(1),
    paymentMethod: z.enum(["COD", "ONLINE"]),
    isGift: z.boolean().default(false),
    gift: giftDetailsSchema.optional(),
    addressId: idSchema.optional(),
    newAddress: newAddressSchema.optional(),
    contactName: z.string().trim().min(1).max(120),
    contactPhone: phoneSchema,
    contactAlternatePhone: z.string().trim().optional(),
    contactEmail: z.string().email().optional(),
    changeRequestAmount: z.number().int().min(0).optional(),
    specialInstructions: z.string().trim().max(1000).optional(),
    loyaltyPointsToRedeem: z.number().int().min(0).default(0),
    couponCode: z.string().trim().max(40).optional(),
    idempotencyKey: z.string().trim().max(100).optional(),
    clientTotal: z.number().int().min(0).optional(),
  })
  .refine((v) => v.type !== "ONLINE_DELIVERY" || v.addressId || v.newAddress, {
    message: "Delivery orders require a saved address or a new address",
    path: ["addressId"],
  })
  .refine((v) => !v.isGift || v.gift, { message: "Gift orders require recipient details", path: ["gift"] })
  .refine((v) => !v.isGift || v.paymentMethod === "ONLINE", {
    message: "Gift orders require online payment",
    path: ["paymentMethod"],
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"]),
  internalNotes: z.string().trim().max(1000).optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

const posDeliveryAddressSchema = z.object({
  city: z.string().trim().min(1).max(80),
  area: z.string().trim().min(1).max(120),
  addressLine: z.string().trim().min(1).max(300),
  landmark: z.string().trim().max(150).optional(),
});

export const createPosOrderSchema = z
  .object({
    branchId: idSchema,
    type: z.enum(["DINE_IN", "WALK_IN", "TAKEAWAY", "DELIVERY"]),
    tableId: idSchema.optional(),
    customerId: idSchema.optional(), // existing customer selected via phone lookup
    customerName: z.string().trim().max(120).optional(),
    customerPhone: z.string().trim().max(20).optional(),
    customerAlternatePhone: z.string().trim().max(20).optional(),
    customerEmail: z.string().trim().toLowerCase().email().max(254).optional(),
    deliveryAddress: posDeliveryAddressSchema.optional(),
    items: z.array(orderItemInputSchema).min(1),
    couponCode: z.string().trim().max(40).optional(),
    loyaltyPointsToRedeem: z.number().int().min(0).default(0),
    paymentMethod: z.enum(["CASH", "CARD", "QR"]),
    amountTendered: z.number().int().min(0).optional(), // cash only, for change calculation
    specialInstructions: z.string().trim().max(1000).optional(),
    idempotencyKey: z.string().trim().max(100).optional(),
    clientTotal: z.number().int().min(0).optional(),
  })
  .refine((v) => v.type !== "DINE_IN" || v.tableId, { message: "Dine-in orders require a table", path: ["tableId"] })
  .refine((v) => v.type !== "DELIVERY" || v.deliveryAddress, {
    message: "Delivery orders require an address",
    path: ["deliveryAddress"],
  })
  // The rider has to be able to call the customer.
  .refine((v) => v.type !== "DELIVERY" || (!!v.customerName?.trim() && !!v.customerPhone?.trim()), {
    message: "Delivery orders require the customer's name and phone number",
    path: ["customerPhone"],
  });
export type CreatePosOrderInput = z.infer<typeof createPosOrderSchema>;

/** Prices the current POS cart exactly as createPosOrder would (tax, delivery fee, discounts) without persisting anything. */
export const quotePosOrderSchema = z.object({
  branchId: idSchema,
  type: z.enum(["DINE_IN", "WALK_IN", "TAKEAWAY", "DELIVERY"]),
  customerId: idSchema.optional(),
  items: z.array(orderItemInputSchema).min(1),
  couponCode: z.string().trim().max(40).optional(),
  loyaltyPointsToRedeem: z.number().int().min(0).default(0),
});
export type QuotePosOrderInput = z.infer<typeof quotePosOrderSchema>;

export const addOrderItemsSchema = z.object({
  items: z.array(orderItemInputSchema).min(1),
  note: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().max(100).optional(),
});
export type AddOrderItemsInput = z.infer<typeof addOrderItemsSchema>;

export const recordOrderPaymentSchema = z.object({
  method: z.enum(["CASH", "CARD", "QR"]),
  amount: z.number().int().min(1),
  amountTendered: z.number().int().min(0).optional(),
});
export type RecordOrderPaymentInput = z.infer<typeof recordOrderPaymentSchema>;

/** Admin confirms they received a rider's COD cash for these delivered orders. `receivedAmount` is the cash actually counted, in paisa. */
export const settleCodCashSchema = z.object({
  orderIds: z.array(idSchema).min(1).max(100),
  receivedAmount: z.number().int().min(0).optional(),
  note: z.string().trim().max(300).optional(),
});
export type SettleCodCashInput = z.infer<typeof settleCodCashSchema>;

export const confirmPaymentSchema = z.object({
  paymentId: idSchema.optional(), // omit to confirm the order's most recent PENDING payment
});
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;

export const logPrintEventSchema = z.object({
  type: z.enum(["CUSTOMER", "KITCHEN", "KITCHEN_ADDITIONAL"]),
  status: z.enum(["PRINTED", "FAILED"]),
  revisionId: idSchema.optional(),
});
export type LogPrintEventInput = z.infer<typeof logPrintEventSchema>;

export const updateOrderDeliveryDetailsSchema = z.object({
  contactName: z.string().trim().min(1).max(120).optional(),
  contactPhone: phoneSchema.optional(),
  contactAlternatePhone: z.string().trim().max(20).optional().or(z.literal("")),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  deliveryAddressSnapshot: z.string().trim().min(1).max(300).optional(),
  deliveryCity: z.string().trim().min(1).max(80).optional(),
  deliveryArea: z.string().trim().min(1).max(120).optional(),
  deliveryLandmark: z.string().trim().max(150).optional().or(z.literal("")),
});
export type UpdateOrderDeliveryDetailsInput = z.infer<typeof updateOrderDeliveryDetailsSchema>;

export const changeOrderTypeSchema = z.object({
  type: z.enum(["ONLINE_DELIVERY", "ONLINE_PICKUP", "DELIVERY", "TAKEAWAY"]),
});
export type ChangeOrderTypeInput = z.infer<typeof changeOrderTypeSchema>;

export const updateOrderItemQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(50),
});
export type UpdateOrderItemQuantityInput = z.infer<typeof updateOrderItemQuantitySchema>;

export const transferOrderBranchSchema = z.object({
  toBranchId: idSchema,
  note: z.string().trim().max(300).optional(),
});
export type TransferOrderBranchInput = z.infer<typeof transferOrderBranchSchema>;

export const assignRiderSchema = z.object({
  riderId: idSchema.nullable(),
});
export type AssignRiderInput = z.infer<typeof assignRiderSchema>;

// Server re-validates the multiple-of-5 constraint itself — this is UX-layer only.
export const updateDeliveryEtaSchema = z.object({
  estimatedDeliveryAt: z.string().datetime(),
});
export type UpdateDeliveryEtaInput = z.infer<typeof updateDeliveryEtaSchema>;

export const updateRiderDeliveryStatusSchema = z.object({
  status: z.enum(["OUT_FOR_DELIVERY", "DELIVERED"]),
});
export type UpdateRiderDeliveryStatusInput = z.infer<typeof updateRiderDeliveryStatusSchema>;
