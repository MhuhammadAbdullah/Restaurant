import { PrismaClient } from "../generated/client";
import { hashPassword, PERMISSION_CATALOG } from "@restaurant/auth";

const prisma = new PrismaClient();

function placeholderImage(label: string) {
  return `https://placehold.co/640x480/161616/f7f3ee?text=${encodeURIComponent(label)}`;
}

async function main() {
  console.log("Seeding Demo Restaurant...");

  const existing = await prisma.restaurant.findFirst({ where: { name: "Demo Restaurant" } });
  if (existing) {
    console.log("Removing previous demo data...");
    await prisma.restaurant.delete({ where: { id: existing.id } });
  }

  const restaurant = await prisma.restaurant.create({
    data: {
      name: "Demo Restaurant",
      currency: "PKR",
      defaultTaxPct: 15,
      contactPhone: "+92 21 111 666 111",
      contactEmail: "info@demo-restaurant.test",
      socialLinks: {
        facebook: "https://facebook.com/demorestaurant",
        instagram: "https://instagram.com/demorestaurant",
        twitter: "https://twitter.com/demorestaurant",
      },
    },
  });

  // ---------- Permissions & Roles ----------
  // Roles are pure labels/identity — NO role implies any permission. Every staff member's access
  // is an explicit, individually-made grant (StaffUserPermission), set up per-person below.
  await prisma.permission.createMany({
    data: PERMISSION_CATALOG.map((p) => ({
      key: p.key,
      module: p.module,
      action: p.action,
      description: p.description,
    })),
    skipDuplicates: true,
  });
  const allPermissions = await prisma.permission.findMany();
  const permByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

  const ROLE_NAMES = ["Owner", "Admin", "Manager", "Kitchen Staff", "Restaurant Staff", "Cashier", "Rider"];
  const roleIds: Record<string, string> = {};
  for (const roleName of ROLE_NAMES) {
    const role = await prisma.role.create({
      data: { restaurantId: restaurant.id, name: roleName, isSystem: true },
    });
    roleIds[roleName] = role.id;
  }

  /** Emulates "Owner manually checked these boxes for this specific person" — per-person, not
   *  per-role, and never read as a role association at runtime. */
  async function grantPermissions(staffUserId: string, keys: string[]) {
    const rows = keys.map((key) => permByKey.get(key)).filter((id): id is string => !!id);
    await prisma.staffUserPermission.createMany({
      data: rows.map((permissionId) => ({ staffUserId, permissionId, granted: true })),
      skipDuplicates: true,
    });
  }

  // ---------- Branches ----------
  const dha = await prisma.branch.create({
    data: {
      restaurantId: restaurant.id,
      name: "DHA Branch",
      code: "DHA",
      city: "Karachi",
      area: "DHA Phase 6",
      address: "26th Street, DHA Phase 6, Karachi",
      phone: "+92 300 1110001",
      openingTime: "11:00",
      closingTime: "23:59",
      deliveryRadiusKm: 6,
      deliveryFee: 10000,
      minimumOrder: 50000,
      estimatedDeliveryMins: 45,
      latitude: 24.8,
      longitude: 67.04,
    },
  });
  const clifton = await prisma.branch.create({
    data: {
      restaurantId: restaurant.id,
      name: "Clifton Branch",
      code: "CLI",
      city: "Karachi",
      area: "Clifton Block 5",
      address: "Block 5, Clifton, Karachi",
      phone: "+92 300 1110002",
      openingTime: "12:00",
      closingTime: "23:59",
      deliveryRadiusKm: 5,
      deliveryFee: 12000,
      minimumOrder: 60000,
      estimatedDeliveryMins: 40,
      latitude: 24.8138,
      longitude: 67.03,
    },
  });
  const gulshan = await prisma.branch.create({
    data: {
      restaurantId: restaurant.id,
      name: "Gulshan Branch",
      code: "GUL",
      city: "Karachi",
      area: "Gulshan-e-Iqbal",
      address: "Block 13-D, Gulshan-e-Iqbal, Karachi",
      phone: "+92 300 1110003",
      openingTime: "11:30",
      closingTime: "23:30",
      deliveryRadiusKm: 7,
      deliveryFee: 9000,
      minimumOrder: 50000,
      estimatedDeliveryMins: 50,
      latitude: 24.92,
      longitude: 67.09,
    },
  });
  const branches = [dha, clifton, gulshan];

  for (const b of branches) {
    await prisma.deliveryArea.create({
      data: { branchId: b.id, city: b.city, area: b.area, isActive: true },
    });
    await prisma.restaurantTable.createMany({
      data: Array.from({ length: 6 }).map((_, i) => ({
        branchId: b.id,
        number: String(i + 1),
        capacity: i % 2 === 0 ? 2 : 4,
        section: i < 3 ? "Indoor" : "Outdoor",
      })),
    });
  }

  // ---------- Staff Users ----------
  const passwordHash = await hashPassword("Password123!");

  const owner = await prisma.staffUser.create({
    data: { restaurantId: restaurant.id, roleId: roleIds.Owner, name: "Restaurant Owner", email: "owner@demo-restaurant.test", passwordHash },
  });
  const admin = await prisma.staffUser.create({
    data: { restaurantId: restaurant.id, roleId: roleIds.Admin, name: "Admin User", email: "admin@demo-restaurant.test", passwordHash },
  });
  const manager = await prisma.staffUser.create({
    data: { restaurantId: restaurant.id, roleId: roleIds.Manager, name: "DHA Manager", email: "manager.dha@demo-restaurant.test", passwordHash },
  });
  const kitchenStaff = await prisma.staffUser.create({
    data: { restaurantId: restaurant.id, roleId: roleIds["Kitchen Staff"], name: "DHA Kitchen Staff", email: "kitchen.dha@demo-restaurant.test", passwordHash },
  });
  // allBranchesAccess demo: one isolated example of the new flag, deliberately not touching
  // Manager/Cashier's normal single-branch scoping that other flows may rely on.
  const frontStaff = await prisma.staffUser.create({
    data: { restaurantId: restaurant.id, roleId: roleIds["Restaurant Staff"], name: "DHA Front Staff", email: "staff.dha@demo-restaurant.test", passwordHash, allBranchesAccess: true },
  });
  const cashier = await prisma.staffUser.create({
    data: { restaurantId: restaurant.id, roleId: roleIds.Cashier, name: "DHA Cashier", email: "cashier.dha@demo-restaurant.test", passwordHash },
  });
  // Second Cashier, same role, different branch and different overrides — realizes the "same
  // role, individually different access" example directly (owner-controlled granular permissions).
  const cashier2 = await prisma.staffUser.create({
    data: { restaurantId: restaurant.id, roleId: roleIds.Cashier, name: "Gulshan Cashier", email: "cashier2.gulshan@demo-restaurant.test", passwordHash },
  });

  for (const b of branches) {
    await prisma.staffUserBranch.create({ data: { staffUserId: owner.id, branchId: b.id } });
    await prisma.staffUserBranch.create({ data: { staffUserId: admin.id, branchId: b.id } });
  }
  await prisma.staffUserBranch.create({ data: { staffUserId: manager.id, branchId: dha.id } });
  await prisma.staffUserBranch.create({ data: { staffUserId: kitchenStaff.id, branchId: dha.id } });
  await prisma.staffUserBranch.create({ data: { staffUserId: cashier.id, branchId: dha.id } });
  await prisma.staffUserBranch.create({ data: { staffUserId: cashier2.id, branchId: gulshan.id } });

  // Explicit, individually-chosen permission grants per person — no role implies any of these.
  // Admin gets every catalog key as Owner's own deliberate per-person choice for this account,
  // same mechanism as everyone else (not a role-based "Admin = full access" rule).
  await grantPermissions(admin.id, PERMISSION_CATALOG.map((p) => p.key));
  await grantPermissions(manager.id, [
    "orders.view", "orders.create", "orders.edit", "orders.cancel", "orders.refund", "orders.export",
    "pos.access", "pos.discount", "pos.void", "pos.refund",
    "kitchen.access", "kitchen.updateStatus",
    "products.view", "products.edit", "categories.view",
    "coupons.view", "coupons.create", "coupons.edit", "coupons.delete",
    "customers.view", "loyalty.view", "loyalty.adjust",
    "complaints.view", "complaints.assign", "complaints.reply", "complaints.resolve",
    "reports.view", "reports.export", "tables.view", "tables.create", "tables.edit", "tables.delete",
    "branches.view", "riders.view", "riders.assign",
  ]);
  await grantPermissions(kitchenStaff.id, ["kitchen.access", "kitchen.updateStatus", "orders.view", "products.view"]);
  await grantPermissions(frontStaff.id, ["orders.view", "orders.create", "orders.edit", "pos.access", "customers.view", "products.view", "tables.view"]);
  // Two Cashiers, same role, deliberately non-overlapping grants (spec's own example): Cashier A
  // can edit orders but never discounts; Cashier B can discount but never edit an order once placed.
  await grantPermissions(cashier.id, ["orders.view", "orders.create", "orders.edit", "pos.access", "customers.view", "products.view", "tables.view"]);
  await grantPermissions(cashier2.id, ["orders.view", "orders.create", "pos.access", "pos.discount", "customers.view", "products.view", "tables.view"]);

  // ---------- Categories ----------
  // "Popular" and "Deals" are real Category rows too (so admin manages their image/banner the
  // same way as any other category), but they're pseudo-categories: their product list on the
  // website comes from Product.isPopular / the Deal model, not from categoryId assignment.
  const categoryNames = ["Popular", "Deals", "Starters", "Burgers", "Pizza", "BBQ", "Drinks", "Desserts", "Extras"];
  const categories: Record<string, string> = {};
  for (const [i, name] of categoryNames.entries()) {
    const cat = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        name,
        sortOrder: i,
        image: placeholderImage(name),
        banner: name === "Popular" ? placeholderImage("Popular Banner") : undefined,
        // Demonstrates the main-page limit: Pizza has 2 products flagged showOnMainPage
        // below, but only the first (by mainPageSortOrder) will actually appear.
        mainPageLimit: name === "Pizza" ? 1 : undefined,
      },
    });
    categories[name] = cat.id;
    for (const b of branches) {
      await prisma.categoryBranchAvailability.create({ data: { categoryId: cat.id, branchId: b.id, isAvailable: true } });
    }
  }

  // ---------- Choice Groups ----------
  const crustGroup = await prisma.choiceGroup.create({
    data: {
      restaurantId: restaurant.id,
      name: "Choose Crust",
      isRequired: true,
      selectionType: "SINGLE",
      minSelect: 1,
      maxSelect: 1,
      options: {
        create: [
          { name: "Thin Crust", sortOrder: 0 },
          { name: "Cheese Burst", priceAdjustment: 15000, sortOrder: 1 },
          { name: "Hand Tossed", sortOrder: 2 },
        ],
      },
    },
    include: { options: true },
  });
  const flavourGroup = await prisma.choiceGroup.create({
    data: {
      restaurantId: restaurant.id,
      name: "Choose Flavour",
      isRequired: true,
      selectionType: "SINGLE",
      minSelect: 1,
      maxSelect: 1,
      options: {
        create: [
          { name: "Chicken Fajita", sortOrder: 0 },
          { name: "BBQ", sortOrder: 1 },
          { name: "Cheese", sortOrder: 2 },
          { name: "Pepperoni", priceAdjustment: 10000, sortOrder: 3 },
        ],
      },
    },
    include: { options: true },
  });
  const chickenPartGroup = await prisma.choiceGroup.create({
    data: {
      restaurantId: restaurant.id,
      name: "Choose Chicken Part",
      isRequired: true,
      selectionType: "SINGLE",
      minSelect: 1,
      maxSelect: 1,
      options: {
        create: [
          { name: "Leg", sortOrder: 0 },
          { name: "Chest", sortOrder: 1 },
        ],
      },
    },
    include: { options: true },
  });

  // ---------- Products ----------
  async function makeProduct(opts: {
    name: string;
    categoryId: string;
    basePrice: number;
    discountPrice?: number;
    description?: string;
    isFeatured?: boolean;
    isPopular?: boolean;
    showOnMainPage?: boolean;
    mainPageSortOrder?: number;
    choiceGroupIds?: string[];
    addonIds?: string[];
    outOfStockAt?: string[]; // branch codes
  }) {
    const product = await prisma.product.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: opts.categoryId,
        name: opts.name,
        description: opts.description ?? `${opts.name} — a Demo Restaurant favourite.`,
        basePrice: opts.basePrice,
        discountPrice: opts.discountPrice,
        isFeatured: opts.isFeatured ?? false,
        isPopular: opts.isPopular ?? false,
        showOnMainPage: opts.showOnMainPage ?? false,
        mainPageSortOrder: opts.mainPageSortOrder ?? 0,
        images: { create: [{ url: placeholderImage(opts.name), isPrimary: true }] },
      },
    });

    for (const b of branches) {
      await prisma.productBranchAvailability.create({
        data: { productId: product.id, branchId: b.id, isAvailable: !opts.outOfStockAt?.includes(b.code) },
      });
    }
    for (const cgId of opts.choiceGroupIds ?? []) {
      await prisma.productChoiceGroup.create({ data: { productId: product.id, choiceGroupId: cgId } });
    }
    for (const addonId of opts.addonIds ?? []) {
      await prisma.productAddon.create({ data: { productId: product.id, addonId } });
    }
    return product;
  }

  // Add-ons are always a presentation of an existing catalog Product (never freeform text) —
  // create the underlying products first, then the Addon Groups/Items that reference them.
  const cokeCan = await makeProduct({ name: "Coca-Cola 500ml", categoryId: categories.Drinks, basePrice: 10000 });
  const pepsiCan = await makeProduct({ name: "Pepsi 500ml Bottle", categoryId: categories.Drinks, basePrice: 10000 });
  const sevenUpCan = await makeProduct({ name: "7Up 500ml Bottle", categoryId: categories.Drinks, basePrice: 10000 });
  const extraCheeseProduct = await makeProduct({
    name: "Extra Cheese",
    categoryId: categories.Extras,
    basePrice: 15000,
    description: "A generous handful of mozzarella.",
  });
  const bbqSauceProduct = await makeProduct({ name: "BBQ Sauce", categoryId: categories.Extras, basePrice: 5000, description: "Smoky, tangy barbecue sauce." });
  const garlicSauceProduct = await makeProduct({ name: "Garlic Sauce", categoryId: categories.Extras, basePrice: 5000, description: "Creamy garlic dip." });

  // ---------- Addon Groups ----------
  const drinksAddonGroup = await prisma.addonGroup.create({
    data: { restaurantId: restaurant.id, name: "Add a Drink", isRequired: false, selectionType: "SINGLE", minSelect: 0, maxSelect: 1 },
  });
  // Custom display names diverge from the underlying product's catalog name — "Coca-Cola 500ml"
  // shows as just "Coke" inside this addon group, matching the spec's own example.
  await prisma.addon.create({ data: { addonGroupId: drinksAddonGroup.id, productId: cokeCan.id, name: "Coke", price: 10000, sortOrder: 0 } });
  await prisma.addon.create({ data: { addonGroupId: drinksAddonGroup.id, productId: pepsiCan.id, name: "Pepsi", price: 10000, sortOrder: 1 } });
  await prisma.addon.create({ data: { addonGroupId: drinksAddonGroup.id, productId: sevenUpCan.id, name: "7Up", price: 10000, sortOrder: 2 } });

  const extraCheeseGroup = await prisma.addonGroup.create({
    data: { restaurantId: restaurant.id, name: "Extra Cheese", isRequired: false, selectionType: "SINGLE", minSelect: 0, maxSelect: 1 },
  });
  const extraCheeseAddon = await prisma.addon.create({
    data: { addonGroupId: extraCheeseGroup.id, productId: extraCheeseProduct.id, name: "Extra Cheese", price: 15000, discountPrice: 10000, sortOrder: 0 },
  });

  const sauceGroup = await prisma.addonGroup.create({
    data: { restaurantId: restaurant.id, name: "Sauce", isRequired: false, selectionType: "MULTIPLE", minSelect: 0, maxSelect: 3 },
  });
  const bbqSauce = await prisma.addon.create({
    data: { addonGroupId: sauceGroup.id, productId: bbqSauceProduct.id, name: "BBQ Sauce", price: 5000, sortOrder: 0 },
  });
  const garlicSauce = await prisma.addon.create({
    data: { addonGroupId: sauceGroup.id, productId: garlicSauceProduct.id, name: "Garlic Sauce", price: 5000, sortOrder: 1 },
  });

  const pizza = await makeProduct({
    name: "Signature Pizza",
    categoryId: categories.Pizza,
    basePrice: 120000,
    discountPrice: 99900,
    isFeatured: true,
    isPopular: true,
    showOnMainPage: true,
    mainPageSortOrder: 0,
    choiceGroupIds: [flavourGroup.id, crustGroup.id],
    addonIds: [extraCheeseAddon.id],
    outOfStockAt: ["GUL"],
  });

  await makeProduct({
    name: "Veggie Delight Pizza",
    categoryId: categories.Pizza,
    basePrice: 110000,
    showOnMainPage: true,
    mainPageSortOrder: 1,
    choiceGroupIds: [crustGroup.id],
    addonIds: [extraCheeseAddon.id],
  });

  const chickenTikka = await makeProduct({
    name: "Chicken Tikka",
    categoryId: categories.BBQ,
    basePrice: 79000,
    isPopular: true,
    showOnMainPage: true,
    description: "Quarter chicken, marinated in ginger, garlic, red chilies and more, served with our special BBQ sauce.",
    choiceGroupIds: [chickenPartGroup.id],
    addonIds: [bbqSauce.id, garlicSauce.id],
  });
  await makeProduct({
    name: "Beef Seekh Kebab",
    categoryId: categories.BBQ,
    basePrice: 65000,
    addonIds: [bbqSauce.id, garlicSauce.id],
  });

  await makeProduct({
    name: "Zinger Burger",
    categoryId: categories.Burgers,
    basePrice: 45000,
    isPopular: true,
    showOnMainPage: true,
    addonIds: [extraCheeseAddon.id],
  });
  await makeProduct({ name: "Beef Burger", categoryId: categories.Burgers, basePrice: 50000, addonIds: [extraCheeseAddon.id] });

  await makeProduct({ name: "Spring Rolls", categoryId: categories.Starters, basePrice: 40000 });
  await makeProduct({ name: "Chicken Wings", categoryId: categories.Starters, basePrice: 60000, isPopular: true, addonIds: [bbqSauce.id, garlicSauce.id] });

  await makeProduct({ name: "Mineral Water", categoryId: categories.Drinks, basePrice: 8000 });

  await makeProduct({ name: "Chocolate Lava Cake", categoryId: categories.Desserts, basePrice: 35000, isFeatured: true });
  await makeProduct({ name: "Ice Cream Sundae", categoryId: categories.Desserts, basePrice: 25000 });

  // ---------- Deal: 2 Pizza + 2 Drinks (independent slot config) ----------
  const dealComponentsTotal = 120000 * 2 + 10000 * 2; // sum of full-price components
  const deal = await prisma.deal.create({
    data: {
      restaurantId: restaurant.id,
      name: "2 Pizza + 2 Drinks Deal",
      description: "Two pizzas, your way, plus two ice-cold drinks.",
      image: placeholderImage("2 Pizza + 2 Drinks Deal"),
      dealPrice: 249900,
      originalPrice: dealComponentsTotal,
    },
  });
  for (const b of branches) {
    await prisma.dealBranchAvailability.create({ data: { dealId: deal.id, branchId: b.id, isAvailable: true } });
  }

  const pizzaSlot1 = await prisma.dealSlot.create({ data: { dealId: deal.id, label: "Pizza 1", sortOrder: 0 } });
  const pizzaSlot2 = await prisma.dealSlot.create({ data: { dealId: deal.id, label: "Pizza 2", sortOrder: 1 } });
  const drinkSlot1 = await prisma.dealSlot.create({ data: { dealId: deal.id, label: "Drink 1", sortOrder: 2 } });
  const drinkSlot2 = await prisma.dealSlot.create({ data: { dealId: deal.id, label: "Drink 2", sortOrder: 3 } });

  for (const slot of [pizzaSlot1, pizzaSlot2]) {
    await prisma.dealSlotProductOption.create({ data: { dealSlotId: slot.id, productId: pizza.id } });
    await prisma.dealSlotChoiceGroup.create({ data: { dealSlotId: slot.id, choiceGroupId: flavourGroup.id } });
    await prisma.dealSlotChoiceGroup.create({ data: { dealSlotId: slot.id, choiceGroupId: crustGroup.id } });
    await prisma.dealSlotAddon.create({ data: { dealSlotId: slot.id, addonId: extraCheeseAddon.id } });
  }
  for (const slot of [drinkSlot1, drinkSlot2]) {
    await prisma.dealSlotProductOption.create({ data: { dealSlotId: slot.id, productId: cokeCan.id } });
    await prisma.dealSlotProductOption.create({ data: { dealSlotId: slot.id, productId: pepsiCan.id } });
  }

  // ---------- Website CMS ----------
  await prisma.websiteSection.create({
    data: {
      restaurantId: restaurant.id,
      type: "HERO",
      heading: "Exquisite Range of Flavours",
      description: "Order online from Demo Restaurant.",
      sortOrder: 0,
      config: { ctaText: "Order Now" },
    },
  });
  await prisma.banner.create({
    data: {
      restaurantId: restaurant.id,
      image: "https://placehold.co/1600x800/0d0d0d/ED2320?text=Demo+Restaurant",
      heading: "Exquisite Range of Flavours",
      description: "Order online from Demo Restaurant.",
      sortOrder: 0,
    },
  });
  const sectionCategories = ["Starters", "Pizza", "BBQ", "Burgers", "Drinks", "Desserts"];
  for (const [i, name] of sectionCategories.entries()) {
    await prisma.websiteSection.create({
      data: {
        restaurantId: restaurant.id,
        type: "PRODUCT_GRID",
        heading: `Range of ${name}`,
        categoryId: categories[name],
        sortOrder: i + 1,
      },
    });
  }

  // ---------- Customer ----------
  const customerPasswordHash = await hashPassword("Password123!");
  const customer = await prisma.customer.create({
    data: {
      restaurantId: restaurant.id,
      name: "Ali Khan",
      phone: "03001234567",
      email: "ali.khan@example.test",
      passwordHash: customerPasswordHash,
      isGuest: false,
    },
  });
  await prisma.customerAddress.create({
    data: {
      customerId: customer.id,
      label: "Home",
      city: "Karachi",
      area: "DHA Phase 6",
      addressLine: "House 12, Street 26, DHA Phase 6",
      landmark: "Near Sunset Boulevard",
      contactNumber: "03001234567",
      isDefault: true,
    },
  });
  await prisma.customerFavourite.create({ data: { customerId: customer.id, productId: chickenTikka.id } });

  const loyaltyAccount = await prisma.loyaltyAccount.create({ data: { customerId: customer.id, pointsBalance: 500 } });
  await prisma.loyaltyTransaction.create({
    data: { loyaltyAccountId: loyaltyAccount.id, type: "EARNED", points: 500, note: "Welcome bonus" },
  });

  // ---------- Demo Coupons ----------
  await prisma.coupon.create({
    data: {
      restaurantId: restaurant.id,
      code: "WELCOME10",
      description: "10% off, up to Rs. 300, on orders above Rs. 1000",
      discountType: "PERCENTAGE",
      discountValue: 10,
      maxDiscountAmount: 30000,
      minOrderValue: 100000,
      usageLimit: 500,
      perCustomerLimit: 1,
      status: "ACTIVE",
    },
  });
  await prisma.coupon.create({
    data: {
      restaurantId: restaurant.id,
      code: "FLAT200",
      description: "Flat Rs. 200 off on orders above Rs. 1500",
      discountType: "FIXED_AMOUNT",
      discountValue: 20000,
      minOrderValue: 150000,
      status: "ACTIVE",
    },
  });
  await prisma.coupon.create({
    data: {
      restaurantId: restaurant.id,
      code: "EXPIRED5",
      description: "Expired coupon — used to verify server-side date validation",
      discountType: "PERCENTAGE",
      discountValue: 5,
      startDate: new Date("2020-01-01"),
      endDate: new Date("2020-01-31"),
      status: "ACTIVE",
    },
  });

  // ---------- Demo Orders ----------
  const pastOrder = await prisma.order.create({
    data: {
      orderNumber: "ORD-20260801-1001",
      restaurantId: restaurant.id,
      branchId: dha.id,
      customerId: customer.id,
      type: "ONLINE_DELIVERY",
      source: "ONLINE",
      status: "DELIVERED",
      paymentMethod: "COD",
      paymentStatus: "PAID",
      contactName: "Ali Khan",
      contactPhone: "03001234567",
      deliveryCity: "Karachi",
      deliveryArea: "DHA Phase 6",
      deliveryAddressSnapshot: "House 12, Street 26, DHA Phase 6",
      subtotal: 79000,
      taxAmount: 11850,
      deliveryFee: 10000,
      grandTotal: 100850,
      estimatedDeliveryAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
      items: {
        create: [
          {
            productId: chickenTikka.id,
            nameSnapshot: chickenTikka.name,
            quantity: 1,
            unitPrice: 79000,
            lineTotal: 79000,
            choices: { create: [{ choiceOptionId: chickenPartGroup.options[0]!.id, nameSnapshot: "Leg", priceAdjustmentSnapshot: 0 }] },
          },
        ],
      },
    },
    include: { items: true },
  });
  await prisma.payment.create({
    data: { orderId: pastOrder.id, method: "COD", provider: "cod", status: "PAID", amount: 100850, paidAt: pastOrder.createdAt },
  });
  await prisma.receipt.create({ data: { orderId: pastOrder.id } });

  await prisma.complaint.create({
    data: {
      restaurantId: restaurant.id,
      customerId: customer.id,
      branchId: dha.id,
      orderId: pastOrder.id,
      productId: chickenTikka.id,
      category: "FOOD_QUALITY",
      subject: "Chicken Tikka was cold on arrival",
      description: "The order arrived cold, food quality wasn't up to the mark this time.",
      status: "OPEN",
    },
  });

  const pendingOrder = await prisma.order.create({
    data: {
      orderNumber: "ORD-20260809-2044",
      restaurantId: restaurant.id,
      branchId: dha.id,
      customerId: customer.id,
      type: "ONLINE_DELIVERY",
      source: "ONLINE",
      status: "PENDING",
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      contactName: "Ali Khan",
      contactPhone: "03001234567",
      deliveryCity: "Karachi",
      deliveryArea: "DHA Phase 6",
      deliveryAddressSnapshot: "House 12, Street 26, DHA Phase 6",
      subtotal: 120000,
      taxAmount: 18000,
      deliveryFee: 10000,
      grandTotal: 148000,
      estimatedDeliveryAt: new Date(Date.now() + 1000 * 60 * 45),
      items: {
        create: [
          {
            productId: pizza.id,
            nameSnapshot: pizza.name,
            quantity: 1,
            unitPrice: 120000,
            lineTotal: 120000,
            choices: {
              create: [
                { choiceOptionId: flavourGroup.options[0]!.id, nameSnapshot: "Chicken Fajita", priceAdjustmentSnapshot: 0 },
                { choiceOptionId: crustGroup.options[0]!.id, nameSnapshot: "Thin Crust", priceAdjustmentSnapshot: 0 },
              ],
            },
          },
        ],
      },
    },
  });
  await prisma.payment.create({ data: { orderId: pendingOrder.id, method: "COD", provider: "cod", status: "PENDING", amount: 148000 } });

  const posTable = await prisma.restaurantTable.findFirstOrThrow({ where: { branchId: dha.id, number: "2" } });
  const dineInOrder = await prisma.order.create({
    data: {
      orderNumber: "ORD-20260809-2055",
      restaurantId: restaurant.id,
      branchId: dha.id,
      createdByStaffId: frontStaff.id,
      tableId: posTable.id,
      type: "DINE_IN",
      source: "POS",
      status: "PREPARING",
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      subtotal: 145000,
      taxAmount: 21750,
      grandTotal: 166750,
      items: {
        create: [
          { productId: chickenTikka.id, nameSnapshot: chickenTikka.name, quantity: 1, unitPrice: 79000, lineTotal: 79000 },
          { productId: pepsiCan.id, nameSnapshot: pepsiCan.name, quantity: 2, unitPrice: 10000, lineTotal: 20000 },
        ],
      },
    },
  });
  await prisma.payment.create({ data: { orderId: dineInOrder.id, method: "COD", provider: "cod", status: "PENDING", amount: 166750 } });

  console.log("Seed complete:");
  console.log({
    restaurant: restaurant.name,
    branches: branches.map((b) => b.code),
    staffLogins: [owner, admin, manager, kitchenStaff, frontStaff, cashier, cashier2].map((s) => s.email),
    staffPassword: "Password123!",
    customerLogin: customer.phone,
    customerPassword: "Password123!",
    dealId: deal.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
