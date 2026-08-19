"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaBell } from "react-icons/fa6";
import { api } from "../lib/api";
import { getSocket } from "../lib/useRealtime";
import { CloseIcon } from "./icons";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  orderId: string | null;
  isRead: boolean;
  createdAt: string;
};

/** Customer notification center (CLAUDE.md §11-equivalent) — order-received/accepted/preparing/etc, reusing the same Notification model the admin bell reads from. Registered customers only (a guest has no account to attach a persisted notification list to; guests still get order-scoped Web Push separately). */
export function CustomerNotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: unread } = useQuery({
    queryKey: ["customer-notifications-unread-count"],
    queryFn: () => api.get<{ count: number }>("/customers/me/notifications/unread-count"),
    refetchInterval: 30000,
  });

  const { data: notifications } = useQuery({
    queryKey: ["customer-notifications"],
    queryFn: () => api.get<NotificationRow[]>("/customers/me/notifications"),
    enabled: open,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["customer-notifications"] });
    };
    socket.on("order:statusChanged", onUpdate);
    socket.on("order:updated", onUpdate);
    return () => {
      socket.off("order:statusChanged", onUpdate);
      socket.off("order:updated", onUpdate);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function openNotification(n: NotificationRow) {
    if (!n.isRead) {
      await api.patch(`/customers/me/notifications/${n.id}/read`, {});
      await queryClient.invalidateQueries({ queryKey: ["customer-notifications-unread-count"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-notifications"] });
    }
    setOpen(false);
    if (n.orderId) router.push("/account/orders");
  }

  async function markAllRead() {
    await api.post("/customers/me/notifications/read-all", {});
    await queryClient.invalidateQueries({ queryKey: ["customer-notifications-unread-count"] });
    await queryClient.invalidateQueries({ queryKey: ["customer-notifications"] });
  }

  const count = unread?.count ?? 0;

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={() => setOpen((v) => !v)} aria-label="Notifications" className="relative text-white">
        <FaBell size={20} />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full border-2 border-brand-red bg-white px-1 text-[10px] font-semibold text-brand-red">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-line bg-surface text-ink shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <button onClick={markAllRead} className="text-xs font-medium text-brand-red hover:underline">Mark all read</button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close"><CloseIcon size={12} /></button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications?.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`block w-full border-b border-line px-3 py-2.5 text-left text-xs hover:bg-surface-alt ${!n.isRead ? "bg-brand-red/5" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{n.title}</p>
                  {!n.isRead && <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-red" />}
                </div>
                <p className="mt-0.5 text-muted">{n.message}</p>
                <p className="mt-1 text-[10px] text-muted">{new Date(n.createdAt).toLocaleString()}</p>
              </button>
            ))}
            {notifications?.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">No notifications yet.</p>}
            {!notifications && <p className="px-3 py-6 text-center text-xs text-muted">Loading...</p>}
          </div>
        </div>
      )}
    </div>
  );
}
