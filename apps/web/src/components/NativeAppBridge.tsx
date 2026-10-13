"use client";

import { useEffect } from "react";

type CapacitorWindow = {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: { App?: { addListener: (event: string, cb: (e: { canGoBack: boolean }) => void) => Promise<{ remove: () => void }>; exitApp: () => void } };
  };
};

/**
 * Only does something inside the Android / iOS app (the Capacitor shell, see apps/mobile). In the app it makes the
 * Android back button go to the previous page and close the app from the first page. In a normal browser it is a no-op.
 */
export function NativeAppBridge() {
  useEffect(() => {
    const cap = (window as unknown as CapacitorWindow).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    document.documentElement.classList.add("native-app");
    const app = cap.Plugins?.App;
    if (!app) return;
    let handle: { remove: () => void } | undefined;
    void app
      .addListener("backButton", () => {
        if (window.history.length > 1) window.history.back();
        else app.exitApp();
      })
      .then((h) => {
        handle = h;
      });
    return () => handle?.remove();
  }, []);
  return null;
}
