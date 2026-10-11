"use client";

import { create } from "zustand";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger: destructive (red) · warning: changes something important (amber) · info: plain confirmation */
  tone?: "danger" | "warning" | "info";
};

type ConfirmState = {
  open: boolean;
  options: ConfirmOptions | null;
  resolver: ((ok: boolean) => void) | null;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  answer: (ok: boolean) => void;
};

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolver: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      // a second request while one is open cancels the first
      get().resolver?.(false);
      set({ open: true, options, resolver: resolve });
    }),
  answer: (ok) => {
    get().resolver?.(ok);
    set({ open: false, resolver: null });
  },
}));

/**
 * Styled replacement for window.confirm(). Use it as: if (!(await confirmDialog({ ... }))) return;
 * Resolves true on confirm, false on cancel / Esc / click outside.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options);
}
