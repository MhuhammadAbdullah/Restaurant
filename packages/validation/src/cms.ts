import { z } from "zod";
import { loyaltyConfigSchema } from "./loyalty";

// Header icons (location/contact/complaint/cart/hamburger) are fixed, professionally-coded
// icons in the app itself now — no longer admin-selectable, so there's no icon-key/color schema
// for them anymore. Only the button text stays admin-configurable.
export const headerConfigSchema = z
  .object({
    deliveryButtonLabel: z.string().trim().min(1).max(60),
    pickupButtonLabel: z.string().trim().min(1).max(60),
    contactButtonLabel: z.string().trim().min(1).max(60),
    complaintButtonLabel: z.string().trim().min(1).max(60),
    showCartIcon: z.boolean(),
    showHamburgerIcon: z.boolean(),
  })
  .partial();
export type HeaderConfig = z.infer<typeof headerConfigSchema>;

export const DEFAULT_HEADER_CONFIG: Required<HeaderConfig> = {
  deliveryButtonLabel: "Delivery from",
  pickupButtonLabel: "Pick-Up from",
  contactButtonLabel: "Contact",
  complaintButtonLabel: "Submit a Complaint",
  showCartIcon: true,
  showHamburgerIcon: true,
};

export const footerConfigSchema = z
  .object({
    tagline: z.string().trim().max(200),
    /** Free-text operating hours line, e.g. "Monday - Sunday: 11:00 AM - 04:55 AM". */
    timingText: z.string().trim().max(300),
  })
  .partial();
export type FooterConfig = z.infer<typeof footerConfigSchema>;

export const DEFAULT_FOOTER_CONFIG: Required<FooterConfig> = {
  tagline: "Exquisite range of flavours, delivered fresh.",
  timingText: "Monday - Sunday: 11:00 AM - 04:55 AM",
};

/**
 * Full branding/text control for the customer website's mandatory location-gate popup.
 * `logoUrl` is deliberately left out of the "required" default below — when unset it falls back
 * to the main header logo (same fallback pattern as footerLogoUrl/receiptLogoUrl elsewhere).
 * `cityIcons` maps a city name (as it appears on a Branch) to an icon image URL — any city not
 * present here renders a generic building icon on the website.
 */
export const locationPopupConfigSchema = z
  .object({
    logoUrl: z.string().trim().url().max(500).nullable(),
    heading: z.string().trim().min(1).max(100),
    subheading: z.string().trim().min(1).max(150),
    deliveryLabel: z.string().trim().min(1).max(40),
    pickupLabel: z.string().trim().min(1).max(40),
    cityStepLabel: z.string().trim().min(1).max(100),
    useCurrentLocationLabel: z.string().trim().min(1).max(60),
    /** Falls back to the built-in pin icon when unset. */
    useCurrentLocationIconUrl: z.string().trim().url().max(500).nullable(),
    areaStepLabel: z.string().trim().min(1).max(60),
    areaSearchPlaceholder: z.string().trim().min(1).max(100),
    branchStepLabel: z.string().trim().min(1).max(60),
    branchSearchPlaceholder: z.string().trim().min(1).max(100),
    branchLocationLabel: z.string().trim().min(1).max(60),
    getDirectionsLabel: z.string().trim().min(1).max(40),
    submitLabel: z.string().trim().min(1).max(40),
    cityIcons: z.record(z.string().trim().min(1).max(80), z.string().trim().url().max(500)),
  })
  .partial();
export type LocationPopupConfig = z.infer<typeof locationPopupConfigSchema>;

export const DEFAULT_LOCATION_POPUP_CONFIG: Required<Omit<LocationPopupConfig, "logoUrl" | "useCurrentLocationIconUrl">> = {
  heading: "Select Your Order Type",
  subheading: "Please select your location",
  deliveryLabel: "Delivery",
  pickupLabel: "Pick-Up",
  cityStepLabel: "Please Select City",
  useCurrentLocationLabel: "Use Current Location",
  areaStepLabel: "Select Area",
  areaSearchPlaceholder: "Search your area...",
  branchStepLabel: "Select Branch",
  branchSearchPlaceholder: "Search branches...",
  branchLocationLabel: "Branch Location",
  getDirectionsLabel: "Get Directions",
  submitLabel: "Select",
  cityIcons: {
    karachi: "https://kababjeesfriedchicken.com/assets/svg/karachi.svg",
    hyderabad: "https://kababjeesfriedchicken.com/assets/svg/hyderabad.svg",
  },
};

