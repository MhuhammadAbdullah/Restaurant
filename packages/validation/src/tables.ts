import { z } from "zod";
import { idSchema } from "./common";

export const createTableSchema = z.object({
  branchId: idSchema,
  number: z.string().trim().min(1).max(20),
  name: z.string().trim().max(60).optional(),
  capacity: z.number().int().min(1).default(2),
  section: z.string().trim().max(60).optional(),
});
export type CreateTableInput = z.infer<typeof createTableSchema>;

export const updateTableSchema = createTableSchema.partial().extend({
  status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING"]).optional(),
});
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
