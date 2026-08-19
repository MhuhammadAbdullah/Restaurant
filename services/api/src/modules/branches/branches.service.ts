import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AssignDeliveryAreaInput,
  CreateBranchInput,
  CreateDeliveryAreaCatalogInput,
  UpdateBranchInput,
  UpdateDeliveryAreaCatalogInput,
  UpdateDeliveryAreaLinkInput,
} from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

/** Common Google Maps URL shapes that embed coordinates directly: `/@lat,lng,zoom`, `?q=lat,lng`, `&ll=lat,lng`, and the `!3d..!4d..` place-data pattern. */
function extractLatLng(url: string): { lat: number; lng: number } | null {
  const patterns = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return { lat: Number(match[1]), lng: Number(match[2]) };
  }
  return null;
}

/**
 * Lat/lng extraction from a pasted Google Maps URL. Short links (maps.app.goo.gl/..., goo.gl/maps/...
 * — what Google Maps' own "Share" button hands out by default) never embed coordinates in the URL
 * itself; they only appear on the page the link redirects to. So: try the URL as given first, and
 * if that doesn't match, follow the redirect and parse the resolved URL instead. Network hiccups or
 * an unrecognized URL shape fall through to `null` — the raw URL is still stored and used for
 * "Get Directions" either way, only the geolocation "nearest branch" matching needs the coordinates.
 */
