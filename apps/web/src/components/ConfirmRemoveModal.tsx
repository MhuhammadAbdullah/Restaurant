"use client";

import { TrashIcon, CloseIcon } from "./icons";

export function ConfirmRemoveModal({
  itemName,
  onCancel,
  onConfirm,
}: {
  itemName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 text-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
              <TrashIcon size={18} />
            </span>
            <h3 className="text-base font-semibold text-ink">Confirm Deletion</h3>
          </div>
          <button onClick={onCancel} aria-label="Close" className="text-muted">
            <CloseIcon size={18} />
          </button>
        </div>

        <p className="mt-4 text-sm text-muted">
          Are you sure you want to remove {itemName ? <strong className="text-ink">{itemName}</strong> : "this product"} from the cart?
        </p>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onConfirm}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-red py-2.5 text-sm font-semibold text-white"
          >
            <TrashIcon size={15} /> Remove
          </button>
          <button onClick={onCancel} className="flex-1 rounded-full bg-surface-alt py-2.5 text-sm font-semibold text-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
