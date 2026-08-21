"use client";

import { create } from "zustand";

type SidebarState = {
  /** Off-canvas drawer visibility below the `lg` breakpoint. */
  mobileOpen: boolean;
  /** Full-width vs. hidden on `lg`+ screens, where the sidebar sits in normal flow. */
  collapsed: boolean;
  openMobile: () => void;
  closeMobile: () => void;
  toggleMobile: () => void;
  toggleCollapsed: () => void;
};

export const useSidebarStore = create<SidebarState>((set) => ({
  mobileOpen: false,
  collapsed: false,
  openMobile: () => set({ mobileOpen: true }),
  closeMobile: () => set({ mobileOpen: false }),
  toggleMobile: () => set((s) => ({ mobileOpen: !s.mobileOpen })),
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
}));

/** One control that does the right thing for the current viewport — collapse on desktop, slide the drawer on mobile. */
export function toggleSidebarForViewport() {
  const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  if (isDesktop) {
    useSidebarStore.getState().toggleCollapsed();
  } else {
    useSidebarStore.getState().toggleMobile();
  }
}
