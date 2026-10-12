"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useThemeStore } from "../store/useThemeStore";
import { useAuthStore } from "../store/useAuthStore";
import { useAuthModalStore } from "../store/useAuthModalStore";
import { CUSTOMER_SESSION_EXPIRED_EVENT, getAccessToken, getRefreshToken } from "../lib/api";
import { toast } from "../store/useToastStore";

const THEME_KEY = "restaurant_theme";

/**
 * Keeps the visitor's saved light/dark choice after a refresh. The inline script in the layout sets the "dark"
 * class before first paint, but React can reset the <html> class while hydrating; this puts it back and then
 * guards against it being dropped, without ever overriding an explicit switch to light.
 */
function ThemeSync() {
  useEffect(() => {
    const root = document.documentElement;
    const wantDark = () => {
      try {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored) return stored === "dark";
      } catch {
        // storage blocked: fall back to the system setting
      }
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    };
    const apply = () => {
      const dark = wantDark();
      if (root.classList.contains("dark") !== dark) root.classList.toggle("dark", dark);
      useThemeStore.setState({ theme: dark ? "dark" : "light" });
    };
    apply();
    const observer = new MutationObserver(() => {
      if (wantDark() && !root.classList.contains("dark")) root.classList.add("dark");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return null;
}

/**
 * Keeps the "signed in" look in step with the real login. If the saved tokens are gone or can no longer be renewed, the
 * customer is signed out here too and shown the login box, instead of looking logged in and then failing with a vague error.
 */
function SessionWatcher() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const customer = useAuthStore((s) => s.customer);

  useEffect(() => {
    if (hasHydrated && customer && !getAccessToken() && !getRefreshToken()) useAuthStore.getState().logout();
  }, [hasHydrated, customer]);

  useEffect(() => {
    const onExpired = () => {
      const wasSignedIn = !!useAuthStore.getState().customer;
      useAuthStore.getState().logout();
      if (wasSignedIn) {
        toast.info("Your session has expired. Please log in again.");
        useAuthModalStore.getState().open("login", window.location.pathname);
      }
    };
    window.addEventListener(CUSTOMER_SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(CUSTOMER_SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeSync />
      <SessionWatcher />
      {children}
    </QueryClientProvider>
  );
}
