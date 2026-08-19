"use client";

import { FaCircleCheck, FaCircleExclamation, FaCircleInfo, FaXmark } from "react-icons/fa6";
import { useToastStore } from "../store/useToastStore";
import { CART_ICON_URL } from "../lib/constants";

const KIND_STYLES: Record<string, string> = {
  success: "border-green-600 bg-green-50 text-green-800",
  error: "border-red-600 bg-red-50 text-red-800",
  info: "border-line bg-surface text-ink",
  cart: "border-green-600 bg-green-50 text-green-800",
};

const KIND_ICON_COLOR: Record<string, string> = {
  success: "text-green-600",
  error: "text-red-600",
  info: "text-muted",
};

const KIND_ICON = {
  success: FaCircleCheck,
  error: FaCircleExclamation,
  info: FaCircleInfo,
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-3 px-4">
      {toasts.map((t) => {
        const Icon = t.kind !== "cart" ? KIND_ICON[t.kind as keyof typeof KIND_ICON] : null;
        return (
          <div
            key={t.id}
            role="alert"
            className={`flex w-full max-w-md items-start gap-3 rounded-2xl border px-5 py-4 text-base shadow-lg ${KIND_STYLES[t.kind]}`}
          >
            {t.kind === "cart" ? (
              // The source icon is a plain white silhouette (drawn for the dark header) — it'd be
              // invisible straight on this light background, so give it a solid circle behind it,
              // same as the confirmation page's status icons.
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CART_ICON_URL} alt="" className="h-5 w-5 object-contain" />
              </span>
            ) : (
              Icon && <Icon className={`mt-0.5 shrink-0 ${KIND_ICON_COLOR[t.kind]}`} size={24} />
            )}
            <span className="flex-1 font-medium leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="mt-0.5 shrink-0 opacity-60 hover:opacity-100"
            >
              <FaXmark size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
