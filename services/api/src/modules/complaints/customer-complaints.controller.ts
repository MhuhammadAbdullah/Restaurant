import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  addComplaintMessageSchema,
  createComplaintSchema,
  type AddComplaintMessageInput,
  type CreateComplaintInput,
} from "@restaurant/validation";
import type { CustomerJwtPayload } from "@restaurant/auth";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { ComplaintsService } from "./complaints.service";

@Controller("complaints")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post()
  async create(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Body(new ZodValidationPipe(createComplaintSchema)) body: CreateComplaintInput,
  ) {
    const data = await this.complaints.createComplaint(customer.sub, body);
    return { success: true, data };
  }

  /** Guest complaint (no account required) — the "Submit a Complaint" page uses this by default. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("guest")
  async createGuest(@Body(new ZodValidationPipe(createComplaintSchema)) body: CreateComplaintInput) {
    const data = await this.complaints.createComplaint(null, body);
    return { success: true, data };
  }

  @Get("me")
  async listMine(@CurrentCustomer() customer: CustomerJwtPayload) {
    const data = await this.complaints.listForCustomer(customer.sub);
    return { success: true, data };
  }

  @Get("me/:id")
  async getMine(@CurrentCustomer() customer: CustomerJwtPayload, @Param("id") id: string) {
    const data = await this.complaints.getForCustomer(customer.sub, id);
    return { success: true, data };
  }

  @Post("me/:id/messages")
  async reply(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addComplaintMessageSchema)) body: AddComplaintMessageInput,
  ) {
    const data = await this.complaints.addCustomerMessage(customer.sub, id, body);
    return { success: true, data };
  }
}
