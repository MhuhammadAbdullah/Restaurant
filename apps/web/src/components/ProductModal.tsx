"use client";

import { useMemo, useState } from "react";
import { formatPaisa } from "@restaurant/utils";
import { effectivePrice, resolveChoiceGroupRules, autoSelectSingleOption } from "@restaurant/utils";
import type { Product } from "../lib/types";
import { groupAddonsByCategory } from "../lib/types";
import { useCartStore, makeCartItemId } from "../store/useCartStore";
import { resolveProductImage, useFallbackProductImage } from "../lib/image";
import { FaShareNodes } from "react-icons/fa6";
import { ArrowRightIcon, CloseIcon, MinusIcon, PlusIcon, TrashIcon } from "./icons";
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

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `${product.name} - ${formatPaisa(basePrice)}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: product.name, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`.trim());
      toast.success("Link copied to clipboard");
    } catch {
      // share sheet dismissed by the user — nothing to do
    }
  }

  const glowButton =
    "flex h-11 w-11 items-center justify-center rounded-full bg-brand-red text-white shadow-[0_0_16px_rgba(237,35,32,0.55)] transition hover:opacity-90";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="relative flex h-[90vh] w-full max-w-4xl flex-col overflow-y-auto rounded-t-3xl bg-surface sm:h-auto sm:max-h-[85vh] sm:flex-row sm:overflow-hidden sm:rounded-3xl">
        {/* On mobile the whole sheet scrolls; this zero-height sticky row keeps share/close reachable while scrolling. */}
        <div className="sticky top-0 z-20 h-0 shrink-0 sm:static sm:h-auto">
          <div className="absolute right-4 top-4 z-10 flex gap-3">
            <button onClick={handleShare} aria-label="Share" className={glowButton}>
              <FaShareNodes size={16} />
            </button>
            <button onClick={onClose} aria-label="Close" className={glowButton}>
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        <div className="relative h-72 w-full shrink-0 overflow-hidden bg-surface-alt sm:aspect-square sm:h-auto sm:w-[45%] sm:self-start">
          {/* blurred copy of the photo fills the panel so the sharp, uncropped image below never leaves bare bars */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={product.name} className="absolute inset-x-0 top-0 h-[calc(100%-3.5rem)] w-full object-contain p-2" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
          <h2 className="absolute inset-x-0 bottom-0 p-5 font-poppins text-2xl font-bold uppercase leading-tight text-white sm:p-6 sm:text-3xl">
            {product.name}
          </h2>
        </div>

        <div className="flex flex-none flex-col sm:flex-1 sm:overflow-y-auto">
          <div className="p-6 sm:p-8">
            <p className="pr-28 font-poppins text-3xl font-bold text-ink sm:text-4xl">
              {product.discountPrice != null && <span className="mr-2 text-xl font-normal text-muted line-through">{formatPaisa(product.basePrice)}</span>}
              {formatPaisa(basePrice)}
            </p>
            {product.description && <p className="mt-3 text-[15px] leading-relaxed text-muted">{product.description}</p>}
            <div className="mt-4 border-t border-line" />

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

            <div className="mt-6">
              <h3 className="font-poppins text-[15px] font-semibold text-ink">Special Instructions</h3>
              <div className="relative mt-3">
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value.slice(0, 500))}
                  placeholder="Please enter instructions about this item"
                  className="h-28 w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted placeholder:opacity-70 focus:border-brand-red focus:outline-none sm:h-32"
                />
                <span className="pointer-events-none absolute bottom-3 right-4 text-xs font-medium text-muted">
                  {specialInstructions.length}/500
                </span>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 mt-auto flex items-center gap-4 bg-surface p-4 sm:px-8 sm:py-5">
            <div className="flex items-center gap-3 rounded-full border border-brand-red/25 bg-brand-red/10 p-1">
              {quantity > 1 ? (
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-brand-red"
                >
                  <MinusIcon size={14} />
                </button>
              ) : (
                <button
                  onClick={onClose}
                  aria-label="Discard item"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-red/15 text-brand-red"
                >
                  <TrashIcon size={14} />
                </button>
              )}
              <span className="w-6 text-center text-sm font-semibold text-ink">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-red text-white"
              >
                <PlusIcon size={14} />
              </button>
            </div>
            <button
              onClick={handleAdd}
              disabled={!isValid}
              className="relative flex flex-1 items-center justify-center gap-4 overflow-hidden rounded-2xl bg-brand-red px-5 py-4 font-poppins text-[15px] font-bold leading-[16px] text-white shadow-[0_6px_20px_rgba(237,35,32,0.4)] disabled:opacity-50"
            >
              {isValid && (
                <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full animate-cart-shine bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              )}
              <span>{formatPaisa(unitPrice * quantity)}</span>
              <span aria-hidden="true" className="h-4 w-px bg-white/70" />
              <span className="flex items-center gap-2">
                Add to Cart <ArrowRightIcon size={14} className="animate-ride" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
