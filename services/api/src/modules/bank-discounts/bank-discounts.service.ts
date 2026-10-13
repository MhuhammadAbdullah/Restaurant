import { Injectable, NotFoundException } from "@nestjs/common";
import {
  DEFAULT_BANK_DISCOUNTS_SETTINGS,
  type BankDiscountsSettings,
  type CreateBankDiscountInput,
  type UpdateBankDiscountInput,
} from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

@Injectable()
export class BankDiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  // ------------------------------------------------------------------ settings

  private async readSettings(restaurantId: string): Promise<{ all: Record<string, unknown>; current: Required<BankDiscountsSettings> }> {
    const row = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { settings: true } });
    const all = (row.settings as Record<string, unknown> | null) ?? {};
    const stored = (all.bankDiscounts as BankDiscountsSettings | undefined) ?? {};
    return { all, current: { ...DEFAULT_BANK_DISCOUNTS_SETTINGS, ...Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined)) } };
  }

  async getSettings() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return (await this.readSettings(restaurantId)).current;
  }

  async saveSettings(input: BankDiscountsSettings) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const { all, current } = await this.readSettings(restaurantId);
    const next = { ...current, ...input };
    await this.prisma.restaurant.update({ where: { id: restaurantId }, data: { settings: { ...all, bankDiscounts: next } as never } });
    return next;
  }

  // ------------------------------------------------------------------ public

  /** The page for the website: its texts, whether it is switched on, and the active offers in order. Offers are only sent when the page is on. */
  async getPublic() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const settings = (await this.readSettings(restaurantId)).current;
    if (!settings.enabled) return { ...settings, items: [] as { id: string; name: string; image: string; linkUrl: string | null }[] };
    const items = await this.prisma.bankDiscount.findMany({
      where: { restaurantId, status: "ACTIVE" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, image: true, linkUrl: true },
    });
    return { ...settings, items };
  }

  // ------------------------------------------------------------------ admin

  async adminList() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const [settings, items] = await Promise.all([
      this.readSettings(restaurantId),
      this.prisma.bankDiscount.findMany({ where: { restaurantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    ]);
    return { settings: settings.current, items };
  }

  private async findOwned(id: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const row = await this.prisma.bankDiscount.findUnique({ where: { id } });
    if (!row || row.restaurantId !== restaurantId) throw new NotFoundException({ code: "BANK_DISCOUNT_NOT_FOUND", message: "Offer not found" });
    return row;
  }

  async create(input: CreateBankDiscountInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const last = await this.prisma.bankDiscount.findFirst({ where: { restaurantId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    return this.prisma.bankDiscount.create({
      data: { restaurantId, name: input.name, image: input.image, linkUrl: input.linkUrl || null, status: input.status, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
  }

  async update(id: string, input: UpdateBankDiscountInput) {
    await this.findOwned(id);
    return this.prisma.bankDiscount.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.image !== undefined ? { image: input.image } : {}),
        ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOwned(id);
    await this.prisma.bankDiscount.delete({ where: { id } });
  }

  async reorder(ids: string[]) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const owned = await this.prisma.bankDiscount.findMany({ where: { restaurantId, id: { in: ids } }, select: { id: true } });
    const ok = new Set(owned.map((o) => o.id));
    await this.prisma.$transaction(ids.filter((id) => ok.has(id)).map((id, index) => this.prisma.bankDiscount.update({ where: { id }, data: { sortOrder: index } })));
  }
}
