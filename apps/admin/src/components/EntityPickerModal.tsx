"use client";

import { useState } from "react";
import { CloseIcon } from "./icons";

export type PickableEntity = {
  id: string;
  label: string;
  sublabel?: string;
  warning?: string;
  image?: string | null;
};

/**
 * Reusable "pick from a list with search + checkboxes" modal — used wherever admin attaches
 * Choice Sections / Add-ons to a Product or Deal slot, and for the Category-products picker.
 * `variant="table"` swaps the plain checkbox list for an image/name/price table — used for the
 * deal-slot product picker, where seeing the product photo and price up front matters more.
 */
export function EntityPickerModal({
  title,
  items,
  selectedIds,
  onToggle,
  onClose,
  variant = "list",
}: {
  title: string;
  items: PickableEntity[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  variant?: "list" | "table";
}) {
  const [search, setSearch] = useState("");
  const filtered = items.filter((i) => i.label.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`flex max-h-[80vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${variant === "table" ? "max-w-xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="shrink-0 border-b border-neutral-200 p-3">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-neutral-400">No matches.</p>}

          {filtered.length > 0 && variant === "table" ? (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs text-neutral-500">
                <tr>
                  <th className="w-9 py-2"></th>
                  <th className="py-2">Image</th>
                  <th className="py-2">Name</th>
                  <th className="py-2">Price</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const checked = selectedIds.includes(item.id);
                  return (
                    <tr
                      key={item.id}
                      onClick={() => onToggle(item.id)}
                      className={`cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 ${checked ? "bg-red-50/60" : ""}`}
                    >
                      <td className="py-2">
                        <input type="checkbox" checked={checked} readOnly className="h-4 w-4 accent-brand-red" />
                      </td>
                      <td className="py-2 pr-3">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image} alt="" className="h-10 w-10 rounded-md object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-neutral-100" />
                        )}
                      </td>
                      <td className="py-2 pr-3 text-neutral-900">
                        {item.label}
                        {item.warning && <span className="ml-1.5 text-xs text-amber-600">{item.warning}</span>}
                      </td>
                      <td className="py-2 text-neutral-500">{item.sublabel ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            filtered.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-neutral-50"
                >
                  <input type="checkbox" checked={checked} onChange={() => onToggle(item.id)} className="mt-0.5 h-4 w-4 accent-brand-red" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-neutral-900">{item.label}</span>
                    {item.sublabel && <span className="block text-xs text-neutral-400">{item.sublabel}</span>}
                    {item.warning && <span className="block text-xs text-amber-600">{item.warning}</span>}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-neutral-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white"
          >
            Done ({selectedIds.length} selected)
          </button>
        </div>
      </div>
    </div>
  );
}
