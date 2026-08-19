"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../lib/useRealtime";
import { playChime, unlockAudioOnFirstInteraction } from "../lib/audio";
import { BellIcon, CloseIcon } from "./icons";

type StaffNotificationPayload = { title: string; message: string; orderId: string | null };
type ToastItem = StaffNotificationPayload & { id: number };

/**
 * Owns the "a new order just arrived" experience for the whole admin app: the chime, the
 * on-screen toast banner, and keeping NotificationBell's unread count/list fresh. Mounted once in
 * the dashboard layout — this is the single place that reacts to the "notification:new" socket
 * event, so the sound never plays twice even though multiple components care about new orders.
 */
export function NewOrderAlert() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    unlockAudioOnFirstInteraction();
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNew = (payload?: StaffNotificationPayload) => {
      playChime();
      queryClient.invalidateQueries({ queryKey: ["staff-notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["staff-notifications"] });

      if (payload) {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { ...payload, id }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 8000);
      }
    };

    socket.on("notification:new", onNew);
    return () => {
      socket.off("notification:new", onNew);
    };
  }, [queryClient]);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function open(toast: ToastItem) {
    dismiss(toast.id);
    if (toast.orderId) router.push(`/orders?openOrderId=${toast.orderId}`);
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="flex items-start gap-2 rounded-xl border border-brand-red/20 bg-white p-3 shadow-2xl">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
            <BellIcon size={14} />
          </span>
          <button onClick={() => open(t)} className="min-w-0 flex-1 text-left">
            <p className="text-sm font-semibold text-neutral-900">{t.title}</p>
            <p className="mt-0.5 truncate text-xs text-neutral-500">{t.message}</p>
          </button>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="shrink-0 text-neutral-400 hover:text-neutral-600">
            <CloseIcon size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
