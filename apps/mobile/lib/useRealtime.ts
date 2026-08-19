import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";
import { getAccessToken } from "./storage";

const SOCKET_URL = API_URL.replace(/\/api\/v1\/?$/, "");

export function useRealtimeOrders(onEvent: () => void) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      const socket = io(SOCKET_URL, { auth: { token }, transports: ["websocket"] });
      socketRef.current = socket;
      socket.on("order:created", onEvent);
      socket.on("order:statusChanged", onEvent);
    })();

    return () => {
      cancelled = true;
      socketRef.current?.off("order:created", onEvent);
      socketRef.current?.off("order:statusChanged", onEvent);
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
