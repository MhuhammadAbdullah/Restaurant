import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  changePasswordSchema,
  createAddressSchema,
  updateAddressSchema,
  updateCustomerProfileSchema,
  type ChangePasswordInput,
  type CreateAddressInput,
  type UpdateAddressInput,
  type UpdateCustomerProfileInput,
} from "@restaurant/validation";
import type { CustomerJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { NotificationsService } from "../notifications/notifications.service";
import { CustomersService } from "./customers.service";

@Controller("customers/me")
@UseGuards(CustomerJwtAuthGuard)
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly notifications: NotificationsService,
  ) {}

  @Patch("profile")
  async updateProfile(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Body(new ZodValidationPipe(updateCustomerProfileSchema)) body: UpdateCustomerProfileInput,
  ) {
    const data = await this.customers.updateProfile(customer.sub, body);
    return { success: true, data };
  }

  @Post("change-password")
  async changePassword(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    const data = await this.customers.changePassword(customer.sub, body);
    return { success: true, data };
  }

  @Get("addresses")
  async listAddresses(@CurrentCustomer() customer: CustomerJwtPayload) {
    const data = await this.customers.listAddresses(customer.sub);
    return { success: true, data };
  }

  @Post("addresses")
  async createAddress(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Body(new ZodValidationPipe(createAddressSchema)) body: CreateAddressInput,
  ) {
    const data = await this.customers.createAddress(customer.sub, body);
    return { success: true, data };
  }

  @Patch("addresses/:id")
  async updateAddress(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAddressSchema)) body: UpdateAddressInput,
  ) {
    const data = await this.customers.updateAddress(customer.sub, id, body);
    return { success: true, data };
  }

  @Delete("addresses/:id")
  async removeAddress(@CurrentCustomer() customer: CustomerJwtPayload, @Param("id") id: string) {
    const data = await this.customers.removeAddress(customer.sub, id);
    return { success: true, data };
  }

  @Patch("addresses/:id/default")
  async setDefaultAddress(@CurrentCustomer() customer: CustomerJwtPayload, @Param("id") id: string) {
    const data = await this.customers.setDefaultAddress(customer.sub, id);
    return { success: true, data };
  }

  @Get("favourites")
  async listFavourites(@CurrentCustomer() customer: CustomerJwtPayload) {
    const data = await this.customers.listFavourites(customer.sub);
    return { success: true, data };
  }

  @Post("favourites/:productId")
  async addFavourite(@CurrentCustomer() customer: CustomerJwtPayload, @Param("productId") productId: string) {
    const data = await this.customers.addFavourite(customer.sub, productId);
    return { success: true, data };
  }

  @Delete("favourites/:productId")
  async removeFavourite(@CurrentCustomer() customer: CustomerJwtPayload, @Param("productId") productId: string) {
    const data = await this.customers.removeFavourite(customer.sub, productId);
    return { success: true, data };
  }

  @Get("loyalty")
  async getLoyalty(@CurrentCustomer() customer: CustomerJwtPayload) {
    const data = await this.customers.getLoyalty(customer.sub);
    return { success: true, data };
  }

  @Get("notifications")
  async listNotifications(@CurrentCustomer() customer: CustomerJwtPayload) {
    const data = await this.notifications.listForCustomer(customer.sub);
    return { success: true, data };
  }

  @Get("notifications/unread-count")
  async unreadNotificationCount(@CurrentCustomer() customer: CustomerJwtPayload) {
    const data = await this.notifications.unreadCountForCustomer(customer.sub);
    return { success: true, data: { count: data } };
  }

  @Patch("notifications/:id/read")
  async markNotificationRead(@CurrentCustomer() customer: CustomerJwtPayload, @Param("id") id: string) {
    await this.notifications.markReadForCustomer(customer.sub, id);
    return { success: true };
  }

  @Post("notifications/read-all")
  async markAllNotificationsRead(@CurrentCustomer() customer: CustomerJwtPayload) {
    await this.notifications.markAllReadForCustomer(customer.sub);
    return { success: true };
  }
}
