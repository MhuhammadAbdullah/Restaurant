"use client";

import { useMemo, useState } from "react";
import { effectivePrice, resolveChoiceGroupRules, autoSelectSingleOption } from "@restaurant/utils";
import { formatPaisa } from "@restaurant/utils";
import { CloseIcon } from "../icons";

export type ProductDetail = {
  id: string;
  name: string;
  basePrice: number;
  discountPrice: number | null;
  choiceGroups: {
    choiceGroupId: string;
    isRequiredOverride: boolean | null;
    minSelectOverride: number | null;
    maxSelectOverride: number | null;
    choiceGroup: {
      id: string;
      name: string;
      isRequired: boolean;
      selectionType: "SINGLE" | "MULTIPLE";
      minSelect: number;
      maxSelect: number;
      options: { id: string; name: string; priceAdjustment: number; discountPriceAdjustment: number | null; status: string }[];
    };
  }[];
  addons: {
    addonId: string;
    addon: {
      id: string;
      name: string;
      price: number;
      discountPrice: number | null;
      maxQuantity: number;
      status: string;
      addonGroup: { name: string };
    };
  }[];
};

export type ProductCartLine = {
  kind: "product";
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  choices: { choiceGroupId: string; choiceOptionId: string; name: string; priceAdjustment: number }[];
  addons: { addonId: string; name: string; price: number; quantity: number }[];
  specialInstructions?: string;
};