/** Keep in sync with the icon map in apps/web/src/components/icons.tsx (SOCIAL_ICONS). */
export const SOCIAL_PLATFORM_KEYS = ["facebook", "instagram", "twitter", "youtube", "tiktok", "linkedin", "whatsapp"] as const;
export type SocialPlatformKey = (typeof SOCIAL_PLATFORM_KEYS)[number];
const socialLinksSchema = z.record(z.enum(SOCIAL_PLATFORM_KEYS), z.string().trim().url());

const staticPageContentSchema = z.object({
  title: z.string().trim().min(1).max(150),
  content: z.string().trim().min(1).max(20000),
});
export type StaticPageContent = z.infer<typeof staticPageContentSchema>;

export const faqItemSchema = z.object({
  id: z.string().trim().min(1).max(60),
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(3000),
});
export type FaqItem = z.infer<typeof faqItemSchema>;

/** FAQs render as an accordion on the website, so — unlike Terms/Privacy — its content is a list of Q&A items rather than one long document. */
const faqsPageContentSchema = z.object({
  title: z.string().trim().min(1).max(150),
  items: z.array(faqItemSchema).max(50),
});
export type FaqsPageContent = z.infer<typeof faqsPageContentSchema>;

export const STATIC_PAGE_SLUGS = ["terms", "privacy", "faqs"] as const;
export type StaticPageSlug = (typeof STATIC_PAGE_SLUGS)[number];

export const pagesConfigSchema = z
  .object({
    terms: staticPageContentSchema,
    privacy: staticPageContentSchema,
    faqs: faqsPageContentSchema,
  })
  .partial();
export type PagesConfig = z.infer<typeof pagesConfigSchema>;

export const DEFAULT_PAGES_CONFIG: Required<PagesConfig> = {
  terms: {
    title: "Terms & Conditions",
    content: `## Cancellation Policy

Order cancellations are only applicable in cases where the restaurant rejects the order for any reason. In such cases, and if the order was paid online, a full refund will be initiated.

- **Refund Timeframe:** 7 to 14 business days
- **Mode of Refund:** Same mode as original payment
- **Processing Dependencies:** Refund processing times may vary depending on your bank or payment gateway provider.

We are not responsible for delays caused by payment processors or banking institutions beyond our control.

## Shipping and Delivery Policy

Orders placed through our website are delivered either through:

- Our own delivery personnel (restaurant's in-house riders), or
- Third-party last-mile delivery service providers.

Delivery timelines, charges, and availability may vary depending on your delivery location and order volume. While we strive to deliver all orders promptly, we do not take responsibility for delays caused by external delivery partners or circumstances beyond our control (e.g., weather, traffic, etc.).

Tracking updates, if applicable, will be provided via SMS or email upon dispatch of your order.`,
  },
  privacy: {
    title: "Privacy Policy",
    content: `## Information We Collect

When you create an account, place an order, or contact support, we collect information such as your name, phone number, email address, delivery addresses, and order history. Payment details are processed directly by our payment gateway partner — we never store your full card number.

## How We Use Your Information

We use your information to process orders, provide delivery updates, manage your loyalty balance, respond to complaints, and improve our menu and service. We do not sell your personal information to third parties.

## Cookies

Our website uses cookies and local storage to keep you logged in, remember your cart and delivery location, and understand how our site is used so we can improve it.

## Data Sharing

We share order details with the branch fulfilling your order and, where applicable, with delivery riders and payment processors solely to complete your transaction.

## Your Rights

You may request access to, correction of, or deletion of your personal data at any time by contacting us or through your account settings.`,
  },
  faqs: {
    title: "Frequently Asked Questions",
    items: [
      {
        id: "how-to-order",
        question: "How do I place an order?",
        answer:
          "Select your city and area, browse the menu, add items to your cart, and proceed to checkout. You can order as a guest or log in to save your details and earn loyalty points.",
      },
      {
        id: "payment-methods",
        question: "What payment methods do you accept?",
        answer: "We accept Cash on Delivery (COD) and Online Payment. Gift orders require online payment.",
      },
      {
        id: "track-order",
        question: "Can I track my order?",
        answer:
          "Yes — after placing an order you'll land on a live tracking page that updates automatically as your order moves from Confirmed to Preparing, Ready, and Out for Delivery.",
      },
      {
        id: "guest-checkout",
        question: "Do I need an account to order?",
        answer:
          "No, guest checkout is available. However, creating an account lets you save addresses, earn loyalty points, and view your order history.",
      },
      {
        id: "report-issue",
        question: "How do I report an issue with my order?",
        answer: 'Use the "Submit Your Complaint" option, choose a category, and describe the issue. Our team will respond and update the status as it is resolved.',
      },
    ],
  },
};

