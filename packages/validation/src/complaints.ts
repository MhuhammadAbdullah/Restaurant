import { z } from "zod";
import { idSchema, phoneSchema } from "./common";

export const complaintCategorySchema = z.enum([
  "FOOD_QUALITY",
  "WRONG_ITEM",
  "MISSING_ITEM",
  "LATE_DELIVERY",
  "BRANCH_ISSUE",
  "STAFF_BEHAVIOUR",
  "PAYMENT_ISSUE",
  "ORDER_ISSUE",
  "PACKAGING_ISSUE",
  "OTHER",
]);

export const complaintOrderTypeSchema = z.enum(["DELIVERY", "PICKUP", "TAKEAWAY", "DINE_IN"]);

export const createComplaintSchema = z
  .object({
    category: complaintCategorySchema,
    branchId: idSchema.optional(),
    productId: idSchema.optional(),
    // The order NUMBER as typed by the customer (e.g. "ORD-20260801-1001") — the server resolves
    // and verifies this against the real order, a raw client-supplied orderId is never accepted.
    orderNumber: z.string().trim().max(40).optional().or(z.literal("")),
    orderType: complaintOrderTypeSchema.optional(),
    contactName: z.string().trim().min(1).max(120),
    contactPhone: phoneSchema.optional().or(z.literal("")),
    contactEmail: z.string().trim().email().optional().or(z.literal("")),
    subject: z.string().trim().min(1).max(150),
    description: z.string().trim().min(1).max(3000),
    attachmentUrls: z.array(z.string().url()).max(6).default([]),
  })
  .refine((v) => !!v.contactPhone || !!v.contactEmail, {
    message: "Provide at least a phone number or an email address",
    path: ["contactPhone"],
  });
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

export const addComplaintMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  isInternalNote: z.boolean().default(false),
  attachmentUrls: z.array(z.string().url()).default([]),
});
export type AddComplaintMessageInput = z.infer<typeof addComplaintMessageSchema>;

export const updateComplaintStatusSchema = z.object({
  status: z.enum(["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"]),
});
export type UpdateComplaintStatusInput = z.infer<typeof updateComplaintStatusSchema>;

export const assignComplaintSchema = z.object({
  staffUserId: idSchema,
});
export type AssignComplaintInput = z.infer<typeof assignComplaintSchema>;
