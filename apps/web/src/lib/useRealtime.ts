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

/** Live order-status push for the customer's own order tracking view (CLAUDE.md §18). */
export function useRealtimeOrder(orderId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const onChanged = () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    };

    s.on("order:statusChanged", onChanged);
    // Delivery-time adjustments (and other amendments) emit "order:updated", not
    // "order:statusChanged" — without this, a rider/ETA change only reached the customer on the
    // next 15s poll instead of immediately.
    s.on("order:updated", onChanged);
    return () => {
      s.off("order:statusChanged", onChanged);
      s.off("order:updated", onChanged);
    };
  }, [queryClient, orderId]);
}