export function ProductConfigModal({
  product,
  initial,
  onClose,
  onSave,
  addLabel = "Add to Cart",
}: {
  product: ProductDetail;
  initial?: ProductCartLine;
  onClose: () => void;
  onSave: (line: ProductCartLine) => void;
  /** Button label for the "new item" state — POS keeps "Add to Cart"; other callers (e.g. amending a placed order) can override since there's no literal cart there. */
  addLabel?: string;
}) {
  const [choices, setChoices] = useState<Record<string, string[]>>(() => {
    if (initial) {
      const map: Record<string, string[]> = {};
      for (const c of initial.choices) map[c.choiceGroupId] = [...(map[c.choiceGroupId] ?? []), c.choiceOptionId];
      return map;
    }
    const auto: Record<string, string[]> = {};
    for (const { choiceGroup } of product.choiceGroups) {
      const activeOptions = choiceGroup.options.filter((o) => o.status === "ACTIVE");
      const single = autoSelectSingleOption(activeOptions);
      if (single.length > 0) auto[choiceGroup.id] = single;
    }
    return auto;
  });
  const [addonQty, setAddonQty] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (initial) for (const a of initial.addons) map[a.addonId] = a.quantity;
    return map;
  });
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [specialInstructions, setSpecialInstructions] = useState(initial?.specialInstructions ?? "");

  function toggleChoice(group: { id: string; selectionType: string; maxSelect: number }, optionId: string) {
    setChoices((prev) => {
      const current = prev[group.id] ?? [];
      if (group.selectionType === "SINGLE") return { ...prev, [group.id]: [optionId] };
      const exists = current.includes(optionId);
      let next = exists ? current.filter((id) => id !== optionId) : [...current, optionId];
      if (!exists && next.length > group.maxSelect) next = current;
      return { ...prev, [group.id]: next };
    });
  }

  const unitPrice = effectivePrice(product.basePrice, product.discountPrice);

  const choiceBreakdown = useMemo(() => {
    return product.choiceGroups.flatMap(({ choiceGroup }) =>
      (choices[choiceGroup.id] ?? []).map((optId) => {
        const opt = choiceGroup.options.find((o) => o.id === optId)!;
        return {
          choiceGroupId: choiceGroup.id,
          choiceOptionId: opt.id,
          name: opt.name,
          priceAdjustment: effectivePrice(opt.priceAdjustment, opt.discountPriceAdjustment),
        };
      }),
    );
  }, [choices, product.choiceGroups]);

  const addonBreakdown = useMemo(() => {
    return product.addons
      .map(({ addon }) => ({
        addonId: addon.id,
        name: addon.name,
        price: effectivePrice(addon.price, addon.discountPrice),
        quantity: addonQty[addon.id] ?? 0,
      }))
      .filter((a) => a.quantity > 0);
  }, [addonQty, product.addons]);

  const lineUnitTotal =
    unitPrice + choiceBreakdown.reduce((s, c) => s + c.priceAdjustment, 0) + addonBreakdown.reduce((s, a) => s + a.price * a.quantity, 0);

  const isValid = product.choiceGroups.every(({ choiceGroup, isRequiredOverride, minSelectOverride, maxSelectOverride }) => {
    const rules = resolveChoiceGroupRules(choiceGroup, { isRequiredOverride, minSelectOverride, maxSelectOverride });
    const picked = choices[choiceGroup.id]?.length ?? 0;
    if (rules.isRequired && picked === 0) return false;
    if (picked > 0 && (picked < rules.minSelect || picked > rules.maxSelect)) return false;
    return true;
  });

  function handleSave() {
    onSave({
      kind: "product",
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      choices: choiceBreakdown,
      addons: addonBreakdown,
      specialInstructions: specialInstructions || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">{product.name}</p>
          <button onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="modal-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {product.choiceGroups.map(({ choiceGroupId, choiceGroup, isRequiredOverride, minSelectOverride, maxSelectOverride }) => {
            const rules = resolveChoiceGroupRules(choiceGroup, { isRequiredOverride, minSelectOverride, maxSelectOverride });
            return (
              <div key={choiceGroupId} className="rounded-xl border border-neutral-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-900">{choiceGroup.name}</p>
                  {rules.isRequired && <span className="rounded-full bg-brand-red/10 px-2.5 py-0.5 text-[11px] font-medium text-brand-red">Required</span>}
                </div>
                <div className="mt-2 space-y-1">
                  {choiceGroup.options
                    .filter((o) => o.status === "ACTIVE")
                    .map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                          (choices[choiceGroup.id] ?? []).includes(opt.id) ? "border-brand-red bg-brand-red/5" : "border-transparent hover:bg-neutral-50"
                        }`}
                      >
                        <span>{opt.name}</span>
                        <span className="flex items-center gap-2">
                          {opt.priceAdjustment > 0 && <span className="text-xs text-neutral-500">+{formatPaisa(effectivePrice(opt.priceAdjustment, opt.discountPriceAdjustment))}</span>}
                          <input
                            type={rules.selectionType === "SINGLE" ? "radio" : "checkbox"}
                            name={choiceGroupId}
                            checked={(choices[choiceGroup.id] ?? []).includes(opt.id)}
                            onChange={() => toggleChoice({ id: choiceGroup.id, selectionType: rules.selectionType, maxSelect: rules.maxSelect }, opt.id)}
                            className="h-4 w-4 accent-brand-red"
                          />
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            );
          })}

          {product.addons.length > 0 && (
            <div className="rounded-xl border border-neutral-200 p-3">
              <p className="text-sm font-semibold text-neutral-900">Add-ons</p>
              <div className="mt-2 space-y-1">
                {product.addons
                  .filter((pa) => pa.addon.status === "ACTIVE")
                  .map(({ addon }) => {
                    const qty = addonQty[addon.id] ?? 0;
                    return (
                      <div key={addon.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                        <span>
                          {addon.name} <span className="text-xs text-neutral-400">+{formatPaisa(effectivePrice(addon.price, addon.discountPrice))}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setAddonQty((s) => ({ ...s, [addon.id]: Math.max(0, qty - 1) }))}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-neutral-700"
                          >
                            −
                          </button>
                          <span className="w-4 text-center">{qty}</span>
                          <button
                            type="button"
                            onClick={() => setAddonQty((s) => ({ ...s, [addon.id]: Math.min(addon.maxQuantity, qty + 1) }))}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-red text-white"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-neutral-500">Special Instructions</p>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value.slice(0, 500))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              rows={2}
              placeholder="e.g. no onions"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
            <p className="text-sm font-semibold text-neutral-900">Quantity</p>
            <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300">
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="flex h-9 w-9 items-center justify-center text-lg text-neutral-600 hover:bg-neutral-50">
                −
              </button>
              <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
              <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="Increase quantity" className="flex h-9 w-9 items-center justify-center text-lg text-neutral-600 hover:bg-neutral-50">
                +
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-200 p-4">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="flex w-full items-center justify-between rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <span>{initial ? "Update Item" : addLabel}</span>
            <span>{formatPaisa(lineUnitTotal * quantity)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
