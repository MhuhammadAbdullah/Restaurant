import { z } from "zod";

export const resolveBranchSchema = z
  .object({
    // Optional: "Use Current Location" resolves purely from lat/lng, without the customer having
    // picked a city first — see refine() below for the actual either/or requirement.
    city: z.string().trim().min(1).optional(),
    area: z.string().trim().min(1).optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    orderType: z.enum(["DELIVERY", "PICKUP"]).default("DELIVERY"),
    /** PICKUP only: the exact outlet the customer picked, when more than one branch serves the city. */
    branchId: z.string().trim().min(1).optional(),
  })
  .refine((v) => !!v.city || (v.lat !== undefined && v.lng !== undefined), {
    message: "Provide a city or coordinates",
    path: ["city"],
  });
export type ResolveBranchInput = z.infer<typeof resolveBranchSchema>;

const branchFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(20),
  phone: z.string().trim().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().min(1).max(80),
  area: z.string().trim().min(1).max(120),
  /** A pasted Google Maps link — used to derive latitude/longitude server-side when they aren't typed in directly. */
  mapUrl: z.string().trim().url().max(1000).optional(),
  /** Direct coordinate entry — takes priority over whatever mapUrl would resolve to. Required together. */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  openingTime: z.string().regex(/^\d{2}:\d{2}$/),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/),
  breakStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  deliveryRadiusKm: z.number().min(0).default(5),
  deliveryFee: z.number().int().min(0).default(0),
  minimumOrder: z.number().int().min(0).default(0),
  estimatedDeliveryMins: z.number().int().min(0).default(45),
  deliveryEnabled: z.boolean().default(true),
  pickupEnabled: z.boolean().default(true),
  dineInEnabled: z.boolean().default(true),
});

function latLngPaired(v: { latitude?: number; longitude?: number }): boolean {
  return (v.latitude === undefined) === (v.longitude === undefined);
}
const latLngIssue = { message: "Provide both latitude and longitude, or neither", path: ["longitude"] };

export const createBranchSchema = branchFieldsSchema.refine(latLngPaired, latLngIssue);
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = branchFieldsSchema
  .partial()
  .extend({ status: z.enum(["ACTIVE", "INACTIVE", "TEMPORARILY_CLOSED"]).optional() })
  .refine(latLngPaired, latLngIssue);
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

// ---------- Delivery area catalog (restaurant-wide, managed once) ----------
export const createDeliveryAreaCatalogSchema = z.object({
  city: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
});
export type CreateDeliveryAreaCatalogInput = z.infer<typeof createDeliveryAreaCatalogSchema>;

export const updateDeliveryAreaCatalogSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDeliveryAreaCatalogInput = z.infer<typeof updateDeliveryAreaCatalogSchema>;

// ---------- Per-branch assignment of a catalog area ----------
export const assignDeliveryAreaSchema = z.object({
  areaId: z.string().trim().min(1),
});
export type AssignDeliveryAreaInput = z.infer<typeof assignDeliveryAreaSchema>;

export const updateDeliveryAreaLinkSchema = z.object({
  isActive: z.boolean(),
});
export type UpdateDeliveryAreaLinkInput = z.infer<typeof updateDeliveryAreaLinkSchema>;
