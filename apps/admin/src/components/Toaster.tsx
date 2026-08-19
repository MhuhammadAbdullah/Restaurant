"use client";

import { useToastStore } from "../store/useToastStore";
import { CheckCircleIcon, AlertCircleIcon, InfoCircleIcon, CloseIcon } from "./icons";

const KIND_STYLES: Record<string, string> = {
  success: "border-l-4 border-green-600 bg-white text-neutral-800",
  error: "border-l-4 border-red-600 bg-white text-neutral-800",
  info: "border-l-4 border-neutral-300 bg-white text-neutral-800",
};

const KIND_ICON_COLOR: Record<string, string> = {
  success: "text-green-600",
  error: "text-red-600",
  info: "text-neutral-400",
};

const KIND_ICON = {
  success: CheckCircleIcon,
  error: AlertCircleIcon,
  info: InfoCircleIcon,
};

/** Top-center toast stack — the standard alert surface for Admin. Prefer this over alert()/inline error text. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-[200] flex flex-col items-center gap-3 px-4">
      {toasts.map((t) => {
        const Icon = KIND_ICON[t.kind];
        return (
          <div
            key={t.id}
            role="alert"
            className={`flex w-full max-w-md items-start gap-3 rounded-2xl border px-5 py-4 text-sm shadow-lg ${KIND_STYLES[t.kind]}`}
          >
            <Icon className={`mt-0.5 shrink-0 ${KIND_ICON_COLOR[t.kind]}`} size={20} />
            <span className="flex-1 font-medium leading-snug">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="mt-0.5 shrink-0 opacity-60 hover:opacity-100">
              <CloseIcon size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