async function parseLatLngFromMapUrl(url: string): Promise<{ lat: number; lng: number } | null> {
  const direct = extractLatLng(url);
  if (direct) return direct;

  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(5000) });
    return extractLatLng(res.url);
  } catch {
    return null;
  }
}

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  async list() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.branch.findMany({ where: { restaurantId }, orderBy: { name: "asc" } });
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id }, include: { deliveryAreas: { include: { area: true } }, tables: true } });
    if (!branch) throw new NotFoundException({ code: "BRANCH_NOT_FOUND", message: "Branch not found" });
    return branch;
  }

  async create(input: CreateBranchInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const { mapUrl, latitude, longitude, ...rest } = input;
    // Typed-in coordinates always win over whatever the map link would resolve to — the admin
    // explicitly said "this is the exact spot," so don't second-guess it against a parsed link.
    const coords = latitude !== undefined && longitude !== undefined ? { lat: latitude, lng: longitude } : mapUrl ? await parseLatLngFromMapUrl(mapUrl) : null;

    const branch = await this.prisma.branch.create({
      data: { restaurantId, ...rest, mapUrl, latitude: coords?.lat, longitude: coords?.lng },
    });

    // A brand-new branch should inherit full catalog availability by default — mirrors the
    // reverse direction (a new product/deal already gets availability rows for every existing
    // branch on creation, see ProductsService.create / DealsService.create). Without this, a
    // freshly created branch has zero ProductBranchAvailability/DealBranchAvailability rows,
    // which the branch-scoped `some: { isAvailable: true }` catalog filter treats as "nothing
    // available here" — the branch's POS and website menu would show an empty catalog until an
    // admin manually toggled every product and deal available there one by one.
    const [products, deals] = await Promise.all([
      this.prisma.product.findMany({ where: { restaurantId, status: "ACTIVE" }, select: { id: true } }),
      this.prisma.deal.findMany({ where: { restaurantId }, select: { id: true } }),
    ]);
    await Promise.all([
      products.length > 0
        ? this.prisma.productBranchAvailability.createMany({
            data: products.map((p) => ({ productId: p.id, branchId: branch.id, isAvailable: true })),
          })
        : undefined,
      deals.length > 0
        ? this.prisma.dealBranchAvailability.createMany({
            data: deals.map((d) => ({ dealId: d.id, branchId: branch.id, isAvailable: true })),
          })
        : undefined,
    ]);

    // A branch's own home area is a sensible default serviceable area — auto-add it to the
    // shared catalog (if not already there) and link this branch to it immediately.
    const catalogArea = await this.prisma.deliveryAreaCatalog.upsert({
      where: { restaurantId_city_name: { restaurantId, city: input.city, name: input.area } },
      create: { restaurantId, city: input.city, name: input.area, isActive: true },
      update: {},
    });
    await this.prisma.deliveryArea.upsert({
      where: { branchId_areaId: { branchId: branch.id, areaId: catalogArea.id } },
      create: { branchId: branch.id, areaId: catalogArea.id, isActive: true },
      update: { isActive: true },
    });

    return branch;
  }

  async update(id: string, input: UpdateBranchInput) {
    await this.findOne(id);
    const { mapUrl, latitude, longitude, ...rest } = input;

    // Typed-in coordinates always win and are applied as given. Otherwise, only touch
    // latitude/longitude at all if mapUrl was actually part of this update — re-deriving them
    // from whatever link is already on file on every unrelated field edit would be pointless.
    let coordsUpdate: { latitude?: number | null; longitude?: number | null } = {};
    if (latitude !== undefined && longitude !== undefined) {
      coordsUpdate = { latitude, longitude };
    } else if (mapUrl !== undefined) {
      const coords = mapUrl ? await parseLatLngFromMapUrl(mapUrl) : null;
      coordsUpdate = { latitude: coords?.lat ?? null, longitude: coords?.lng ?? null };
    }

    return this.prisma.branch.update({
      where: { id },
      data: {
        ...rest,
        ...(mapUrl !== undefined ? { mapUrl } : {}),
        ...coordsUpdate,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.branch.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------- Per-branch delivery-area assignment (search the catalog, toggle it on/off for this branch) ----------

  async listDeliveryAreas(id: string) {
    await this.findOne(id);
    return this.prisma.deliveryArea.findMany({ where: { branchId: id }, include: { area: true }, orderBy: { area: { name: "asc" } } });
  }

  async assignDeliveryArea(id: string, input: AssignDeliveryAreaInput) {
    const branch = await this.findOne(id);
    const area = await this.prisma.deliveryAreaCatalog.findUnique({ where: { id: input.areaId } });
    if (!area || area.restaurantId !== branch.restaurantId) {
      throw new NotFoundException({ code: "AREA_NOT_FOUND", message: "Delivery area not found" });
    }
    return this.prisma.deliveryArea.upsert({
      where: { branchId_areaId: { branchId: id, areaId: input.areaId } },
      create: { branchId: id, areaId: input.areaId, isActive: true },
      update: { isActive: true },
      include: { area: true },
    });
  }

  async updateDeliveryAreaLink(id: string, linkId: string, patch: UpdateDeliveryAreaLinkInput) {
    const link = await this.prisma.deliveryArea.findUnique({ where: { id: linkId } });
    if (!link || link.branchId !== id) throw new NotFoundException({ code: "DELIVERY_AREA_NOT_FOUND", message: "Delivery area not found" });
    return this.prisma.deliveryArea.update({ where: { id: linkId }, data: patch, include: { area: true } });
  }

  async removeDeliveryAreaLink(id: string, linkId: string) {
    const link = await this.prisma.deliveryArea.findUnique({ where: { id: linkId } });
    if (!link || link.branchId !== id) throw new NotFoundException({ code: "DELIVERY_AREA_NOT_FOUND", message: "Delivery area not found" });
    await this.prisma.deliveryArea.delete({ where: { id: linkId } });
    return { deleted: true };
  }

  /** Distinct active, serviceable area names for a city — backs the customer website's searchable delivery-area picker. */
  async listActiveAreasByCity(city: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const rows = await this.prisma.deliveryAreaCatalog.findMany({
      where: {
        restaurantId,
        city: { equals: city, mode: "insensitive" },
        isActive: true,
        branchLinks: { some: { isActive: true, branch: { restaurantId, status: "ACTIVE", deliveryEnabled: true } } },
      },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => r.name);
  }

  // ---------- Delivery area catalog (restaurant-wide — the admin "Delivery Areas" tab) ----------

  async listAreaCatalog(city?: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.deliveryAreaCatalog.findMany({
      where: { restaurantId, ...(city ? { city: { equals: city, mode: "insensitive" } } : {}) },
      orderBy: [{ city: "asc" }, { name: "asc" }],
    });
  }

  async createAreaCatalogEntry(input: CreateDeliveryAreaCatalogInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.deliveryAreaCatalog.upsert({
      where: { restaurantId_city_name: { restaurantId, city: input.city, name: input.name } },
      create: { restaurantId, city: input.city, name: input.name, isActive: true },
      update: { isActive: true },
    });
  }

  async updateAreaCatalogEntry(id: string, patch: UpdateDeliveryAreaCatalogInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const entry = await this.prisma.deliveryAreaCatalog.findUnique({ where: { id } });
    if (!entry || entry.restaurantId !== restaurantId) throw new NotFoundException({ code: "AREA_NOT_FOUND", message: "Delivery area not found" });
    return this.prisma.deliveryAreaCatalog.update({ where: { id }, data: patch });
  }

  async deleteAreaCatalogEntry(id: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const entry = await this.prisma.deliveryAreaCatalog.findUnique({ where: { id } });
    if (!entry || entry.restaurantId !== restaurantId) throw new NotFoundException({ code: "AREA_NOT_FOUND", message: "Delivery area not found" });
    await this.prisma.deliveryAreaCatalog.delete({ where: { id } }); // cascades to branch links
    return { deleted: true };
  }
}
