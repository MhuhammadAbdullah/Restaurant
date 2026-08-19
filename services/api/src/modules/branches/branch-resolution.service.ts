import { Injectable } from "@nestjs/common";
import { haversineKm } from "@restaurant/utils";
import type { ResolveBranchInput } from "@restaurant/validation";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RestaurantContextService } from "../../common/restaurant/restaurant-context.service";

export type BranchResolutionResult =
  | { eligible: true; branch: Awaited<ReturnType<BranchResolutionService["candidateBranches"]>>[number]; isOpen: boolean }
  | { eligible: false; message: string };

/**
 * CLAUDE.md §10 "Automatic Branch Selection": City match -> Area match -> delivery-area/radius
 * match -> branch active -> delivery/pickup available -> operating hours. Nearest wins if
 * coordinates are given. Re-run this at order-creation time too (Rule 7) — never trust a
 * client-cached branch id.
 */
@Injectable()
export class BranchResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurantContext: RestaurantContextService,
  ) {}

  private async candidateBranches() {
    const restaurantId = await this.restaurantContext.getRestaurantId();
    return this.prisma.branch.findMany({
      where: { restaurantId, status: "ACTIVE" },
      include: { deliveryAreas: { include: { area: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Public so checkout-time flows (order creation) can gate on it independently of location/area eligibility. */
  isBranchOpen(branch: { openingTime: string; closingTime: string; breakStart: string | null; breakEnd: string | null }): boolean {
    const now = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: false });
    const inRange = (start: string, end: string) => (start <= end ? now >= start && now <= end : now >= start || now <= end);

    if (!inRange(branch.openingTime, branch.closingTime)) return false;
    if (branch.breakStart && branch.breakEnd && inRange(branch.breakStart, branch.breakEnd)) return false;
    return true;
  }

  /**
   * Location/area eligibility only — deliberately excludes operating hours so the customer
   * can still browse a branch's menu (and its cards) while it's closed. Checkout is what must
   * block on hours (see isBranchOpen), not menu browsing.
   */
  async resolve(input: ResolveBranchInput): Promise<BranchResolutionResult> {
    const branches = await this.candidateBranches();
    const hasCoords = input.lat !== undefined && input.lng !== undefined;

    let eligible = branches;

    if (input.orderType === "DELIVERY") {
      eligible = eligible.filter((b) => b.deliveryEnabled);
      eligible = eligible.filter((b) => {
        // "Use Current Location" (no city picked yet) skips straight to the radius check below —
        // area matching only makes sense once the customer has actually chosen a city/area.
        if (input.city) {
          const areaMatch = b.deliveryAreas.some(
            (link) =>
              link.isActive &&
              link.area.isActive &&
              link.area.city.toLowerCase() === input.city!.toLowerCase() &&
              (!input.area || link.area.name.toLowerCase() === input.area.toLowerCase()),
          );
          if (areaMatch) return true;
        }
        if (hasCoords && b.latitude && b.longitude) {
          const distance = haversineKm({ lat: input.lat!, lng: input.lng! }, { lat: Number(b.latitude), lng: Number(b.longitude) });
          return distance <= Number(b.deliveryRadiusKm);
        }
        return false;
      });
    } else {
      eligible = eligible.filter((b) => b.pickupEnabled && (input.city ? b.city.toLowerCase() === input.city.toLowerCase() : hasCoords));
    }

    if (eligible.length === 0) {
      return {
        eligible: false,
        message: "Sorry, delivery is currently unavailable in your selected area.",
      };
    }

    // PICKUP: honor the exact outlet the customer picked, when it's one of the eligible branches.
    if (input.orderType === "PICKUP" && input.branchId) {
      const requested = eligible.find((b) => b.id === input.branchId);
      if (requested) {
        return { eligible: true, branch: requested, isOpen: this.isBranchOpen(requested) };
      }
    }

    if (eligible.length > 1 && input.lat !== undefined && input.lng !== undefined) {
      eligible = [...eligible].sort((a, b) => {
        if (!a.latitude || !a.longitude) return 1;
        if (!b.latitude || !b.longitude) return -1;
        const da = haversineKm({ lat: input.lat!, lng: input.lng! }, { lat: Number(a.latitude), lng: Number(a.longitude) });
        const db = haversineKm({ lat: input.lat!, lng: input.lng! }, { lat: Number(b.latitude), lng: Number(b.longitude) });
        return da - db;
      });
    }

    const branch = eligible[0]!;
    return { eligible: true, branch, isOpen: this.isBranchOpen(branch) };
  }

  /** Re-validation at order-creation time: is this branch still the right location match (area/radius)? Hours are checked separately via isBranchOpen. */
  async isStillEligible(branchId: string, input: ResolveBranchInput): Promise<boolean> {
    const result = await this.resolve(input);
    return result.eligible && result.branch.id === branchId;
  }
}
