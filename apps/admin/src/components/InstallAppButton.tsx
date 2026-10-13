"use client";

import { useState } from "react";
import { FaDownload, FaXmark } from "react-icons/fa6";
import { useInstallApp } from "../lib/useInstallApp";

/** Header button that installs the admin panel as an app. Hidden when it is already installed or this browser cannot install it. */
export function InstallAppButton() {
  const { kind, install } = useInstallApp();
  const [help, setHelp] = useState(false);

  if (kind === "none") return null;

  async function onClick() {
    if (!(await install())) setHelp(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        aria-label="Install the admin app"
        title="Install the admin app"
        className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-brand-red"
      >
        <FaDownload size={14} />
        <span className="hidden lg:inline">Install app</span>
      </button>

      {help && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => setHelp(false)} role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Install the app" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-neutral-900">Install the admin app</p>
              <button type="button" onClick={() => setHelp(false)} aria-label="Close" className="text-neutral-400 hover:text-neutral-700">
                <FaXmark size={18} />
              </button>
            </div>
            {kind === "ios" ? (
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-neutral-600">
                <li>Open this page in <b className="text-neutral-900">Safari</b>.</li>
                <li>Tap the <b className="text-neutral-900">Share</b> button (the square with an arrow).</li>
                <li>Choose <b className="text-neutral-900">Add to Home Screen</b>, then tap <b className="text-neutral-900">Add</b>.</li>
              </ol>
            ) : (
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-neutral-600">
                <li>In the menu bar choose <b className="text-neutral-900">File</b>.</li>
                <li>Choose <b className="text-neutral-900">Add to Dock</b>, then click <b className="text-neutral-900">Add</b>.</li>
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
