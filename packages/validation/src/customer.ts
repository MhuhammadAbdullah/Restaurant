import { z } from "zod";
import { phoneSchema } from "./common";

export const createAddressSchema = z.object({
  label: z.string().trim().min(1).max(40).default("Home"),
  city: z.string().trim().min(1).max(80),
  area: z.string().trim().min(1).max(120),
  addressLine: z.string().trim().min(1).max(300),
  landmark: z.string().trim().max(150).optional(),
  contactNumber: z.string().trim().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().default(false),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = createAddressSchema.partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

const genderSchema = z.enum(["MALE", "FEMALE", "OTHER"]);

export const updateCustomerProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().email().optional(),
  phone: phoneSchema.optional(),
  gender: genderSchema.optional(),
  dob: z.coerce.date().optional(),
  profileImage: z.string().url().optional(),
});
export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const adjustLoyaltySchema = z.object({
  points: z.number().int().refine((n) => n !== 0, "points must not be zero"),
  note: z.string().trim().min(1).max(300),
});
export type AdjustLoyaltyInput = z.infer<typeof adjustLoyaltySchema>;

export const updateCustomerStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
export type UpdateCustomerStatusInput = z.infer<typeof updateCustomerStatusSchema>;