/** Homepage promo banner shown just above the footer — just an image; hidden entirely when none is uploaded. */
export const appPromoConfigSchema = z
  .object({
    bannerImage: z.string().trim().url().max(500).nullable(),
  })
  .partial();
export type AppPromoConfig = z.infer<typeof appPromoConfigSchema>;

export const DEFAULT_APP_PROMO_CONFIG: Required<AppPromoConfig> = {
  bannerImage: null,
};

/** Heading + long-form paragraph shown just above the footer, collapsed to `truncateLength` characters with a Show more/less toggle. */
export const aboutContentConfigSchema = z
  .object({
    enabled: z.boolean(),
    heading: z.string().trim().min(1).max(200),
    paragraph: z.string().trim().max(5000),
    truncateLength: z.number().int().min(50).max(2000),
  })
  .partial();
export type AboutContentConfig = z.infer<typeof aboutContentConfigSchema>;

export const DEFAULT_ABOUT_CONTENT_CONFIG: Required<AboutContentConfig> = {
  enabled: false,
  heading: "",
  paragraph: "",
  truncateLength: 280,
};

export const updateRestaurantSettingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  logoUrl: z.string().trim().url().max(500).optional().nullable(),
  footerLogoUrl: z.string().trim().url().max(500).optional().nullable(),
  contactPhone: z.string().trim().max(30).optional().nullable(),
  contactEmail: z.string().trim().email().optional().nullable(),
  socialLinks: socialLinksSchema.optional(),
  header: headerConfigSchema.optional(),
  footer: footerConfigSchema.optional(),
  pages: pagesConfigSchema.optional(),
  locationPopup: locationPopupConfigSchema.optional(),
  loyalty: loyaltyConfigSchema.optional(),
  appPromo: appPromoConfigSchema.optional(),
  aboutContent: aboutContentConfigSchema.optional(),
  receiptLogoUrl: z.string().trim().url().max(500).optional().nullable(),
  receiptTaxNumber: z.string().trim().max(60).optional().nullable(),
  receiptFooterText: z.string().trim().max(500).optional().nullable(),
  receiptThankYouMessage: z.string().trim().max(200).optional().nullable(),
  kitchenReceiptHeaderText: z.string().trim().max(200).optional().nullable(),
  kitchenReceiptFooterText: z.string().trim().max(200).optional().nullable(),
  /** Which logo (if either) stands in for a product's image when none has been uploaded yet. */
  productImageFallbackSource: z.enum(["HEADER", "FOOTER"]).optional().nullable(),
});
export type UpdateRestaurantSettingsInput = z.infer<typeof updateRestaurantSettingsSchema>;

export const createBannerSchema = z.object({
  image: z.string().trim().min(1).max(500),
  /** Admin-only reference label (e.g. "Diwali promo") — never shown on the customer website. */
  title: z.string().trim().max(150).optional(),
  startDate: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().min(0).default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});
export type CreateBannerInput = z.infer<typeof createBannerSchema>;

export const updateBannerSchema = createBannerSchema.partial();
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
