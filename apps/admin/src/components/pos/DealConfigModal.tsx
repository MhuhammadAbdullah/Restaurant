"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPaisa, resolveChoiceGroupRules, autoSelectSingleOption } from "@restaurant/utils";
import { api, ApiError } from "../../lib/api";
import { toast } from "../../store/useToastStore";
import { CloseIcon, MinusIcon, PlusIcon } from "../icons";

export type Deal = {
  id: string;
  name: string;
  image: string | null;
  dealPrice: number;
  originalPrice: number | null;
  slots: {
    id: string;
    label: string;
    productOptions: { product: { id: string; name: string } }[];
    choiceGroups: {
      choiceGroupId: string;
      choiceGroup: { id: string; name: string; isRequired: boolean; selectionType: "SINGLE" | "MULTIPLE"; minSelect: number; maxSelect: number; options: { id: string; name: string; priceAdjustment: number }[] };
    }[];
    addons: { addon: { id: string; name: string; price: number; maxQuantity: number } }[];
  }[];
};

export type DealCartLine = {
  kind: "deal";
  dealId: string;
  name: string;
  quantity: number;
  dealPrice: number;
  slots: {
    dealSlotId: string;
    slotLabel: string;
    productId: string;
    productName: string;
    choices: { choiceGroupId: string; choiceOptionId: string; name: string; priceAdjustment: number }[];
    addons: { addonId: string; name: string; price: number; quantity: number }[];
  }[];
};

type SlotSelection = { productId: string; choices: Record<string, string[]>; addons: Record<string, number> };

type PricePreview = {
  dealPrice: number;
  slots: Array<{
    dealSlotId: string;
    label: string;
    productName: string;
    choices: Array<{ choiceGroupId: string; choiceOptionId: string; name: string; priceAdjustment: number }>;
    addons: Array<{ addonId: string; name: string; price: number; quantity: number }>;
  }>;
};

function buildInitialSelections(deal: Deal): Record<string, SlotSelection> {
  const initial: Record<string, SlotSelection> = {};
  for (const slot of deal.slots) {
    const choices: Record<string, string[]> = {};
    for (const { choiceGroupId, choiceGroup } of slot.choiceGroups) {
      const auto = autoSelectSingleOption(choiceGroup.options);
      if (auto.length > 0) choices[choiceGroupId] = auto;
    }
    const productId = slot.productOptions.length === 1 ? (slot.productOptions[0]?.product.id ?? "") : "";
    initial[slot.id] = { productId, choices, addons: {} };
  }
  return initial;
}

