"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "./api";

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1").replace(/\/api\/v1\/?$/, "");

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  const token = getAccessToken();
  if (!token) return null;
  if (socket && socket.connected) return socket;
  socket = io(SOCKET_URL, { auth: { token }, transports: ["websocket", "polling"] });
  return socket;
}

/**
 * Subscribes to branch/kitchen order events and invalidates the relevant TanStack Query
 * caches so pages that already fetch via useQuery stay live without an explicit refresh.
 */
export function useRealtimeOrders() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const onOrderEvent = () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-order-status-counts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-detail"] });
    };
    s.on("order:created", onOrderEvent);
    s.on("order:statusChanged", onOrderEvent);
    s.on("order:itemsAdded", onOrderEvent);
    s.on("order:updated", onOrderEvent);

    return () => {
      s.off("order:created", onOrderEvent);
      s.off("order:statusChanged", onOrderEvent);
      s.off("order:itemsAdded", onOrderEvent);
      s.off("order:updated", onOrderEvent);
    };
  }, [queryClient]);
}
