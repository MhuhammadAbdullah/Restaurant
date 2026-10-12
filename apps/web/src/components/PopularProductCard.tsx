"use client";

import { useState } from "react";
import { formatPaisa, effectivePrice } from "@restaurant/utils";
import type { CartProductItem, Product } from "../lib/types";
import { api } from "../lib/api";
import { useCartStore, makeCartItemId } from "../store/useCartStore";
import { QtyStepper } from "./QtyStepper";
import { PlusIcon } from "./icons";
import { resolveProductImage, useFallbackProductImage } from "../lib/image";
import { toast } from "../store/useToastStore";
import { ProductTagBadge } from "./ProductTagBadge";
import { SoldOutStamp } from "./SoldOutStamp";
import { useLocationStore } from "../store/useLocationStore";
import { isSoldOutAt, soldOutToast } from "../lib/outOfStock";

export function PopularProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const fallback = useFallbackProductImage();
  const image = resolveProductImage(product, fallback);
  const price = effectivePrice(product.basePrice, product.discountPrice);
  const branchId = useLocationStore((s) => s.branch?.id);
  const soldOut = isSoldOutAt(product.branchAvailability, branchId);
  const open = () => (soldOut ? soldOutToast(product.name) : onClick());

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const [checking, setChecking] = useState(false);

  const simpleLine = items.find(
    (i): i is CartProductItem => i.kind === "product" && i.productId === product.id && i.choices.length === 0 && i.addons.length === 0,
  );
  const quantity = simpleLine?.quantity ?? 0;

  async function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (checking) return;
    setChecking(true);
    try {
      const detail = await api.public.get<Product>(`/catalog/products/${product.id}`);
      const needsConfig = (detail.choiceGroups?.length ?? 0) > 0 || (detail.addons?.length ?? 0) > 0;
      if (needsConfig) {
        onClick();
        return;
      }
      addItem({
        cartItemId: makeCartItemId(),
        kind: "product",
        productId: product.id,
        name: product.name,
        image,
        quantity: 1,
        unitPrice: price,
        choices: [],
        addons: [],
      });
      toast.cart(`${product.name} added to cart`);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="group relative z-0 flex flex-col">
      <ProductTagBadge tag={product.tag} />
      <button
        onClick={open}
        aria-label={product.name}
        className="relative block aspect-square w-full overflow-hidden rounded-3xl bg-surface-alt"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={product.name}
          className={`h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 ${soldOut ? "opacity-40 grayscale" : ""}`}
        />
        {soldOut && <SoldOutStamp />}
      </button>

      <div className="relative mt-3 flex items-end justify-between gap-2 px-1">
        <div className={`min-w-0 flex-1 ${soldOut ? "opacity-60" : ""}`}>
          <button onClick={open} className="block w-full text-left">
            <p className="truncate font-poppins text-[12px] font-bold uppercase leading-[16px] text-ink sm:text-[14px] lg:text-[16px]">
              {product.name}
            </p>
          </button>
          <p className="mt-1 font-poppins text-[11px] font-semibold uppercase leading-[14px] text-muted sm:text-[12px] lg:text-[14px]">
            {product.discountPrice != null && <span className="mr-1.5 text-[10px] font-normal line-through opacity-70">{formatPaisa(product.basePrice)}</span>}
            {formatPaisa(price)}
          </p>
        </div>

        <div className="shrink-0">
          {soldOut ? (
            <span className="flex h-6 shrink-0 items-center rounded-md bg-surface-alt px-2 text-[10px] font-semibold uppercase tracking-wide text-muted sm:h-7 sm:text-[11px]">Sold out</span>
          ) : quantity > 0 && simpleLine ? (
            <QtyStepper
              quantity={quantity}
              itemName={product.name}
              onIncrement={() => updateQuantity(simpleLine.cartItemId, quantity + 1)}
              onDecrement={() => updateQuantity(simpleLine.cartItemId, quantity - 1)}
              onRemove={() => removeItem(simpleLine.cartItemId)}
              compact
              className="!py-0 h-6 sm:h-7 lg:h-8"
            />
          ) : (
            <button
              onClick={handleAdd}
              disabled={checking}
              aria-label="Add to cart"
              className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-red text-white transition hover:opacity-90 disabled:opacity-60 sm:h-7 sm:w-7 sm:rounded-lg lg:h-8 lg:w-8"
            >
              <PlusIcon size={10} className="sm:hidden" />
              <PlusIcon size={12} className="hidden sm:block lg:hidden" />
              <PlusIcon size={14} className="hidden lg:block" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
