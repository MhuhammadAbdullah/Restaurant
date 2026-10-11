/**
 * How permissions are laid out in Staff & Access: the same sections and page names as the sidebar, so "can use the
 * Coupons page" is found under Catalog > Coupons rather than under a technical module name.
 * `modules` are the permission modules behind a row; `covers` lists the pages one row switches on.
 */
export type PermItem = { id: string; label: string; modules: string[]; covers?: string };
export type PermSection = { label: string; items: PermItem[] };

export const PERMISSION_SECTIONS: PermSection[] = [
  {
    label: "Operations",
    items: [
      { id: "orders", label: "Orders", modules: ["orders"] },
      { id: "pos", label: "POS", modules: ["pos"] },
      { id: "tables", label: "Tables", modules: ["tables"] },
      { id: "kitchen", label: "Kitchen", modules: ["kitchen"] },
      { id: "riders", label: "Riders", modules: ["riders"] },
      { id: "reports", label: "Order & Finance Reports", modules: ["reports"], covers: "Also the owner-style dashboard with sales and charts" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { id: "categories", label: "Categories", modules: ["categories"] },
      { id: "products", label: "Products", modules: ["products"] },
      { id: "deals", label: "Deals", modules: ["deals"] },
      { id: "choiceGroups", label: "Choice Sections", modules: ["choiceGroups"] },
      { id: "addonGroups", label: "Add-ons", modules: ["addonGroups"] },
      { id: "coupons", label: "Coupons", modules: ["coupons"] },
    ],
  },
  {
    label: "Customers",
    items: [
      { id: "customers", label: "Customers", modules: ["customers"], covers: "Includes downloading the customer list" },
      { id: "complaints", label: "Complaints", modules: ["complaints"] },
      { id: "loyalty", label: "Loyalty points of customers", modules: ["loyalty"], covers: "Seeing and adjusting a customer's points" },
    ],
  },
  {
    label: "Website",
    items: [
      { id: "settings", label: "Website settings", modules: ["settings"], covers: "Header & Branding, Footer, App Promo & About, Legal Pages, Receipts, Location Popup, Loyalty Program" },
      { id: "cms", label: "Hero Banners & Marketing Pop-ups", modules: ["cms"] },
    ],
  },
  {
    label: "Communication",
    items: [{ id: "emails", label: "Emails", modules: ["emails"], covers: "Email Templates, Write an Email, Email Log" }],
  },
  {
    label: "SEO & Marketing",
    items: [{ id: "seo", label: "SEO & Marketing", modules: ["seo"], covers: "SEO & Meta Tags, Tracking & Pixels, Robots & Sitemap, Redirects, SEO Health" }],
  },
  {
    label: "Administration",
    items: [
      { id: "branches", label: "Branches", modules: ["branches"], covers: "Branch details and Delivery Areas" },
      { id: "staff", label: "Staff & Access Management", modules: ["staff", "roles", "permissions"] },
      { id: "auditLogs", label: "Audit Logs", modules: ["auditLogs"] },
    ],
  },
];
