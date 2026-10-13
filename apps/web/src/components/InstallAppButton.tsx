"use client";

import { useState } from "react";
import { FaDownload, FaXmark } from "react-icons/fa6";
import { useInstallApp } from "../lib/useInstallApp";

/** "Install app" button. Hidden when the app is already installed or this browser cannot install it. */
export function InstallAppButton({ className = "", onDone }: { className?: string; onDone?: () => void }) {
  const { kind, install } = useInstallApp();
  const [help, setHelp] = useState(false);

  if (kind === "none") return null;

  async function onClick() {
    const used = await install();
    if (used) onDone?.();
    else setHelp(true);
  }

  return (
    <>
      <button type="button" onClick={() => void onClick()} className={className}>
        <FaDownload size={14} /> <span className="flex-1 text-left">Install app</span>
      </button>

      {help && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setHelp(false)} role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Install the app" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-surface p-5 text-ink shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">Install the app</p>
              <button type="button" onClick={() => setHelp(false)} aria-label="Close">
                <FaXmark size={18} />
              </button>
            </div>
            {kind === "ios" ? (
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
                <li>Open this page in <b className="text-ink">Safari</b>.</li>
                <li>Tap the <b className="text-ink">Share</b> button (the square with an arrow).</li>
                <li>Choose <b className="text-ink">Add to Home Screen</b>, then tap <b className="text-ink">Add</b>.</li>
              </ol>
            ) : (
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
                <li>In the menu bar choose <b className="text-ink">File</b>.</li>
                <li>Choose <b className="text-ink">Add to Dock</b>, then click <b className="text-ink">Add</b>.</li>
              </ol>
            )}
            <button type="button" onClick={() => setHelp(false)} className="mt-5 w-full rounded-xl bg-brand-red py-2.5 text-sm font-semibold text-white">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
