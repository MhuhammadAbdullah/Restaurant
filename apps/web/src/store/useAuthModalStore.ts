"use client";

import { create } from "zustand";

type AuthModalView = "login" | "register";

type AuthModalState = {
  isOpen: boolean;
  view: AuthModalView;
  /** Where to send the user once they successfully log in/register — defaults to /account. */
  redirectTo: string;
  open: (view?: AuthModalView, redirectTo?: string) => void;
  close: () => void;
};

export const useAuthModalStore = create<AuthModalState>((set) => ({
  isOpen: false,
  view: "login",
  redirectTo: "/account",
  open: (view = "login", redirectTo = "/account") => set({ isOpen: true, view, redirectTo }),
  close: () => set({ isOpen: false }),
}));
