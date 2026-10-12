import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";
import { CloudinaryService } from "./cloudinary.service";

export type RegisterAssetInput = {
  url: string;
  publicId: string;
  filename: string;
  folder?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
};

// Where an image URL can be in use; shown before a file is deleted. [label, table, column]
const USAGE_COLUMNS: [string, string, string][] = [
  ["Restaurant logo", "restaurants", "logoUrl"],
  ["Footer logo", "restaurants", "footerLogoUrl"],
  ["Receipt logo", "restaurants", "receiptLogoUrl"],
  ["Branch photo", "branches", "imageUrl"],
  ["Category image", "categories", "image"],
  ["Category banner", "categories", "banner"],
  ["Product image", "product_images", "url"],
  ["Deal image", "deals", "image"],
  ["Choice option image", "choice_options", "image"],
  ["Add-on image", "addons", "image"],
  ["Hero banner", "banners", "image"],
  ["Marketing pop-up", "marketing_popups", "image"],
];

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async list(params: { search?: string; folder?: string; cursor?: string; limit?: number }) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
    const search = params.search?.trim();
    const items = await this.prisma.mediaAsset.findMany({
      where: {
        restaurantId,
        ...(params.folder ? { folder: params.folder } : {}),
        ...(search ? { filename: { contains: search, mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const total = await this.prisma.mediaAsset.count({ where: { restaurantId } });
    return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null, total };
  }

  /** Records an image the browser just uploaded straight to Cloudinary, so it appears in the library. */
  async register(input: RegisterAssetInput, staffId?: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const prefix = this.cloudinary.urlPrefix();
    if (!prefix || !input.url.startsWith(prefix)) {
      throw new BadRequestException({ code: "INVALID_MEDIA_URL", message: "Only images uploaded to your own media storage can be added" });
    }
    return this.prisma.mediaAsset.upsert({
      where: { publicId: input.publicId },
      create: {
        restaurantId,
        url: input.url,
        publicId: input.publicId,
        filename: input.filename.slice(0, 200),
        folder: input.folder || "restaurant",
        width: input.width,
        height: input.height,
        bytes: input.bytes,
        format: input.format,
        uploadedById: staffId,
      },
      update: {},
    });
  }

  /** Pulls images that were uploaded before the library existed into it. Safe to run any number of times. */
  async syncFromCloudinary() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const existing = new Set((await this.prisma.mediaAsset.findMany({ where: { restaurantId }, select: { publicId: true } })).map((a) => a.publicId));
    let added = 0;
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard++) {
      const page = await this.cloudinary.listImages(cursor);
      const fresh = page.resources.filter((r) => !existing.has(r.publicId));
      if (fresh.length) {
        await this.prisma.mediaAsset.createMany({
          data: fresh.map((r) => ({
            restaurantId,
            url: r.url,
            publicId: r.publicId,
            filename: r.filename,
            folder: r.folder,
            width: r.width,
            height: r.height,
            bytes: r.bytes,
            format: r.format,
            createdAt: r.createdAt,
          })),
          skipDuplicates: true,
        });
        fresh.forEach((r) => existing.add(r.publicId));
        added += fresh.length;
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return { added };
  }

  /** Rename an image or set its alt text. The file itself and its link stay the same. */
  async update(id: string, input: { filename?: string; altText?: string }) {
    await this.findOwned(id);
    return this.prisma.mediaAsset.update({
      where: { id },
      data: {
        ...(input.filename !== undefined ? { filename: input.filename } : {}),
        ...(input.altText !== undefined ? { altText: input.altText || null } : {}),
      },
    });
  }

  private async findOwned(id: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.restaurantId !== restaurantId) throw new NotFoundException({ code: "MEDIA_NOT_FOUND", message: "Image not found" });
    return asset;
  }

  /** Places on the website/admin where this image is currently used. */
  async usage(id: string) {
    const asset = await this.findOwned(id);
    const used: { label: string; count: number }[] = [];
    for (const [label, table, column] of USAGE_COLUMNS) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${table}" WHERE "${column}" = $1`, asset.url);
        if (rows[0] && rows[0].n > 0) used.push({ label, count: rows[0].n });
      } catch {
        // table/column not present in this database version
      }
    }
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "restaurants" WHERE "settings"::text LIKE $1`, `%${asset.url}%`);
      if (rows[0] && rows[0].n > 0) used.push({ label: "Website settings (header, footer, pages)", count: rows[0].n });
    } catch {
      // ignore
    }
    return { used };
  }

  /**
   * Deletes several images at once. Images still in use are skipped (and reported) unless force is set, so a bulk
   * delete cannot silently blank out a product or a banner.
   */
  async removeMany(ids: string[], force: boolean) {
    const unique = [...new Set(ids)].slice(0, 100);
    const skipped: { id: string; filename: string; used: { label: string; count: number }[] }[] = [];
    let deleted = 0;
    for (const id of unique) {
      let asset;
      try {
        asset = await this.findOwned(id);
      } catch {
        continue;
      }
      const { used } = await this.usage(id);
      if (used.length > 0 && !force) {
        skipped.push({ id, filename: asset.filename, used });
        continue;
      }
      await this.cloudinary.destroy(asset.publicId).catch(() => undefined);
      await this.prisma.mediaAsset.delete({ where: { id } });
      deleted++;
    }
    return { deleted, skipped };
  }

  async remove(id: string, force: boolean) {
    const asset = await this.findOwned(id);
    const { used } = await this.usage(id);
    if (used.length > 0 && !force) {
      throw new BadRequestException({ code: "MEDIA_IN_USE", message: "This image is in use. Remove it from those places first, or delete it anyway.", details: { used } });
    }
    await this.cloudinary.destroy(asset.publicId).catch(() => undefined);
    await this.prisma.mediaAsset.delete({ where: { id } });
    return { deleted: true };
  }
}
