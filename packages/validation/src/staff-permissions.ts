import { z } from "zod";

// One array-based schema serves a single toggle (array of length 1), a bulk Save, and a
// per-category Enable All/Disable All action — no need for separate endpoints/schemas.
export const setStaffPermissionOverridesSchema = z.object({
  overrides: z
    .array(
      z.object({
        key: z.string().min(1), // matches PermissionKey format "module.action"
        granted: z.boolean().nullable(), // true=Allow override, false=Deny override, null=clear override (revert to role default)
      }),
    )
    .min(1),
});
export type SetStaffPermissionOverridesInput = z.infer<typeof setStaffPermissionOverridesSchema>;
