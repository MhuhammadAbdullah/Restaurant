import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { isStaffPayload } from "@restaurant/auth";
import { TokensService } from "../auth/tokens.service";

function ownerRoom(restaurantId: string) {
  return `restaurant:${restaurantId}:owner`;
}
function branchRoom(branchId: string) {
  return `branch:${branchId}`;
}
function customerRoom(customerId: string) {
  return `customer:${customerId}`;
}

@WebSocketGateway({
  cors: { origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3002").split(","), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly tokens: TokensService) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      const token = (client.handshake.auth?.token as string | undefined) ?? (client.handshake.query?.token as string | undefined);
      if (!token) throw new Error("No token provided");

      const payload = await this.tokens.verifyAccessToken(token);

      if (isStaffPayload(payload)) {
        if (payload.isOwner) {
          await client.join(ownerRoom(payload.restaurantId));
        }
        for (const branchId of payload.branchIds) {
          await client.join(branchRoom(branchId));
        }
        client.data.kind = "staff";
      } else {
        await client.join(customerRoom(payload.sub));
        client.data.kind = "customer";
      }
    } catch (err) {
      this.logger.warn(`Rejected socket connection: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // rooms are cleaned up automatically by socket.io on disconnect
  }

  emitOrderCreated(params: { restaurantId: string; branchId: string; order: unknown }) {
    this.server.to(branchRoom(params.branchId)).to(ownerRoom(params.restaurantId)).emit("order:created", params.order);
  }

  emitOrderStatusChanged(params: { restaurantId: string; branchId: string; customerId?: string | null; order: unknown }) {
    const rooms = [branchRoom(params.branchId), ownerRoom(params.restaurantId)];
    if (params.customerId) rooms.push(customerRoom(params.customerId));
    this.server.to(rooms).emit("order:statusChanged", params.order);
  }

  emitOrderItemsAdded(params: { restaurantId: string; branchId: string; order: unknown }) {
    this.server.to(branchRoom(params.branchId)).to(ownerRoom(params.restaurantId)).emit("order:itemsAdded", params.order);
  }

  /** Generic "this order was amended" signal — delivery details, type change, item edits/removal. */
  emitOrderUpdated(params: { restaurantId: string; branchId: string; customerId?: string | null; order: unknown }) {
    const rooms = [branchRoom(params.branchId), ownerRoom(params.restaurantId)];
    if (params.customerId) rooms.push(customerRoom(params.customerId));
    this.server.to(rooms).emit("order:updated", params.order);
  }

  /**
   * Order moved to a different branch — notify both rooms so the old branch's kitchen/order list
   * drops it and the new branch's picks it up. Reuses the "order:updated" event name (rather than
   * a new one) so the existing admin invalidation handler (useRealtimeOrders) already covers it.
   */
  emitOrderBranchTransferred(params: { restaurantId: string; fromBranchId: string; toBranchId: string; customerId?: string | null; order: unknown }) {
    const rooms = [branchRoom(params.fromBranchId), branchRoom(params.toBranchId), ownerRoom(params.restaurantId)];
    if (params.customerId) rooms.push(customerRoom(params.customerId));
    this.server.to(rooms).emit("order:updated", params.order);
  }

  /**
   * Distinct from emitOrderCreated: this is the admin-bell-specific signal (sound + unread bump +
   * on-screen toast). Kept separate from "order:created" (which just invalidates the
   * orders/kitchen list queries) so the bell/toast don't have to guess intent from a generic event
   * they share with every other page. Carries the notification content directly so the toast can
   * render immediately without an extra round-trip to fetch the list.
   */
  emitStaffNotification(params: { restaurantId: string; branchId: string; notification: { title: string; message: string; orderId: string | null } }) {
    this.server.to(branchRoom(params.branchId)).to(ownerRoom(params.restaurantId)).emit("notification:new", params.notification);
  }
}
