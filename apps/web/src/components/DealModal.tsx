"use client";

import { createPortal } from "react-dom";

import { useEffect, useMemo, useState } from "react";
import { formatPaisa } from "@restaurant/utils";
import { resolveChoiceGroupRules, autoSelectSingleOption } from "@restaurant/utils";
import { api, ApiError } from "../lib/api";
import type { Deal, DealSlot } from "../lib/types";
import { groupAddonsByCategory, type AddonCategory } from "../lib/types";
import { useCartStore, makeCartItemId } from "../store/useCartStore";
import { useFallbackProductImage } from "../lib/image";
import { ArrowRightIcon, CloseIcon, MinusIcon, PlusIcon, TrashIcon } from "./icons";
import { ChoiceOptionCard } from "./ChoiceOptionCard";
import { useLocationStore } from "../store/useLocationStore";
import { isOptionUnavailableAt } from "../lib/outOfStock";
import { AccordionSection } from "./AccordionSection";
import { toast } from "../store/useToastStore";

type SlotSelection = {
  productId: string;
  choices: Record<string, string[]>;
  addons: Record<string, number>;
};

type PricePreview = {
  dealPrice: number;
  normalTotal: number;
  youSave: number;
  slots: Array<{
    dealSlotId: string;
    label: string;
    productName: string;
    unitPrice: number;
    choices: Array<{ choiceGroupId: string; choiceOptionId: string; name: string; priceAdjustment: number }>;
    addons: Array<{ addonId: string; name: string; price: number; quantity: number }>;
    slotTotal: number;
  }>;
};

// Each choice group / add-on category / multi-option product pick renders as its own
// top-level, independently collapsible section — never nested inside another section.
type Section =
  | { key: string; kind: "product"; slot: DealSlot }
  | { key: string; kind: "choice"; slot: DealSlot; choiceGroupId: string; choiceGroup: DealSlot["choiceGroups"][number]["choiceGroup"] }
  | { key: string; kind: "addon"; slot: DealSlot; category: AddonCategory };

function buildSections(deal: Deal): Section[] {
  return deal.slots.flatMap((slot): Section[] => {
    const items: Section[] = [];
    if (slot.productOptions.length > 1) {
      items.push({ key: `product:${slot.id}`, kind: "product", slot });
    }
    for (const { choiceGroupId, choiceGroup } of slot.choiceGroups) {
      items.push({ key: `choice:${slot.id}:${choiceGroupId}`, kind: "choice", slot, choiceGroupId, choiceGroup });
    }
    for (const category of groupAddonsByCategory(slot.addons.map((a) => a.addon))) {
      items.push({ key: `addon:${slot.id}:${category.id}`, kind: "addon", slot, category });
    }
    return items;
  });
}

function buildInitialSelections(deal: Deal): Record<string, SlotSelection> {
  const initial: Record<string, SlotSelection> = {};
  for (const slot of deal.slots) {
    const choices: Record<string, string[]> = {};
    for (const { choiceGroupId, choiceGroup } of slot.choiceGroups) {
      const auto = autoSelectSingleOption(choiceGroup.options.filter((o) => !isOptionUnavailableAt(o, useLocationStore.getState().branch?.id)));
      if (auto.length > 0) choices[choiceGroupId] = auto;
    }
    // Only pre-fill the product when there's a single option (nothing to actually choose) —
    // with multiple options the slot should start unselected, matching every other section.
    const productId = slot.productOptions.length === 1 ? (slot.productOptions[0]?.product.id ?? "") : "";
    initial[slot.id] = { productId, choices, addons: {} };
  }
  return initial;
}

function isSectionSatisfied(section: Section, sel: SlotSelection): boolean {
  if (section.kind === "product") return !!sel.productId;
  if (section.kind === "choice") return (sel.choices[section.choiceGroupId]?.length ?? 0) > 0;
  return section.category.addons.some((a) => (sel.addons[a.id] ?? 0) > 0);
}