export function DealConfigModal({ deal, onClose, onSave }: { deal: Deal; onClose: () => void; onSave: (line: DealCartLine) => void }) {
  const [selections, setSelections] = useState<Record<string, SlotSelection>>(() => buildInitialSelections(deal));
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const [quantity, setQuantity] = useState(1);

  const isSlotValid = (slot: Deal["slots"][number]) => {
    const sel = selections[slot.id];
    if (!sel?.productId) return false;
    return slot.choiceGroups.every(({ choiceGroupId, choiceGroup: g }) => {
      const rules = resolveChoiceGroupRules(g);
      const picked = sel.choices[choiceGroupId]?.length ?? 0;
      if (rules.isRequired && picked === 0) return false;
      if (picked > 0 && (picked < rules.minSelect || picked > rules.maxSelect)) return false;
      return true;
    });
  };
  const allValid = deal.slots.every(isSlotValid);

  useEffect(() => {
    if (!allValid) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const body = {
          selections: deal.slots.map((slot) => {
            const sel = selections[slot.id]!;
            return {
              dealSlotId: slot.id,
              productId: sel.productId,
              choices: Object.entries(sel.choices).flatMap(([choiceGroupId, optionIds]) => optionIds.map((choiceOptionId) => ({ choiceGroupId, choiceOptionId }))),
              addons: Object.entries(sel.addons).filter(([, qty]) => qty > 0).map(([addonId, quantity]) => ({ addonId, quantity })),
            };
          }),
        };
        const result = await api.post<PricePreview>(`/deals/${deal.id}/price-preview`, body);
        setPreview(result);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Could not price this deal");
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, allValid]);

  function updateSlot(slotId: string, update: Partial<SlotSelection>) {
    setSelections((prev) => ({ ...prev, [slotId]: { ...prev[slotId]!, ...update } }));
  }
  function toggleChoice(slotId: string, group: { id: string; selectionType: string; maxSelect: number }, optionId: string) {
    setSelections((prev) => {
      const sel = prev[slotId]!;
      const current = sel.choices[group.id] ?? [];
      let next: string[];
      if (group.selectionType === "SINGLE") next = [optionId];
      else {
        const exists = current.includes(optionId);
        next = exists ? current.filter((id) => id !== optionId) : [...current, optionId];
        if (!exists && next.length > group.maxSelect) next = current;
      }
      return { ...prev, [slotId]: { ...sel, choices: { ...sel.choices, [group.id]: next } } };
    });
  }
  function setAddonQty(slotId: string, addonId: string, qty: number, max: number) {
    const sel = selections[slotId]!;
    updateSlot(slotId, { addons: { ...sel.addons, [addonId]: Math.max(0, Math.min(qty, max)) } });
  }

  const slotsWithSelectableProduct = useMemo(() => deal.slots.filter((s) => s.productOptions.length > 1), [deal.slots]);

  function handleSave() {
    if (!preview) return;
    onSave({
      kind: "deal",
      dealId: deal.id,
      name: deal.name,
      quantity,
      dealPrice: deal.dealPrice,
      slots: preview.slots.map((s) => ({
        dealSlotId: s.dealSlotId,
        slotLabel: s.label,
        productId: selections[s.dealSlotId]!.productId,
        productName: s.productName,
        choices: s.choices,
        addons: s.addons,
      })),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">{deal.name}</p>
          <button onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="modal-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {deal.slots.map((slot) => {
            const sel = selections[slot.id]!;
            return (
              <div key={slot.id} className="rounded-lg border border-neutral-200 p-3">
                <p className="text-sm font-semibold text-neutral-900">{slot.label}</p>

                {slotsWithSelectableProduct.some((s) => s.id === slot.id) && (
                  <div className="mt-1.5 space-y-1">
                    {slot.productOptions.map(({ product }) => (
                      <label key={product.id} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-sm">
                        <span>{product.name}</span>
                        <input
                          type="radio"
                          name={`slot-product-${slot.id}`}
                          checked={sel.productId === product.id}
                          onChange={() => updateSlot(slot.id, { productId: product.id })}
                          className="h-4 w-4 accent-brand-red"
                        />
                      </label>
                    ))}
                  </div>
                )}

                {slot.choiceGroups.map(({ choiceGroupId, choiceGroup: g }) => {
                  const rules = resolveChoiceGroupRules(g);
                  return (
                    <div key={choiceGroupId} className="mt-2">
                      <p className="text-xs font-medium text-neutral-500">
                        {g.name} {rules.isRequired && <span className="text-brand-red">Required</span>}
                      </p>
                      <div className="mt-1 space-y-1">
                        {g.options.map((opt) => (
                          <label key={opt.id} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-sm">
                            <span>{opt.name}</span>
                            <span className="flex items-center gap-2">
                              {opt.priceAdjustment > 0 && <span className="text-xs text-neutral-400">+{formatPaisa(opt.priceAdjustment)}</span>}
                              <input
                                type={rules.selectionType === "SINGLE" ? "radio" : "checkbox"}
                                name={`${slot.id}-${choiceGroupId}`}
                                checked={(sel.choices[choiceGroupId] ?? []).includes(opt.id)}
                                onChange={() => toggleChoice(slot.id, { id: choiceGroupId, selectionType: rules.selectionType, maxSelect: rules.maxSelect }, opt.id)}
                                className="h-4 w-4 accent-brand-red"
                              />
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {slot.addons.map(({ addon }) => {
                  const qty = sel.addons[addon.id] ?? 0;
                  return (
                    <div key={addon.id} className="mt-2 flex items-center justify-between text-sm">
                      <span>
                        {addon.name} {addon.price > 0 && <span className="text-xs text-neutral-400">+{formatPaisa(addon.price)}</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setAddonQty(slot.id, addon.id, qty - 1, addon.maxQuantity)} className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100"><MinusIcon size={11} /></button>
                        <span className="w-4 text-center">{qty}</span>
                        <button type="button" onClick={() => setAddonQty(slot.id, addon.id, qty + 1, addon.maxQuantity)} className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-red text-white"><PlusIcon size={11} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-900">Quantity</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100"><MinusIcon size={12} /></button>
              <span className="w-6 text-center">{quantity}</span>
              <button type="button" onClick={() => setQuantity((q) => q + 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white"><PlusIcon size={12} /></button>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-200 p-4">
          <button
            onClick={handleSave}
            disabled={!preview}
            className="flex w-full items-center justify-between rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <span>{preview ? "Add to Cart" : "Configure your deal"}</span>
            <span>{preview ? formatPaisa(deal.dealPrice * quantity) : ""}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
