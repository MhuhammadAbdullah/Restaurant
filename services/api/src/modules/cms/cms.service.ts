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
  type CreateBannerInput,
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

  /** Same pattern, for settings.aboutContent (homepage heading + expandable paragraph, shown just above the footer). */
  private resolveAboutContentConfig(settings: unknown): Required<AboutContentConfig> {
    const stored = (settings as { aboutContent?: AboutContentConfig } | null | undefined)?.aboutContent ?? {};
    return { ...DEFAULT_ABOUT_CONTENT_CONFIG, ...stored };
  }

  async getStaticPage(slug: StaticPageSlug) {
    if (!STATIC_PAGE_SLUGS.includes(slug)) {
      throw new NotFoundException({ code: "PAGE_NOT_FOUND", message: "Page not found" });
    }
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { settings: true } });
    return this.resolvePagesConfig(restaurant.settings)[slug];
  }

  async listSections() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.websiteSection.findMany({
      where: { restaurantId, status: "ACTIVE" },
      include: { category: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  /** Public — only what the customer website needs to render the slider. The admin-only title never leaves adminListBanners(). */
  async listBanners() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        restaurantId,
        status: "ACTIVE",
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
      aboutContent: this.resolveAboutContentConfig(settings),
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
      input.aboutContent !== undefined
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
      if (input.appPromo !== undefined) {
        const currentAppPromo = (currentSettings.appPromo as AppPromoConfig | undefined) ?? {};
        settingsPatch.appPromo = { ...currentAppPromo, ...input.appPromo };
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
      aboutContent: this.resolveAboutContentConfig(settings),
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
      },
    });
    return this.toAdminBanner(banner);
  }

  async deleteBanner(id: string) {
    await this.findOwnedBanner(id);
    await this.prisma.banner.delete({ where: { id } });
  }
}
