"use client";

import { useMemo, useState } from "react";
import { formatPaisa } from "@restaurant/utils";
import { effectivePrice, resolveChoiceGroupRules, autoSelectSingleOption } from "@restaurant/utils";
import type { Product } from "../lib/types";
import { groupAddonsByCategory } from "../lib/types";
import { useCartStore, makeCartItemId } from "../store/useCartStore";
import { resolveProductImage, useFallbackProductImage } from "../lib/image";
import { ArrowRightIcon, CloseIcon, MinusIcon, PlusIcon } from "./icons";
import { AccordionSection } from "./AccordionSection";
import { toast } from "../store/useToastStore";

export function ProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const addItem = useCartStore((s) => s.addItem);
  const fallbackImage = useFallbackProductImage();
  const image = resolveProductImage(product, fallbackImage);

  const choiceAssignments = product.choiceGroups ?? [];
  const addonCategories = useMemo(() => groupAddonsByCategory((product.addons ?? []).map((a) => a.addon)), [product.addons]);
  const basePrice = effectivePrice(product.basePrice, product.discountPrice);

  const [selectedChoices, setSelectedChoices] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const assignment of choiceAssignments) {
      const auto = autoSelectSingleOption(assignment.choiceGroup.options);
      if (auto.length > 0) initial[assignment.choiceGroupId] = auto;
    }
    return initial;
  });
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState("");

  const [openSection, setOpenSection] = useState<string | null>(() => {
    const firstRequired = choiceAssignments.find((c) => resolveChoiceGroupRules(c.choiceGroup, c).isRequired) ?? choiceAssignments[0];
    return firstRequired ? `choice:${firstRequired.choiceGroupId}` : null;
  });

  const isValid = useMemo(() => {
    return choiceAssignments.every((c) => {
      const rules = resolveChoiceGroupRules(c.choiceGroup, c);
      const picked = selectedChoices[c.choiceGroupId]?.length ?? 0;
      if (rules.isRequired && picked === 0) return false;
      if (picked > 0 && (picked < rules.minSelect || picked > rules.maxSelect)) return false;
      return true;
    });
  }, [choiceAssignments, selectedChoices]);

  const unitPrice = useMemo(() => {
    let total = basePrice;
    for (const c of choiceAssignments) {
      for (const optId of selectedChoices[c.choiceGroupId] ?? []) {
        const opt = c.choiceGroup.options.find((o) => o.id === optId);
        if (opt) total += effectivePrice(opt.priceAdjustment, opt.discountPriceAdjustment);
      }
    }
    for (const category of addonCategories) {
      for (const addon of category.addons) {
        const qty = selectedAddons[addon.id] ?? 0;
        total += effectivePrice(addon.price, addon.discountPrice) * qty;
      }
    }
    return total;
  }, [basePrice, choiceAssignments, addonCategories, selectedChoices, selectedAddons]);

  function toggleChoice(assignment: (typeof choiceAssignments)[number], optionId: string) {
    const rules = resolveChoiceGroupRules(assignment.choiceGroup, assignment);
    setSelectedChoices((prev) => {
      const current = prev[assignment.choiceGroupId] ?? [];
      if (rules.selectionType === "SINGLE") {
        return { ...prev, [assignment.choiceGroupId]: [optionId] };
      }
      const exists = current.includes(optionId);
      const next = exists ? current.filter((id) => id !== optionId) : [...current, optionId];
      if (!exists && next.length > rules.maxSelect) return prev;
      return { ...prev, [assignment.choiceGroupId]: next };
    });
  }

  function setAddonQty(addonId: string, qty: number, max: number) {
    setSelectedAddons((prev) => ({ ...prev, [addonId]: Math.max(0, Math.min(qty, max)) }));
  }

  function handleAdd() {
    if (!isValid) return;
    const choices = choiceAssignments.flatMap((c) =>
      (selectedChoices[c.choiceGroupId] ?? []).map((optId) => {
        const opt = c.choiceGroup.options.find((o) => o.id === optId)!;
        return {
          choiceGroupId: c.choiceGroupId,
          choiceOptionId: opt.id,
          name: opt.name,
          priceAdjustment: effectivePrice(opt.priceAdjustment, opt.discountPriceAdjustment),
        };
      }),
    );
    const addons = addonCategories
      .flatMap((category) => category.addons)
      .filter((a) => (selectedAddons[a.id] ?? 0) > 0)
      .map((a) => ({ addonId: a.id, quantity: selectedAddons[a.id]!, name: a.name, price: effectivePrice(a.price, a.discountPrice) }));

    addItem({
      cartItemId: makeCartItemId(),
      kind: "product",
      productId: product.id,
      name: product.name,
      image,
      quantity,
      unitPrice: basePrice,
      choices,
      addons,
      specialInstructions: specialInstructions || undefined,
    });
    toast.cart(`${product.name} added to cart`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="relative flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-surface sm:flex-row sm:rounded-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-brand-red text-white shadow"
        >
          <CloseIcon size={16} />
        </button>

        <div className="h-80 shrink-0 self-start bg-white p-4 sm:w-2/5 sm:p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={product.name} className="h-full w-full rounded-xl object-contain" />
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="p-5">
            <h2 className="text-xl font-semibold text-ink">{product.name}</h2>
            <p className="mt-1 font-semibold">
              {product.discountPrice != null && <span className="mr-1.5 text-muted line-through">{formatPaisa(product.basePrice)}</span>}
              <span className="text-brand-red">{formatPaisa(basePrice)}</span>
            </p>
            {product.description && <p className="mt-2 text-sm text-muted">{product.description}</p>}

            <div className="mt-5 space-y-3">
              {choiceAssignments.map((assignment) => {
                const g = assignment.choiceGroup;
                const rules = resolveChoiceGroupRules(g, assignment);
                const sectionKey = `choice:${assignment.choiceGroupId}`;
                const isSatisfied = (selectedChoices[assignment.choiceGroupId]?.length ?? 0) > 0;

                return (
                  <AccordionSection
                    key={sectionKey}
                    title={g.name}
                    satisfied={isSatisfied}
                    requiredBadge={rules.isRequired}
                    isOpen={openSection === sectionKey}
                    onToggle={() => setOpenSection(openSection === sectionKey ? null : sectionKey)}
                  >
                    {g.options.map((opt) => {
                      const optPrice = effectivePrice(opt.priceAdjustment, opt.discountPriceAdjustment);
                      return (
                        <label key={opt.id} className="flex cursor-pointer items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="text-ink">{opt.name}</span>
                          <span className="flex shrink-0 items-center gap-3">
                            {optPrice > 0 && (
                              <span className="text-muted">
                                {opt.discountPriceAdjustment != null && (
                                  <span className="mr-1 line-through">+ {formatPaisa(opt.priceAdjustment)}</span>
                                )}
                                + {formatPaisa(optPrice)}
                              </span>
                            )}
                            <input
                              type={rules.selectionType === "SINGLE" ? "radio" : "checkbox"}
                              name={assignment.choiceGroupId}
                              checked={(selectedChoices[assignment.choiceGroupId] ?? []).includes(opt.id)}
                              onChange={() => toggleChoice(assignment, opt.id)}
                              className="h-4 w-4 accent-brand-red"
                            />
                          </span>
                        </label>
                      );
                    })}
                  </AccordionSection>
                );
              })}

              {addonCategories.map((category) => {
                const sectionKey = `addon:${category.id}`;
                const isSatisfied = category.addons.some((a) => (selectedAddons[a.id] ?? 0) > 0);

                return (
                  <AccordionSection
                    key={sectionKey}
                    title={category.name}
                    satisfied={isSatisfied}
                    requiredBadge={false}
                    isOpen={openSection === sectionKey}
                    onToggle={() => setOpenSection(openSection === sectionKey ? null : sectionKey)}
                  >
                    {category.addons.map((a) => {
                      const addonPrice = effectivePrice(a.price, a.discountPrice);
                      const qty = selectedAddons[a.id] ?? 0;
                      return (
                        <div key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="text-ink">
                            {a.name}{" "}
                            {addonPrice > 0 && (
                              <span className="text-muted">
                                {a.discountPrice != null && <span className="mr-1 line-through">+ {formatPaisa(a.price)}</span>}+ {formatPaisa(addonPrice)}
                              </span>
                            )}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              onClick={() => setAddonQty(a.id, qty - 1, a.maxQuantity)}
                              aria-label="Decrease quantity"
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-alt text-ink"
                            >
                              <MinusIcon size={12} />
                            </button>
                            <span className="w-4 text-center">{qty}</span>
                            <button
                              onClick={() => setAddonQty(a.id, qty + 1, a.maxQuantity)}
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

            <div className="mt-5 border-t pt-4">
              <h3 className="font-medium text-ink">Instructions</h3>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value.slice(0, 500))}
                placeholder="Any Special Instructions?"
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                rows={2}
              />
              <p className="mt-1 text-right text-xs text-muted">{specialInstructions.length}/500</p>
            </div>
          </div>

          <div className="sticky bottom-0 mt-auto flex items-center gap-3 border-t bg-surface p-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-alt text-ink"
              >
                <MinusIcon size={14} />
              </button>
              <span className="w-5 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-red text-white"
              >
                <PlusIcon size={14} />
              </button>
            </div>
            <button
              onClick={handleAdd}
              disabled={!isValid}
              className="relative flex flex-1 items-center justify-between overflow-hidden rounded-lg bg-brand-red px-5 py-3 font-poppins text-[14px] font-bold leading-[14px] text-white disabled:opacity-50"
            >
              {isValid && (
                <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full animate-cart-shine bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              )}
              <span>{formatPaisa(unitPrice * quantity)}</span>
              <span className="flex items-center gap-1.5">
                Add to Cart <ArrowRightIcon size={12} className="animate-ride" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
