"use client";

import { create } from "zustand";

export type ToastKind = "success" | "error" | "info" | "cart";
export type ToastEntry = { id: number; kind: ToastKind; message: string; duration: number };

type ToastState = {
  toasts: ToastEntry[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
};

let nextId = 0;
const MAX_VISIBLE = 3;
/** Errors stay a little longer so they can be read. */
const DURATION_MS: Record<ToastKind, number> = { success: 3500, info: 4000, cart: 3000, error: 6000 };

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) =>
    set((s) => {
      // The same message twice in a row (e.g. a double tap) is shown once.
      if (s.toasts.some((t) => t.kind === kind && t.message === message)) return s;
      const entry: ToastEntry = { id: ++nextId, kind, message, duration: DURATION_MS[kind] };
      return { toasts: [...s.toasts, entry].slice(-MAX_VISIBLE) };
    }),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire-and-forget alert popups — call from anywhere, no hook needed. */
export const toast = {
  success: (message: string) => useToastStore.getState().push("success", message),
  error: (message: string) => useToastStore.getState().push("error", message),
  info: (message: string) => useToastStore.getState().push("info", message),
  cart: (message: string) => useToastStore.getState().push("cart", message),
};
