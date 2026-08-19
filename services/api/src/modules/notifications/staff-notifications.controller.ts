import { Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { StaffJwtPayload } from "@restaurant/auth";
import { StaffJwtAuthGuard } from "../auth/guards/staff-jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CurrentStaff } from "../auth/decorators/current-staff.decorator";
import { NotificationsService } from "./notifications.service";

// No @RequirePermission — every staff member (any role, including Rider) has their own bell over
// their own notifications; there is nothing to scope by permission, only by recipientStaffId.
@Controller("staff/notifications")
@UseGuards(StaffJwtAuthGuard, PermissionsGuard)
export class StaffNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentStaff() staff: StaffJwtPayload) {
    const data = await this.notifications.listForStaff(staff);
    return { success: true, data };
  }

  @Get("unread-count")
  async unreadCount(@CurrentStaff() staff: StaffJwtPayload) {
    const data = await this.notifications.unreadCountForStaff(staff);
    return { success: true, data: { count: data } };
  }

  @Patch(":id/read")
  async markRead(@CurrentStaff() staff: StaffJwtPayload, @Param("id") id: string) {
    await this.notifications.markReadForStaff(staff, id);
    return { success: true };
  }

  @Post("read-all")
  async markAllRead(@CurrentStaff() staff: StaffJwtPayload) {
    await this.notifications.markAllReadForStaff(staff);
    return { success: true };
  }
}