export function DealModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const addItem = useCartStore((s) => s.addItem);
  const fallbackImage = useFallbackProductImage();
  const [selections, setSelections] = useState<Record<string, SlotSelection>>(() => buildInitialSelections(deal));
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState("");

  const sections = useMemo(() => buildSections(deal), [deal]);

  const [openSection, setOpenSection] = useState<string | null>(() => {
    const initialSelections = buildInitialSelections(deal);
    const firstUnsatisfied = sections.find((s) => !isSectionSatisfied(s, initialSelections[s.slot.id]!));
    return (firstUnsatisfied ?? sections[0])?.key ?? null;
  });

  const isSlotValid = (slot: DealSlot) => {
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
        setError(null);
        const body = {
          selections: deal.slots.map((slot) => {
            const sel = selections[slot.id]!;
            return {
              dealSlotId: slot.id,
              productId: sel.productId,
              choices: Object.entries(sel.choices).flatMap(([choiceGroupId, optionIds]) =>
                optionIds.map((choiceOptionId) => ({ choiceGroupId, choiceOptionId })),
              ),
              addons: Object.entries(sel.addons)
                .filter(([, qty]) => qty > 0)
                .map(([addonId, quantity]) => ({ addonId, quantity })),
            };
          }),
        };
        const result = await api.public.post<PricePreview>(`/deals/${deal.id}/price-preview`, body);
        setPreview(result);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not price this deal");
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, allValid]);

  function updateSlot(slotId: string, update: Partial<SlotSelection>) {
    setSelections((prev) => ({ ...prev, [slotId]: { ...prev[slotId]!, ...update } }));
  }

  function toggleChoice(slotId: string, group: { id: string; selectionType: string; maxSelect: number }, optionId: string) {
    const unavailable = deal.slots.some((sl) => sl.choiceGroups.some((cg) => cg.choiceGroup.options.some((o) => o.id === optionId && isOptionUnavailableAt(o, useLocationStore.getState().branch?.id))));
    if (unavailable) return; // out of stock at this branch
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

  function handleAdd() {
    if (!preview) return;
    addItem({
      cartItemId: makeCartItemId(),
      kind: "deal",
      dealId: deal.id,
      name: deal.name,
      image: deal.image ?? undefined,
      quantity,
      dealPrice: preview.dealPrice,
      slots: preview.slots.map((s) => ({
        dealSlotId: s.dealSlotId,
        slotLabel: s.label,
        productId: selections[s.dealSlotId]!.productId,
        productName: s.productName,
        choices: s.choices.map((c) => ({ choiceGroupId: c.choiceGroupId, choiceOptionId: c.choiceOptionId, name: c.name, priceAdjustment: c.priceAdjustment })),
        addons: s.addons.map((a) => ({ addonId: a.addonId, quantity: a.quantity, name: a.name, price: a.price })),
      })),
      specialInstructions: specialInstructions || undefined,
    });
    toast.cart(`${deal.name} added to cart`);
    onClose();
  }

  // Stop the page behind the sheet from scrolling while it is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const footerBar = (
    <>
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand-red/25 bg-brand-red/10 p-1 sm:gap-3">
        {quantity > 1 ? (
          <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-brand-red sm:h-9 sm:w-9">
            <MinusIcon size={14} />
          </button>
        ) : (
          <button onClick={onClose} aria-label="Discard item" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-red/15 text-brand-red sm:h-9 sm:w-9">
            <TrashIcon size={14} />
          </button>
        )}
        <span className="w-5 text-center text-sm font-semibold text-ink sm:w-6">{quantity}</span>
        <button onClick={() => setQuantity((q) => q + 1)} aria-label="Increase quantity" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-red text-white sm:h-9 sm:w-9">
          <PlusIcon size={14} />
        </button>
      </div>
      <button
        onClick={handleAdd}
        disabled={!preview}
        className="relative flex min-w-0 flex-1 items-center justify-center gap-2.5 overflow-hidden whitespace-nowrap rounded-2xl bg-brand-red px-3 py-3.5 font-poppins text-[13px] font-bold leading-[16px] text-white shadow-[0_6px_20px_rgba(237,35,32,0.4)] disabled:opacity-50 sm:gap-4 sm:px-5 sm:py-4 sm:text-[15px]"
      >
        {preview ? (
          <>
            <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full animate-cart-shine bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            <span>{formatPaisa(preview.dealPrice * quantity)}</span>
            <span aria-hidden="true" className="h-4 w-px bg-white/70" />
            <span className="flex items-center gap-2">
              Add to Cart <ArrowRightIcon size={14} className="animate-ride" />
            </span>
          </>
        ) : (
          <span>Select Required Options</span>
        )}
      </button>
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="relative flex h-[90dvh] max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-surface sm:h-auto sm:max-h-[85vh] sm:flex-row sm:rounded-3xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-brand-red text-white shadow-[0_0_16px_rgba(237,35,32,0.55)] transition hover:opacity-90"
        >
          <CloseIcon size={18} />
        </button>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:contents">
        <div className="relative w-full shrink-0 overflow-hidden bg-surface-alt sm:w-[45%] sm:self-stretch">
          {/* soft blurred copy of the photo only shows below the square picture when the popup is taller than it */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={deal.image ?? fallbackImage} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl" />
          {/* a square picture that fills the panel width, with the same gentle zoom the menu cards have */}
          <div className="group relative aspect-square w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={deal.image ?? fallbackImage}
              alt={deal.name}
              className="absolute inset-0 h-full w-full scale-[1.04] object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
            <h2 className="absolute inset-x-0 bottom-0 p-5 font-poppins text-2xl font-bold uppercase leading-tight text-white sm:p-6 sm:text-3xl">{deal.name}</h2>
          </div>
        </div>

        <div className="flex flex-col sm:flex-1 sm:overflow-y-auto">
          <div className="p-6 sm:p-8">
            <p className="pr-14 font-poppins text-3xl font-bold text-ink sm:text-4xl">
              {deal.originalPrice != null && <span className="mr-2 text-xl font-normal text-muted line-through">{formatPaisa(deal.originalPrice)}</span>}
              {formatPaisa(deal.dealPrice)}
            </p>
            {deal.description && <p className="mt-3 text-[15px] leading-relaxed text-muted">{deal.description}</p>}

            <div className="mt-5 space-y-3">
              {sections.map((section) => {
                const sel = selections[section.slot.id]!;
                const satisfied = isSectionSatisfied(section, sel);
                const isOpen = openSection === section.key;
                const onToggle = () => setOpenSection(isOpen ? null : section.key);

                if (section.kind === "product") {
                  return (
                    <AccordionSection key={section.key} title={section.slot.label} satisfied={satisfied} requiredBadge isOpen={isOpen} onToggle={onToggle}>
                      {section.slot.productOptions.map(({ product }) => (
                        <label key={product.id} className="flex cursor-pointer items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="text-ink">{product.name}</span>
                          <input
                            type="radio"
                            name={`slot-product-${section.slot.id}`}
                            checked={sel.productId === product.id}
                            onChange={() => updateSlot(section.slot.id, { productId: product.id })}
                            className="h-4 w-4 accent-brand-red"
                          />
                        </label>
                      ))}
                    </AccordionSection>
                  );
                }

                if (section.kind === "choice") {
                  const rules = resolveChoiceGroupRules(section.choiceGroup);
                  return (
                    <AccordionSection
                      key={section.key}
                      title={`${section.slot.label}: ${section.choiceGroup.name}`}
                      satisfied={satisfied}
                      requiredBadge={rules.isRequired}
                      isOpen={isOpen}
                      onToggle={onToggle}
                    >
                      <div className="grid grid-cols-1 gap-2 py-2">
                        {section.choiceGroup.options.map((opt) => (
                          <ChoiceOptionCard
                            key={opt.id}
                            name={opt.name}
                            groupName={section.key}
                            type={rules.selectionType === "SINGLE" ? "radio" : "checkbox"}
                            checked={(sel.choices[section.choiceGroupId] ?? []).includes(opt.id)}
                            onChange={() =>
                              toggleChoice(
                                section.slot.id,
                                { id: section.choiceGroupId, selectionType: rules.selectionType, maxSelect: rules.maxSelect },
                                opt.id,
                              )
                            }
                            priceLabel={opt.showPrice !== false && !opt.useListingPrice && opt.priceAdjustment > 0 ? `${section.choiceGroup.priceReplacesBase ? "" : "+ "}${formatPaisa(opt.priceAdjustment)}` : undefined}
                            description={opt.description}
                            unavailable={isOptionUnavailableAt(opt, useLocationStore.getState().branch?.id)}
                          />
                        ))}
                      </div>
                    </AccordionSection>
                  );
                }

                return (
                  <AccordionSection
                    key={section.key}
                    title={`${section.slot.label}: ${section.category.name}`}
                    satisfied={satisfied}
                    requiredBadge={false}
                    isOpen={isOpen}
                    onToggle={onToggle}
                  >
                    {section.category.addons.map((a) => {
                      const qty = sel.addons[a.id] ?? 0;
                      return (
                        <div key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="text-ink">{a.name} {a.price > 0 && <span className="text-muted">+ {formatPaisa(a.price)}</span>}</span>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              onClick={() => setAddonQty(section.slot.id, a.id, qty - 1, a.maxQuantity)}
                              aria-label="Decrease quantity"
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-alt text-ink"
                            >
                              <MinusIcon size={12} />
                            </button>
                            <span className="w-4 text-center">{qty}</span>
                            <button
                              onClick={() => setAddonQty(section.slot.id, a.id, qty + 1, a.maxQuantity)}
                              aria-label="Increase quantity"
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-red text-white"
                            >
                              <PlusIcon size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </AccordionSection>
                );
              })}
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {preview && preview.youSave > 0 && (
              <p className="mt-4 text-sm font-medium text-green-700">You Save {formatPaisa(preview.youSave)}</p>
            )}

            <div className="mt-5 border-t pt-4">
              <h3 className="font-medium text-ink">Special Instructions</h3>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value.slice(0, 500))}
                placeholder="Please enter instructions about this item"
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                rows={2}
              />
              <p className="mt-1 text-right text-xs text-muted">{specialInstructions.length}/500</p>
            </div>
          </div>

          <div className="sticky bottom-0 mt-auto hidden items-center gap-4 bg-surface p-4 sm:flex sm:px-8 sm:py-5">{footerBar}</div>
        </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:hidden">{footerBar}</div>
      </div>
    </div>,
    document.body,
  );
}
