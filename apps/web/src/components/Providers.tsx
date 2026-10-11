"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useThemeStore } from "../store/useThemeStore";

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
      {children}
    </QueryClientProvider>
  );
}
