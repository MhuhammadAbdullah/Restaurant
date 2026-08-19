import { Controller, Post, UseGuards } from "@nestjs/common";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { LoyaltyService } from "./loyalty.service";

@Controller("staff/loyalty")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  /** Manually runs the expiry sweep that otherwise fires once a day — useful if the server was down at 1am, or to verify expiry rules without waiting. */
  @RequirePermission("loyalty.adjust")
  @Post("expire-now")
  async expireNow() {
    const data = await this.loyalty.expirePoints();
    return { success: true, data };
  }
}
