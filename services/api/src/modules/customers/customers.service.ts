import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { verifyPassword, hashPassword } from "@restaurant/auth";
import type { StaffJwtPayload } from "@restaurant/auth";
import type {
  AdjustLoyaltyInput,
  ChangePasswordInput,
  CreateAddressInput,
  UpdateAddressInput,
  UpdateCustomerProfileInput,
} from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  // ---------- Profile ----------

  async updateProfile(customerId: string, input: UpdateCustomerProfileInput) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

    if (input.phone && input.phone !== customer.phone) {
      const taken = await this.prisma.customer.findUnique({
        where: { restaurantId_phone: { restaurantId: customer.restaurantId, phone: input.phone } },
      });
      if (taken) throw new ConflictException({ code: "PHONE_TAKEN", message: "An account with this phone number already exists" });
    }
    if (input.email && input.email !== customer.email) {
      const taken = await this.prisma.customer.findUnique({
        where: { restaurantId_email: { restaurantId: customer.restaurantId, email: input.email } },
      });
      if (taken) throw new ConflictException({ code: "EMAIL_ALREADY_REGISTERED", message: "An account with this email already exists" });
    }

    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        gender: input.gender,
        dob: input.dob,
        profileImage: input.profileImage,
      },
    });
  }

  async changePassword(customerId: string, input: ChangePasswordInput) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const valid = customer.passwordHash ? await verifyPassword(input.currentPassword, customer.passwordHash) : false;
    if (!valid) throw new BadRequestException({ code: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect" });

    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.customer.update({ where: { id: customerId }, data: { passwordHash, refreshTokenHash: null } });
    return { changed: true };
  }

  // ---------- Addresses ----------
  // Every method here filters by customerId — a customer can never touch another customer's
  // address by guessing an id (Rule 19: no cross-customer data access).

  listAddresses(customerId: string) {
    return this.prisma.customerAddress.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
  }

  async createAddress(customerId: string, input: CreateAddressInput) {
    if (input.isDefault) {
      await this.prisma.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    return this.prisma.customerAddress.create({ data: { customerId, ...input } });
  }

  private async getOwnedAddress(customerId: string, addressId: string) {
    const address = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!address || address.customerId !== customerId) {
      throw new NotFoundException({ code: "ADDRESS_NOT_FOUND", message: "Address not found" });
    }
    return address;
  }

  async updateAddress(customerId: string, addressId: string, input: UpdateAddressInput) {
    await this.getOwnedAddress(customerId, addressId);
    if (input.isDefault) {
      await this.prisma.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    return this.prisma.customerAddress.update({ where: { id: addressId }, data: input });
  }

  async removeAddress(customerId: string, addressId: string) {
    await this.getOwnedAddress(customerId, addressId);
    await this.prisma.customerAddress.delete({ where: { id: addressId } });
    return { deleted: true };
  }

  async setDefaultAddress(customerId: string, addressId: string) {
    await this.getOwnedAddress(customerId, addressId);
    await this.prisma.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    return this.prisma.customerAddress.update({ where: { id: addressId }, data: { isDefault: true } });
  }

  // ---------- Favourites ----------

  listFavourites(customerId: string) {
    return this.prisma.customerFavourite.findMany({
      where: { customerId },
      include: { product: { include: { images: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async addFavourite(customerId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });

    return this.prisma.customerFavourite.upsert({
      where: { customerId_productId: { customerId, productId } },
      create: { customerId, productId },
      update: {},
    });
  }

  async removeFavourite(customerId: string, productId: string) {
    await this.prisma.customerFavourite.deleteMany({ where: { customerId, productId } });
    return { deleted: true };
  }

  // ---------- Loyalty (read-only here — writes only happen via the order pipeline ledger) ----------

  async getLoyalty(customerId: string) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
      include: { transactions: { orderBy: { createdAt: "desc" }, take: 50 } },
    });
    return { pointsBalance: account?.pointsBalance ?? 0, transactions: account?.transactions ?? [] };
  }

  // ---------- Staff-facing customer management ----------
  // Every order that ever touches this restaurant should be traceable to a "customer" row here —
  // even a purely-online guest checkout that only ever gave a phone number and never registered.
  // Real `Customer` rows (registered via email OTP, or auto-created off a POS walk-in phone+name)
  // are the primary source; on top of that we fold in synthetic rows for phone numbers that show
  // up on unlinked orders (`customerId: null`) but never got a `Customer` row at all — keyed by
  // `guest:<phone>` so the frontend can tell a synthetic row apart from a real one when asking for
  // detail/order-history.

  async listForStaff(search?: string, status?: "registered" | "guest") {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const searchFilter = search
      ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { phone: { contains: search } }, { email: { contains: search, mode: "insensitive" as const } }] }
      : {};

    const customers = await this.prisma.customer.findMany({
      where: {
        restaurantId,
        ...searchFilter,
        ...(status === "registered" ? { isGuest: false } : status === "guest" ? { isGuest: true } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isGuest: true,
        status: true,
        createdAt: true,
        loyaltyAccount: { select: { pointsBalance: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const rows = customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      isGuest: c.isGuest,
      status: c.status,
      createdAt: c.createdAt,
      loyaltyPoints: c.loyaltyAccount?.pointsBalance ?? 0,
      orderCount: c._count.orders,
    }));

    // "registered" status never needs the phone-only fold-in — those orders never belong to a
    // registered customer by definition.
    if (status === "registered") {
      return rows;
    }

    const knownPhones = new Set(customers.map((c) => c.phone));
    const guestOrders = await this.prisma.order.findMany({
      where: { restaurantId, customerId: null, contactPhone: { not: null } },
      select: { contactPhone: true, contactName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const guestGroups = new Map<string, { phone: string; name: string; createdAt: Date; orderCount: number }>();
    for (const o of guestOrders) {
      const phone = o.contactPhone!;
      if (knownPhones.has(phone)) continue; // already represented by a real Customer row above
      const existing = guestGroups.get(phone);
      if (existing) {
        existing.orderCount += 1;
      } else {
        // Orders are already createdAt-desc, so the first one seen per phone is the most recent.
        guestGroups.set(phone, { phone, name: o.contactName ?? phone, createdAt: o.createdAt, orderCount: 1 });
      }
    }

    let guestRows = [...guestGroups.values()].map((g) => ({
      id: `guest:${g.phone}`,
      name: g.name,
      email: null as string | null,
      phone: g.phone,
      isGuest: true,
      // Synthetic phone-only rows have no Customer record to block — they never authenticate
      // in the first place, so there's nothing for a block toggle to act on.
      status: "ACTIVE" as const,
      createdAt: g.createdAt,
      loyaltyPoints: 0,
      orderCount: g.orderCount,
    }));

    if (search) {
      const term = search.toLowerCase();
      guestRows = guestRows.filter((g) => g.name.toLowerCase().includes(term) || g.phone.includes(search));
    }

    return [...rows, ...guestRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 200);
  }

  // Excludes passwordHash/refreshTokenHash — every caller here (loyalty adjust, block
  // status, staff detail view) only ever needs identity/profile fields, never the credentials.
  private async assertOwnedByRestaurant(customerId: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        restaurantId: true,
        name: true,
        email: true,
        phone: true,
        gender: true,
        dob: true,
        profileImage: true,
        isGuest: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!customer || customer.restaurantId !== restaurantId) {
      throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
    }
    return customer;
  }

  async getForStaff(customerId: string) {
    if (customerId.startsWith("guest:")) {
      const phone = customerId.slice("guest:".length);
      const restaurantId = await this.restaurantContext.getRestaurantId();
      const [orderCount, latest, blockedRow] = await Promise.all([
        this.prisma.order.count({ where: { restaurantId, customerId: null, contactPhone: phone } }),
        this.prisma.order.findFirst({
          where: { restaurantId, customerId: null, contactPhone: phone },
          orderBy: { createdAt: "desc" },
          select: { contactName: true, contactEmail: true, createdAt: true },
        }),
        // The moment this phone gets blocked, a real Customer row is materialized for it (see
        // blockGuestPhone) — check for one so a stale `guest:<phone>` id still reflects the
        // current block status instead of always reporting ACTIVE.
        this.prisma.customer.findUnique({ where: { restaurantId_phone: { restaurantId, phone } }, select: { status: true } }),
      ]);
      if (orderCount === 0) {
        throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      return {
        id: customerId,
        name: latest?.contactName ?? phone,
        email: latest?.contactEmail ?? null,
        phone,
        isGuest: true,
        status: blockedRow?.status ?? "ACTIVE",
        createdAt: latest?.createdAt ?? new Date(),
        orderCount,
      };
    }

    const customer = await this.assertOwnedByRestaurant(customerId);
    const [loyalty, orderCount] = await Promise.all([
      this.getLoyalty(customerId),
      this.prisma.order.count({ where: { customerId } }),
    ]);
    return { ...customer, loyalty, orderCount };
  }

  /**
   * Blocking a customer (status: INACTIVE) stops them logging in — both the OTP and legacy
   * password login paths already reject anything but an ACTIVE customer — and immediately kills
   * any session they're still holding by clearing refreshTokenHash, so a blocked customer can't
   * just keep refreshing their existing access token indefinitely. It also stops *any* future
   * order (guest checkout or POS) placed against their phone — see OrdersService.assertPhoneNotBlocked.
   */
  async setStatus(customerId: string, status: "ACTIVE" | "INACTIVE") {
    if (customerId.startsWith("guest:")) {
      if (status === "ACTIVE") {
        throw new BadRequestException({ code: "GUEST_CANNOT_BE_BLOCKED", message: "This customer has no account to unblock — they have never registered" });
      }
      return this.blockGuestPhone(customerId.slice("guest:".length));
    }
    await this.assertOwnedByRestaurant(customerId);
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { status, ...(status === "INACTIVE" ? { refreshTokenHash: null } : {}) },
      select: { id: true, name: true, email: true, phone: true, isGuest: true, status: true, createdAt: true },
    });
  }

  /**
   * A pure guest identity (contactPhone on unlinked orders, never a Customer row) can't be
   * blocked by flipping a status column — there's no row. Blocking it materializes a real
   * (still isGuest: true, so it never gets loyalty) Customer row for that phone so every future
   * order — guest checkout or POS — gets caught by the same phone-block check a registered
   * customer's block already goes through. Always uses a placeholder email (mirrors the POS
   * walk-in pattern) rather than trusting a contactEmail the guest typed, to avoid a unique-email
   * collision against some other customer who happens to share that address.
   */
  private async blockGuestPhone(phone: string) {
    const restaurantId = await this.restaurantContext.getRestaurantId();

    const existing = await this.prisma.customer.findUnique({ where: { restaurantId_phone: { restaurantId, phone } } });
    if (existing) {
      return this.prisma.customer.update({
        where: { id: existing.id },
        data: { status: "INACTIVE", refreshTokenHash: null },
        select: { id: true, name: true, email: true, phone: true, isGuest: true, status: true, createdAt: true },
      });
    }

    const latestOrder = await this.prisma.order.findFirst({
      where: { restaurantId, customerId: null, contactPhone: phone },
      orderBy: { createdAt: "desc" },
      select: { contactName: true },
    });
    if (!latestOrder) {
      throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
    }

    return this.prisma.customer.create({
      data: {
        restaurantId,
        name: latestOrder.contactName ?? phone,
        phone,
        email: `blocked-${phone}@placeholder.internal`,
        isGuest: true,
        status: "INACTIVE",
      },
      select: { id: true, name: true, email: true, phone: true, isGuest: true, status: true, createdAt: true },
    });
  }

  /**
   * Manual admin adjustment (CLAUDE.md §12) — still ledger-only, never overwrites the balance
   * directly. Branch-scoped staff (CLAUDE.md's new §15) may only touch loyalty for a customer
   * who has actually ordered from one of their branches — Owner/Admin are unrestricted. A
   * customer's point balance itself stays restaurant-wide (see LoyaltyTransaction.branchId's
   * schema comment) — this only gates who's allowed to *manage* it, not where it can be spent.
   */
  async adjustLoyalty(customerId: string, input: AdjustLoyaltyInput, staff: StaffJwtPayload) {
    const customer = await this.assertOwnedByRestaurant(customerId);
    if (customer.isGuest) {
      throw new BadRequestException({ code: "CUSTOMER_NOT_REGISTERED", message: "Loyalty points can only be granted to registered customers" });
    }
    if (!staff.isOwner) {
      const hasOrderAtOwnBranch = await this.prisma.order.findFirst({
        where: { customerId, branchId: { in: staff.branchIds } },
        select: { id: true },
      });
      if (!hasOrderAtOwnBranch) {
        throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "This customer has no order history at your branch" });
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.loyaltyAccount.upsert({
        where: { customerId },
        create: { customerId, pointsBalance: 0 },
        update: {},
      });
      if (input.points < 0 && account.pointsBalance + input.points < 0) {
        throw new BadRequestException({ code: "INSUFFICIENT_POINTS", message: "Adjustment would result in negative points balance" });
      }
      await tx.loyaltyTransaction.create({
        data: { loyaltyAccountId: account.id, type: "ADJUSTMENT", points: input.points, note: input.note },
      });
      return tx.loyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: { increment: input.points } } });
    });
  }
}
