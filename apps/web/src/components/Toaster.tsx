"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaCheck, FaCircleInfo, FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import { useToastStore, type ToastEntry, type ToastKind } from "../store/useToastStore";
import { CART_ICON_URL } from "../lib/constants";

const LOOK: Record<ToastKind, { title: string; chip: string; bar: string }> = {
  success: { title: "Done", chip: "bg-green-600 text-white", bar: "bg-green-600" },
  cart: { title: "Added to cart", chip: "bg-green-600 text-white", bar: "bg-green-600" },
  error: { title: "Something went wrong", chip: "bg-brand-red text-white", bar: "bg-brand-red" },
  info: { title: "Heads up", chip: "bg-ink text-surface", bar: "bg-ink" },
};

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === "cart") {
    // The source icon is a plain white silhouette, so it sits on the solid green circle.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={CART_ICON_URL} alt="" className="h-[18px] w-[18px] object-contain" />;
  }
  if (kind === "success") return <FaCheck size={14} />;
  if (kind === "error") return <FaTriangleExclamation size={14} />;
  return <FaCircleInfo size={14} />;
}

/** One alert: slides in, counts down on a thin bar, pauses while the mouse or a finger is on it, slides out. */
function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);
  const startedAt = useRef(0);
  const look = LOOK[toast.kind];

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(toast.id), 220);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    if (paused || leaving) return;
    startedAt.current = Date.now();
    const timer = setTimeout(close, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(300, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, leaving, close]);

  // A message of "<name> added to cart" reads better as a title plus the item, so the cart alert shows the item name.
  const message = toast.kind === "cart" ? toast.message.replace(/\s+added to (the )?cart\.?$/i, "") : toast.message;

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      className={`toast-card pointer-events-auto relative w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_10px_30px_-8px_rgba(0,0,0,0.25)] ${leaving ? "toast-out" : "toast-in"}`}
    >
      <div className="flex items-center gap-3 py-3 pl-3.5 pr-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${look.chip}`}>
          <ToastIcon kind={toast.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-ink">{look.title}</p>
          <p className="mt-0.5 break-words text-[13px] leading-snug text-muted">{message}</p>
        </div>
        <button type="button" onClick={close} aria-label="Dismiss" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-alt hover:text-ink">
          <FaXmark size={13} />
        </button>
      </div>
      <span
        aria-hidden="true"
        className={`toast-bar absolute inset-x-0 bottom-0 h-[3px] origin-left ${look.bar}`}
        style={{ animationDuration: `${toast.duration}ms`, animationPlayState: paused ? "paused" : "running" }}
      />
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2.5 px-3 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[390px] sm:items-stretch sm:px-0" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
