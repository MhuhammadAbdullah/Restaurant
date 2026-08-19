import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Single-restaurant system (CLAUDE.md §0): every request ultimately scopes to the one
 * Restaurant row. Cached in-process since it never changes at runtime.
 */
@Injectable()
export class RestaurantContextService {
  private cachedId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getRestaurantId(): Promise<string> {
    if (this.cachedId) return this.cachedId;
    const restaurant = await this.prisma.restaurant.findFirstOrThrow();
    this.cachedId = restaurant.id;
    return this.cachedId;
  }
}
