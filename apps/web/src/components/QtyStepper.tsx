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
}: {
  quantity: number;
  itemName?: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  className?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div
        className={`flex items-center justify-between gap-2.5 rounded-lg bg-brand-red px-1.5 py-1.5 text-white ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {quantity <= 1 ? (
          <button
            onClick={() => setConfirmOpen(true)}
            aria-label="Remove item"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition hover:bg-white/20"
          >
            <TrashIcon size={14} />
          </button>
        ) : (
          <button
            onClick={onDecrement}
            aria-label="Decrease quantity"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition hover:bg-white/20"
          >
            <MinusIcon size={14} />
          </button>
        )}

        <span className="min-w-[1rem] text-center text-sm font-semibold">{quantity}</span>

        <button
          onClick={onIncrement}
          aria-label="Increase quantity"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition hover:bg-white/20"
        >
          <PlusIcon size={14} />
        </button>
      </div>

      {confirmOpen && (
        <ConfirmRemoveModal itemName={itemName} onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); onRemove(); }} />
      )}
    </>
  );
}
