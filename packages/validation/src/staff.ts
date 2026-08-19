import { z } from "zod";
import { idSchema } from "./common";

export const createStaffUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8),
  roleId: idSchema,
  branchIds: z.array(idSchema).default([]),
  allBranchesAccess: z.boolean().optional(),
});
export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;

export const updateStaffUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  roleId: idSchema.optional(),
  branchIds: z.array(idSchema).optional(),
  allBranchesAccess: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
export type UpdateStaffUserInput = z.infer<typeof updateStaffUserSchema>;
