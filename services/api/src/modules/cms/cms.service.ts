import { Injectable, NotFoundException } from "@nestjs/common";
import {
  DEFAULT_ABOUT_CONTENT_CONFIG,
  DEFAULT_APP_PROMO_CONFIG,
  DEFAULT_FOOTER_CONFIG,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_LOCATION_POPUP_CONFIG,
  DEFAULT_PAGES_CONFIG,
  STATIC_PAGE_SLUGS,
  resolveLoyaltyConfig,
  type AboutContentConfig,
  type AppPromoConfig,
  type CheckoutConfig,
  type ResolvedCheckoutConfig,
  DEFAULT_CHECKOUT_CONFIG,
  type CreateBannerInput,
  type CreatePopupInput,
  type UpdatePopupInput,
  type FooterConfig,
  type HeaderConfig,
  type LocationPopupConfig,
  type LoyaltyConfig,
  type PagesConfig,
  type StaticPageSlug,
  type UpdateBannerInput,
  type UpdateRestaurantSettingsInput,
} from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

/** Drops keys that are undefined so they do not overwrite defaults when spread. */
function stripUndefined<T extends object>(value: T | undefined): Partial<T> {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
}

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  /** Restaurant.settings is a free-form JSON bucket — header config lives at settings.header, backfilled with defaults so callers never see missing fields. */
  private resolveHeaderConfig(settings: unknown): Required<HeaderConfig> {
    const stored = (settings as { header?: HeaderConfig } | null | undefined)?.header ?? {};
    return { ...DEFAULT_HEADER_CONFIG, ...stored };
  }

  /** Same pattern as resolveHeaderConfig, for settings.footer. */
  private resolveFooterConfig(settings: unknown): Required<FooterConfig> {
    const stored = (settings as { footer?: FooterConfig } | null | undefined)?.footer ?? {};
    return { ...DEFAULT_FOOTER_CONFIG, ...stored };
  }

  /** Same pattern, for settings.pages (Terms & Conditions / Privacy Policy / FAQs content). */
  private resolvePagesConfig(settings: unknown): Required<PagesConfig> {
    const stored = (settings as { pages?: PagesConfig } | null | undefined)?.pages ?? {};
    return {
      terms: { ...DEFAULT_PAGES_CONFIG.terms, ...stored.terms },
      privacy: { ...DEFAULT_PAGES_CONFIG.privacy, ...stored.privacy },
      faqs: { ...DEFAULT_PAGES_CONFIG.faqs, ...stored.faqs },
    };
  }

  /** Same pattern, for settings.locationPopup. `logoUrl` stays possibly-undefined — callers fall back to the main header logo when unset. */
  private resolveLocationPopupConfig(settings: unknown): LocationPopupConfig {
    const stored = (settings as { locationPopup?: LocationPopupConfig } | null | undefined)?.locationPopup ?? {};
    return {
      ...DEFAULT_LOCATION_POPUP_CONFIG,
      ...stored,
      cityIcons: { ...DEFAULT_LOCATION_POPUP_CONFIG.cityIcons, ...stored.cityIcons },
    };
  }

  /** Same pattern, for settings.appPromo (homepage app-download banner, shown just above the footer). */
  private resolveAppPromoConfig(settings: unknown): Required<AppPromoConfig> {
    const stored = (settings as { appPromo?: AppPromoConfig } | null | undefined)?.appPromo ?? {};
    return { ...DEFAULT_APP_PROMO_CONFIG, ...stored };
  }

  /** Same pattern, for settings.checkout (coupon / tip boxes on the checkout page). */
  private resolveCheckoutConfig(settings: unknown): ResolvedCheckoutConfig {
    const stored = (settings as { checkout?: CheckoutConfig } | null | undefined)?.checkout ?? {};
    const d = DEFAULT_CHECKOUT_CONFIG;
    return {
      showCoupon: stored.showCoupon ?? d.showCoupon,
      showTip: stored.showTip ?? d.showTip,
      tipPresets: stored.tipPresets ?? d.tipPresets,
      defaultTip: stored.defaultTip ?? d.defaultTip,
      payments: {
        cod: { ...d.payments.cod, ...stripUndefined(stored.payments?.cod) },
        online: { ...d.payments.online, ...stripUndefined(stored.payments?.online) },
      },
    };
  }

  /** Same pattern, for settings.aboutContent (homepage heading + expandable paragraph, shown just above the footer). */
  private resolveAboutContentConfig(settings: unknown): Required<AboutContentConfig> {
    const stored = (settings as { aboutContent?: AboutContentConfig } | null | undefined)?.aboutContent ?? {};
    return { ...DEFAULT_ABOUT_CONTENT_CONFIG, ...stored };
  }

  /** settings.receiptMessages: per-receipt-type thank-you lines (blank = use the general thank-you message). */
  private resolveReceiptMessages(settings: unknown): { dineIn: string; takeaway: string; walkIn: string; delivery: string; preBill: string } {
    const stored = (settings as { receiptMessages?: Record<string, string> } | null | undefined)?.receiptMessages ?? {};
    return { dineIn: stored.dineIn ?? "", takeaway: stored.takeaway ?? "", walkIn: stored.walkIn ?? "", delivery: stored.delivery ?? "", preBill: stored.preBill ?? "" };
  }

  async getStaticPage(slug: StaticPageSlug) {
    if (!STATIC_PAGE_SLUGS.includes(slug)) {
      throw new NotFoundException({ code: "PAGE_NOT_FOUND", message: "Page not found" });
    }
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { settings: true } });
    return this.resolvePagesConfig(restaurant.settings)[slug];
  }

  /**
   * Home page sections. Every active category gets a product grid (and a tab) automatically, in the category's own
   * order, so creating, reordering or deactivating a category in the admin is reflected on the website. A stored
   * PRODUCT_GRID section for a category only supplies its heading. The "Deals" category has its own tab and is skipped.
   */
  async listSections() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const [rows, categories] = await Promise.all([
      this.prisma.websiteSection.findMany({ where: { restaurantId, status: "ACTIVE" }, include: { category: true }, orderBy: { sortOrder: "asc" } }),
      this.prisma.category.findMany({ where: { restaurantId, status: "ACTIVE" }, orderBy: { sortOrder: "asc" } }),
    ]);
    const others = rows.filter((r) => r.type !== "PRODUCT_GRID");
    const stored = new Map(rows.filter((r) => r.type === "PRODUCT_GRID" && r.categoryId).map((r) => [r.categoryId as string, r]));
    const now = new Date();
    const grids = categories
      .filter((c) => c.name.trim().toLowerCase() !== "deals")
      .map((c) => {
        const existing = stored.get(c.id);
        return {
          id: existing?.id ?? `category-${c.id}`,
          restaurantId,
          type: "PRODUCT_GRID" as const,
          heading: existing?.heading ?? `Range of ${c.name}`,
          description: existing?.description ?? null,
          categoryId: c.id,
          category: c,
          sortOrder: c.sortOrder,
          status: "ACTIVE" as const,
          config: existing?.config ?? null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: existing?.updatedAt ?? now,
        };
      });
    return [...others, ...grids].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** Public — only what the customer website needs to render the slider. The admin-only title never leaves adminListBanners(). */
  async listBanners(page: string = "HOME") {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        restaurantId,
        status: "ACTIVE",
        pages: { has: page.toUpperCase() },
        OR: [{ startDate: null }, { startDate: { lte: now } }],
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, image: true },
    });
  }

  async getRestaurantInfo() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const { settings, ...restaurant } = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: {
        name: true,
        logoUrl: true,
        footerLogoUrl: true,
        currency: true,
        contactPhone: true,
        contactEmail: true,
        socialLinks: true,
        settings: true,
        receiptLogoUrl: true,
        receiptTaxNumber: true,
        receiptFooterText: true,
        receiptThankYouMessage: true,
        kitchenReceiptHeaderText: true,
        kitchenReceiptFooterText: true,
        productImageFallbackSource: true,
      },
    });
    return {
      ...restaurant,
      header: this.resolveHeaderConfig(settings),
      footer: this.resolveFooterConfig(settings),
      pages: this.resolvePagesConfig(settings),
      locationPopup: this.resolveLocationPopupConfig(settings),
      loyalty: resolveLoyaltyConfig(settings),
      appPromo: this.resolveAppPromoConfig(settings),
      checkout: this.resolveCheckoutConfig(settings),
      aboutContent: this.resolveAboutContentConfig(settings),
      receiptMessages: this.resolveReceiptMessages(settings),
      seo: ((settings as { seo?: Record<string, unknown> } | null | undefined)?.seo ?? {}) as Record<string, unknown>,
      adminLoginImageUrl: ((settings as { adminLoginImageUrl?: string } | null | undefined)?.adminLoginImageUrl ?? null) as string | null,
    };
  }

  async updateRestaurantSettings(input: UpdateRestaurantSettingsInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();

    let settingsPatch: Record<string, unknown> | undefined;
    if (
      input.header !== undefined ||
      input.footer !== undefined ||
      input.pages !== undefined ||
      input.locationPopup !== undefined ||
      input.loyalty !== undefined ||
      input.appPromo !== undefined ||
      input.checkout !== undefined ||
      input.aboutContent !== undefined ||
      input.receiptMessages !== undefined ||
      input.seo !== undefined ||
      input.adminLoginImageUrl !== undefined
    ) {
      const current = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { settings: true } });
      const currentSettings = (current.settings as Record<string, unknown> | null) ?? {};
      settingsPatch = { ...currentSettings };
      if (input.header !== undefined) {
        const currentHeader = (currentSettings.header as HeaderConfig | undefined) ?? {};
        settingsPatch.header = { ...currentHeader, ...input.header };
      }
      if (input.footer !== undefined) {
        const currentFooter = (currentSettings.footer as FooterConfig | undefined) ?? {};
        settingsPatch.footer = { ...currentFooter, ...input.footer };
      }
      if (input.pages !== undefined) {
        const currentPages = (currentSettings.pages as PagesConfig | undefined) ?? {};
        settingsPatch.pages = {
          ...currentPages,
          ...(input.pages.terms !== undefined ? { terms: { ...currentPages.terms, ...input.pages.terms } } : {}),
          ...(input.pages.privacy !== undefined ? { privacy: { ...currentPages.privacy, ...input.pages.privacy } } : {}),
          ...(input.pages.faqs !== undefined ? { faqs: { ...currentPages.faqs, ...input.pages.faqs } } : {}),
        };
      }
      if (input.locationPopup !== undefined) {
        const currentLocationPopup = (currentSettings.locationPopup as LocationPopupConfig | undefined) ?? {};
        settingsPatch.locationPopup = {
          ...currentLocationPopup,
          ...input.locationPopup,
          // Merge city icons key-by-key so updating one city's icon doesn't wipe the others.
          ...(input.locationPopup.cityIcons !== undefined
            ? { cityIcons: { ...(currentLocationPopup.cityIcons ?? {}), ...input.locationPopup.cityIcons } }
            : {}),
        };
      }
      if (input.loyalty !== undefined) {
        const currentLoyalty = (currentSettings.loyalty as LoyaltyConfig | undefined) ?? {};
        settingsPatch.loyalty = { ...currentLoyalty, ...input.loyalty };
      }
      if (input.checkout !== undefined) {
        const currentCheckout = (currentSettings.checkout as CheckoutConfig | undefined) ?? {};
        settingsPatch.checkout = {
          ...currentCheckout,
          ...input.checkout,
          ...(input.checkout.payments
            ? {
                payments: {
                  cod: { ...currentCheckout.payments?.cod, ...input.checkout.payments.cod },
                  online: { ...currentCheckout.payments?.online, ...input.checkout.payments.online },
                },
              }
            : {}),
        };
      }
      if (input.appPromo !== undefined) {
        const currentAppPromo = (currentSettings.appPromo as AppPromoConfig | undefined) ?? {};
        settingsPatch.appPromo = { ...currentAppPromo, ...input.appPromo };
      }
      if (input.receiptMessages !== undefined) {
        const currentMessages = (currentSettings.receiptMessages as Record<string, string> | undefined) ?? {};
        const merged: Record<string, string> = { ...currentMessages, ...input.receiptMessages };
        for (const k of Object.keys(merged)) if (!merged[k]) delete merged[k];
        settingsPatch.receiptMessages = merged;
      }
      if (input.adminLoginImageUrl !== undefined) {
        if (input.adminLoginImageUrl) settingsPatch.adminLoginImageUrl = input.adminLoginImageUrl;
        else delete settingsPatch.adminLoginImageUrl;
      }
      if (input.seo !== undefined) {
        const currentSeo = (currentSettings.seo as Record<string, Record<string, unknown>> | undefined) ?? {};
        const nextSeo: Record<string, unknown> = { ...currentSeo, ...input.seo };
        // Sub-groups merge key by key so saving one screen (e.g. Tracking) never wipes another's fields.
        for (const group of ["business", "tracking", "robots", "sitemap"] as const) {
          if (input.seo[group] !== undefined) nextSeo[group] = { ...(currentSeo[group] ?? {}), ...input.seo[group] };
        }
        settingsPatch.seo = nextSeo;
      }
      if (input.aboutContent !== undefined) {
        const currentAboutContent = (currentSettings.aboutContent as AboutContentConfig | undefined) ?? {};
        settingsPatch.aboutContent = { ...currentAboutContent, ...input.aboutContent };
      }
    }

    const { settings, ...restaurant } = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.footerLogoUrl !== undefined ? { footerLogoUrl: input.footerLogoUrl } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
        ...(input.socialLinks !== undefined ? { socialLinks: input.socialLinks } : {}),
        ...(input.receiptLogoUrl !== undefined ? { receiptLogoUrl: input.receiptLogoUrl } : {}),
        ...(input.receiptTaxNumber !== undefined ? { receiptTaxNumber: input.receiptTaxNumber } : {}),
        ...(input.receiptFooterText !== undefined ? { receiptFooterText: input.receiptFooterText } : {}),
        ...(input.receiptThankYouMessage !== undefined ? { receiptThankYouMessage: input.receiptThankYouMessage } : {}),
        ...(input.kitchenReceiptHeaderText !== undefined ? { kitchenReceiptHeaderText: input.kitchenReceiptHeaderText } : {}),
        ...(input.kitchenReceiptFooterText !== undefined ? { kitchenReceiptFooterText: input.kitchenReceiptFooterText } : {}),
        ...(input.productImageFallbackSource !== undefined ? { productImageFallbackSource: input.productImageFallbackSource } : {}),
        ...(settingsPatch !== undefined ? { settings: settingsPatch as never } : {}),
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        footerLogoUrl: true,
        currency: true,
        contactPhone: true,
        contactEmail: true,
        socialLinks: true,
        settings: true,
        receiptLogoUrl: true,
        receiptTaxNumber: true,
        receiptFooterText: true,
        receiptThankYouMessage: true,
        kitchenReceiptHeaderText: true,
        kitchenReceiptFooterText: true,
        productImageFallbackSource: true,
      },
    });
    return {
      ...restaurant,
      header: this.resolveHeaderConfig(settings),
      footer: this.resolveFooterConfig(settings),
      pages: this.resolvePagesConfig(settings),
      locationPopup: this.resolveLocationPopupConfig(settings),
      loyalty: resolveLoyaltyConfig(settings),
      appPromo: this.resolveAppPromoConfig(settings),
      checkout: this.resolveCheckoutConfig(settings),
      aboutContent: this.resolveAboutContentConfig(settings),
      receiptMessages: this.resolveReceiptMessages(settings),
    };
  }

  /** The `heading` column is repurposed as an admin-only reference title (never rendered on the website) — exposed to the admin UI as `title`. */
  private toAdminBanner<T extends { heading: string | null }>(banner: T) {
    const { heading, ...rest } = banner;
    return { ...rest, title: heading };
  }

  /** Admin listing — every banner regardless of status/date, unlike the public listBanners(). */
  async adminListBanners() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const banners = await this.prisma.banner.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" } });
    return banners.map((b) => this.toAdminBanner(b));
  }

  async createBanner(input: CreateBannerInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const banner = await this.prisma.banner.create({
      data: {
        restaurantId,
        image: input.image,
        heading: input.title,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        sortOrder: input.sortOrder,
        status: input.status,
        pages: input.pages,
      },
    });
    return this.toAdminBanner(banner);
  }

  private async findOwnedBanner(id: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner || banner.restaurantId !== restaurantId) {
      throw new NotFoundException({ code: "BANNER_NOT_FOUND", message: "Banner not found" });
    }
    return banner;
  }

  async updateBanner(id: string, input: UpdateBannerInput) {
    await this.findOwnedBanner(id);
    const banner = await this.prisma.banner.update({
      where: { id },
      data: {
        ...(input.image !== undefined ? { image: input.image } : {}),
        ...(input.title !== undefined ? { heading: input.title } : {}),
        ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
        ...(input.endDate !== undefined ? { endDate: new Date(input.endDate) } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.pages !== undefined ? { pages: input.pages } : {}),
      },
    });
    return this.toAdminBanner(banner);
  }

  async deleteBanner(id: string) {
    await this.findOwnedBanner(id);
    await this.prisma.banner.delete({ where: { id } });
  }

  // ---- Marketing pop-ups ----

  private popupData(input: UpdatePopupInput) {
    const d = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);
    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.image !== undefined ? { image: input.image } : {}),
      ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl || null } : {}),
      ...(input.pages !== undefined ? { pages: input.pages } : {}),
      ...(input.audience !== undefined ? { audience: input.audience } : {}),
      ...(input.device !== undefined ? { device: input.device } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.repeatDays !== undefined ? { repeatDays: input.repeatDays } : {}),
      ...(input.delaySeconds !== undefined ? { delaySeconds: input.delaySeconds } : {}),
      ...(input.startDate !== undefined ? { startDate: d(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: d(input.endDate) } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
  }

  /** Public — active pop-ups for a page; the first one in sort order is shown by the storefront. The end date counts through the end of that day. */
  async listPopups(page: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const now = new Date();
    const rows = await this.prisma.marketingPopup.findMany({
      where: { restaurantId, status: "ACTIVE", pages: { hasSome: [page.toUpperCase(), "ALL"] }, OR: [{ startDate: null }, { startDate: { lte: now } }] },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { id: true, image: true, linkUrl: true, audience: true, device: true, frequency: true, repeatDays: true, delaySeconds: true, endDate: true, updatedAt: true },
    });
    const DAY = 24 * 60 * 60 * 1000;
    return rows.filter((p) => !p.endDate || p.endDate.getTime() + DAY > now.getTime()).map(({ endDate, ...rest }) => rest);
  }

  async trackPopup(id: string, kind: "view" | "click") {
    await this.prisma.marketingPopup
      .update({ where: { id }, data: kind === "view" ? { viewCount: { increment: 1 } } : { clickCount: { increment: 1 } } })
      .catch(() => undefined);
  }

  async adminListPopups() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.marketingPopup.findMany({ where: { restaurantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
  }

  async createPopup(input: CreatePopupInput) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.marketingPopup.create({ data: { restaurantId, name: input.name, image: input.image, ...this.popupData(input) } });
  }

  private async findOwnedPopup(id: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const popup = await this.prisma.marketingPopup.findUnique({ where: { id } });
    if (!popup || popup.restaurantId !== restaurantId) throw new NotFoundException({ code: "POPUP_NOT_FOUND", message: "Pop-up not found" });
    return popup;
  }

  async updatePopup(id: string, input: UpdatePopupInput) {
    await this.findOwnedPopup(id);
    return this.prisma.marketingPopup.update({ where: { id }, data: this.popupData(input) });
  }

  async deletePopup(id: string) {
    await this.findOwnedPopup(id);
    await this.prisma.marketingPopup.delete({ where: { id } });
  }
}
