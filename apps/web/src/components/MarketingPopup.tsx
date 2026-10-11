"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";
import { useAuthModalStore } from "../store/useAuthModalStore";
import { useLocationStore } from "../store/useLocationStore";
import { CloseIcon } from "./icons";

type Popup = {
  id: string;
  image: string;
  linkUrl: string | null;
  audience: "ALL" | "GUESTS" | "CUSTOMERS";
  device: "ALL" | "MOBILE" | "DESKTOP";
  frequency: "EVERY_VISIT" | "SESSION" | "DAILY" | "EVERY_N_DAYS" | "ONCE";
  repeatDays: number;
  delaySeconds: number;
  updatedAt: string;
};

const SEEN_KEY = "restaurant_popups_seen";
const SESSION_KEY = "restaurant_popups_session";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Pop-ups already shown during this page load, for "every time a page opens". */
const shownThisLoad = new Set<string>();

function pageKeyOf(pathname: string): string {
  if (pathname === "/") return "HOME";
  if (pathname.startsWith("/category") || pathname.startsWith("/product") || pathname.startsWith("/deal")) return "MENU";
  if (pathname.startsWith("/our-locations")) return "LOCATIONS";
  if (pathname.startsWith("/checkout")) return "CHECKOUT";
  if (pathname.startsWith("/account")) return "ACCOUNT";
  if (pathname.startsWith("/complaints")) return "COMPLAINTS";
  if (pathname.startsWith("/terms") || pathname.startsWith("/privacy-policy") || pathname.startsWith("/faqs")) return "INFO";
  // Any page added later falls here, so "All pages" and "Any other page" pop-ups cover it without code changes.
  return "OTHER";
}

function read(storage: Storage | undefined, key: string): Record<string, number> {
  try {
    return JSON.parse(storage?.getItem(key) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
function write(storage: Storage | undefined, key: string, value: Record<string, number>) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: the pop-up just follows "every visit" rules
  }
}
const safeStorage = (kind: "local" | "session") => {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
};

/** Changing the image or settings in the admin changes updatedAt, so people who closed the old version see the new one. */
const versionKey = (p: Popup) => `${p.id}:${p.updatedAt}`;

function alreadySeen(p: Popup): boolean {
  const key = versionKey(p);
  if (p.frequency === "EVERY_VISIT") return shownThisLoad.has(key);
  if (p.frequency === "SESSION") return key in read(safeStorage("session"), SESSION_KEY);
  const at = read(safeStorage("local"), SEEN_KEY)[key];
  if (at === undefined) return false;
  if (p.frequency === "ONCE") return true;
  if (p.frequency === "DAILY") return new Date(at).toDateString() === new Date().toDateString();
  return Date.now() - at < Math.max(1, p.repeatDays) * DAY_MS;
}

function markSeen(p: Popup) {
  const key = versionKey(p);
  shownThisLoad.add(key);
  const session = safeStorage("session");
  write(session, SESSION_KEY, { ...read(session, SESSION_KEY), [key]: Date.now() });
  const local = safeStorage("local");
  write(local, SEEN_KEY, { ...read(local, SEEN_KEY), [key]: Date.now() });
}

export function MarketingPopup() {
  const pathname = usePathname();
  const page = pageKeyOf(pathname);
  const customer = useAuthStore((s) => s.customer);
  const authHydrated = useAuthStore((s) => s.hasHydrated);
  const authModalOpen = useAuthModalStore((s) => s.isOpen);
  const { isResolved, hasHydrated: locationHydrated, isChangeModalOpen } = useLocationStore();
  const [active, setActive] = useState<Popup | null>(null);

  const { data: popups } = useQuery({
    queryKey: ["cms-popups", page],
    queryFn: () => api.public.get<Popup[]>(`/cms/popups?page=${page}`),
    staleTime: 60_000,
  });

  // The location chooser comes first; the pop-up waits until the visitor has picked a branch.
  const ready = authHydrated && locationHydrated && isResolved && !isChangeModalOpen && !authModalOpen;

  const candidate = useMemo(() => {
    if (!popups || !ready || typeof window === "undefined") return null;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    return (
      popups.find((p) => {
        if (p.audience === "GUESTS" && customer) return false;
        if (p.audience === "CUSTOMERS" && !customer) return false;
        if (p.device === "MOBILE" && !isMobile) return false;
        if (p.device === "DESKTOP" && isMobile) return false;
        return !alreadySeen(p);
      }) ?? null
    );
  }, [popups, ready, customer]);

  useEffect(() => {
    setActive(null);
    if (!candidate) return;
    const timer = window.setTimeout(() => {
      markSeen(candidate);
      setActive(candidate);
      api.public.post(`/cms/popups/${candidate.id}/view`).catch(() => undefined);
    }, Math.max(0, candidate.delaySeconds) * 1000);
    return () => window.clearTimeout(timer);
  }, [candidate, pathname]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (!active) return null;

  const close = () => setActive(null);
  const trackClick = () => {
    api.public.post(`/cms/popups/${active.id}/click`).catch(() => undefined);
    close();
  };
  const link = active.linkUrl?.trim();
  // eslint-disable-next-line @next/next/no-img-element
  const image = <img src={active.image} alt="Special offer" className="block max-h-[80vh] w-auto max-w-full rounded-3xl object-contain shadow-2xl" />;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-5 backdrop-blur-[2px]" onClick={close} role="dialog" aria-modal="true" aria-label="Offer">
      <div className="relative w-fit max-w-[min(92vw,460px)]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black text-white shadow-lg ring-2 ring-white/20 hover:bg-neutral-800"
        >
          <CloseIcon size={16} />
        </button>
        {link ? (
          /^https?:\/\//i.test(link) ? (
            <a href={link} target="_blank" rel="noopener noreferrer" onClick={trackClick}>{image}</a>
          ) : (
            <Link href={link} onClick={trackClick}>{image}</Link>
          )
        ) : (
          image
        )}
      </div>
    </div>
  );
}
