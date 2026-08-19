"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { BellIcon, CloseIcon } from "./icons";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  orderId: string | null;
  isRead: boolean;
  createdAt: string;
};

// The socket listener (chime + toast + cache invalidation) lives in <NewOrderAlert>, mounted once
// in the dashboard layout — this component only ever reads the query cache it keeps fresh, so the
// sound never plays twice just because the bell happens to be rendered too.
export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: unread } = useQuery({
    queryKey: ["staff-notifications-unread-count"],
    queryFn: () => api.get<{ count: number }>("/staff/notifications/unread-count"),
    refetchInterval: 30000,
  });

  const { data: notifications } = useQuery({
    queryKey: ["staff-notifications"],
    queryFn: () => api.get<NotificationRow[]>("/staff/notifications"),
    enabled: open,
  });

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
      await api.patch(`/staff/notifications/${n.id}/read`, {});
      await queryClient.invalidateQueries({ queryKey: ["staff-notifications-unread-count"] });
      await queryClient.invalidateQueries({ queryKey: ["staff-notifications"] });
    }
    setOpen(false);
    if (n.orderId) router.push(`/orders?openOrderId=${n.orderId}`);
  }

  async function markAllRead() {
    await api.post("/staff/notifications/read-all", {});
    await queryClient.invalidateQueries({ queryKey: ["staff-notifications-unread-count"] });
    await queryClient.invalidateQueries({ queryKey: ["staff-notifications"] });
  }

  const count = unread?.count ?? 0;

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={() => setOpen((v) => !v)} aria-label="Notifications" className="relative rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700">
        <BellIcon size={18} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-semibold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
            <p className="text-sm font-semibold text-neutral-900">Notifications</p>
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
                className={`block w-full border-b border-neutral-50 px-3 py-2.5 text-left text-xs hover:bg-neutral-50 ${!n.isRead ? "bg-red-50/40" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-neutral-900">{n.title}</p>
                  {!n.isRead && <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-red" />}
                </div>
                <p className="mt-0.5 text-neutral-500">{n.message}</p>
                <p className="mt-1 text-[10px] text-neutral-400">{new Date(n.createdAt).toLocaleString()}</p>
              </button>
            ))}
            {notifications?.length === 0 && <p className="px-3 py-6 text-center text-xs text-neutral-400">No notifications yet.</p>}
            {!notifications && <p className="px-3 py-6 text-center text-xs text-neutral-400">Loading...</p>}
          </div>
        </div>
      )}
    </div>
  );
}
