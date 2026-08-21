export type ChoiceOption = {
  id: string;
  name: string;
  image: string | null;
  priceAdjustment: number;
  discountPriceAdjustment: number | null;
  sortOrder: number;
};
export type ChoiceGroup = {
  id: string;
  name: string;
  description: string | null;
  isRequired: boolean;
  selectionType: "SINGLE" | "MULTIPLE";
  minSelect: number;
  maxSelect: number;
  options: ChoiceOption[];
};
export type Addon = {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  price: number;
  discountPrice: number | null;
  image: string | null;
  maxQuantity: number;
  addonGroupId: string;
  addonGroup: { id: string; name: string };
};

export type ProductChoiceGroupAssignment = {
  choiceGroupId: string;
  sortOrder: number;
  isRequiredOverride: boolean | null;
  minSelectOverride: number | null;
  maxSelectOverride: number | null;
  defaultChoiceOptionId: string | null;
  choiceGroup: ChoiceGroup;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  discountPrice: number | null;
  isFeatured: boolean;
  isPopular: boolean;
  images: { url: string; isPrimary: boolean }[];
  choiceGroups?: ProductChoiceGroupAssignment[];
  addons?: { addonId: string; sortOrder: number; addon: Addon }[];
  categoryId?: string;
};

export type DealSlot = {
  id: string;
  label: string;
  quantity: number;
  sortOrder: number;
  productOptions: { product: Product }[];
  choiceGroups: { choiceGroupId: string; choiceGroup: ChoiceGroup }[];
  addons: { addonId: string; sortOrder: number; addon: Addon }[];
};

export type Deal = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  categoryId: string | null;
  dealPrice: number;
  originalPrice: number | null;
  isFeatured: boolean;
  slots: DealSlot[];
};

export type Category = { id: string; name: string; image: string | null; banner: string | null; sortOrder: number; mainPageLimit: number | null };

export type WebsiteSection = {
  id: string;
  type: "HERO" | "CATEGORY_GRID" | "PRODUCT_GRID" | "CTA" | "BANNER_STRIP";
  heading: string | null;
  description: string | null;
  categoryId: string | null;
  category: Category | null;
  sortOrder: number;
};

export type Branch = {
  id: string;
  name: string;
  code: string;
  city: string;
  area: string;
  address: string;
  phone: string | null;
  email: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  mapUrl: string | null;
  deliveryFee: number;
  minimumOrder: number;
  estimatedDeliveryMins: number;
  pickupEnabled: boolean;
};

export type CartChoiceSelection = { choiceGroupId: string; choiceOptionId: string; name: string; priceAdjustment: number };
export type CartAddonSelection = { addonId: string; quantity: number; name: string; price: number };

export type CartProductItem = {
  cartItemId: string;
  kind: "product";
  productId: string;
  name: string;
  image?: string;
  quantity: number;
  unitPrice: number;
  choices: CartChoiceSelection[];
  addons: CartAddonSelection[];
  specialInstructions?: string;
};

export type CartDealSlotSelection = {
  dealSlotId: string;
  slotLabel: string;
  productId: string;
  productName: string;
  choices: CartChoiceSelection[];
  addons: CartAddonSelection[];
};

export type CartDealItem = {
  cartItemId: string;
  kind: "deal";
  dealId: string;
  name: string;
  image?: string;
  quantity: number;
  dealPrice: number;
  slots: CartDealSlotSelection[];
  specialInstructions?: string;
};

export type CartItem = CartProductItem | CartDealItem;

export function cartItemLineTotal(item: CartItem): number {
  if (item.kind === "product") {
    const choiceTotal = item.choices.reduce((s, c) => s + c.priceAdjustment, 0);
    const addonTotal = item.addons.reduce((s, a) => s + a.price * a.quantity, 0);
    return (item.unitPrice + choiceTotal + addonTotal) * item.quantity;
  }
  return item.dealPrice * item.quantity;
}

export type AddonCategory = { id: string; name: string; addons: Addon[] };

/** Groups a flat addon list into one bucket per Addon Category (AddonGroup) — each renders as its own dropdown. */
export function groupAddonsByCategory(addons: Addon[]): AddonCategory[] {
  const byId = new Map<string, AddonCategory>();
  for (const addon of addons) {
    const existing = byId.get(addon.addonGroupId);
    if (existing) existing.addons.push(addon);
    else byId.set(addon.addonGroupId, { id: addon.addonGroupId, name: addon.addonGroup.name, addons: [addon] });
  }
  return [...byId.values()];
}
