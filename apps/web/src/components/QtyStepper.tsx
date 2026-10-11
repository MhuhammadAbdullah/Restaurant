"use client";

import { useState } from "react";
import { TrashIcon, PlusIcon, MinusIcon } from "./icons";
import { ConfirmRemoveModal } from "./ConfirmRemoveModal";

export function QtyStepper({
  quantity,
  itemName,
  onIncrement,
  onDecrement,
  onRemove,
  className = "",
  compact = false,
}: {
  quantity: number;
  itemName?: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  className?: string;
  /** Smaller buttons and spacing, for product / deal cards. */
  compact?: boolean;
}) {
  const btn = compact ? "h-5 w-5 sm:h-6 sm:w-6" : "h-6 w-6";
  const icon = compact ? 12 : 14;
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div
        className={`flex items-center justify-between rounded-lg bg-brand-red text-white ${compact ? "gap-1.5 px-1 py-1 sm:gap-2" : "gap-2.5 px-1.5 py-1.5"} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {quantity <= 1 ? (
          <button
            onClick={() => setConfirmOpen(true)}
            aria-label="Remove item"
            className={`flex ${btn} shrink-0 items-center justify-center rounded-md transition hover:bg-white/20`}
          >
            <TrashIcon size={icon} />
          </button>
        ) : (
          <button
            onClick={onDecrement}
            aria-label="Decrease quantity"
            className={`flex ${btn} shrink-0 items-center justify-center rounded-md transition hover:bg-white/20`}
          >
            <MinusIcon size={icon} />
          </button>
        )}

        <span className={`text-center font-semibold ${compact ? "min-w-[0.9rem] text-xs sm:text-sm" : "min-w-[1rem] text-sm"}`}>{quantity}</span>

        <button
          onClick={onIncrement}
          aria-label="Increase quantity"
          className={`flex ${btn} shrink-0 items-center justify-center rounded-md transition hover:bg-white/20`}
        >
          <PlusIcon size={icon} />
        </button>
      </div>

      {confirmOpen && (
        <ConfirmRemoveModal itemName={itemName} onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); onRemove(); }} />
      )}
    </>
  );
}
