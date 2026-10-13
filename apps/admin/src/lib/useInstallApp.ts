"use client";

import { useCallback, useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** How this device installs the app: with the browser's own prompt, or by hand from the Share / File menu. */
export type InstallKind = "prompt" | "ios" | "mac-safari" | "none";

function detect(): { standalone: boolean; manual: "ios" | "mac-safari" | null } {
  if (typeof window === "undefined") return { standalone: false, manual: null };
  const ua = navigator.userAgent;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // iPadOS 13+ reports itself as a Mac, but has a touch screen.
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return { standalone, manual: "ios" };
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
  if (safari && /Mac/.test(navigator.platform)) return { standalone, manual: "mac-safari" };
  return { standalone, manual: null };
}

/**
 * Install the site as an app. Android, Windows, Mac and Linux (Chrome / Edge) give a ready install prompt; iPhone, iPad
 * and Safari on Mac have no prompt, so the person is shown the two steps to do by hand.
 */
export function useInstallApp() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [manual, setManual] = useState<"ios" | "mac-safari" | null>(null);

  useEffect(() => {
    const d = detect();
    setInstalled(d.standalone);
    setManual(d.manual);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const kind: InstallKind = installed ? "none" : deferred ? "prompt" : manual ?? "none";

  /** Returns true when the browser's own prompt was used; false means the caller should show the manual steps. */
  const install = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setInstalled(true);
    setDeferred(null);
    return true;
  }, [deferred]);

  return { kind, install };
}
