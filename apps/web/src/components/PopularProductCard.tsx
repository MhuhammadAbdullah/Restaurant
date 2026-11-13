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
      // Lists load each product with its choices and add-ons, so the extra request is only a fallback.
      const detail = product.choiceGroups ? product : await api.public.get<Product>(`/catalog/products/${product.id}`);
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
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-surface-alt">
        <button onClick={open} aria-label={product.name} className="absolute inset-0 block h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={product.name}
            className={`h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 ${soldOut ? "opacity-40 grayscale" : ""}`}
          />
          {soldOut && <SoldOutStamp />}
        </button>
        <div className="absolute bottom-3 right-3 z-10">
          {soldOut ? (
            <span className="flex h-8 items-center rounded-full bg-surface px-3 text-[10px] font-semibold uppercase tracking-wide text-muted shadow sm:h-9 sm:text-[11px]">Sold out</span>
          ) : quantity > 0 && simpleLine ? (
            <QtyStepper
              quantity={quantity}
              itemName={product.name}
              onIncrement={() => updateQuantity(simpleLine.cartItemId, quantity + 1)}
              onDecrement={() => updateQuantity(simpleLine.cartItemId, quantity - 1)}
              onRemove={() => removeItem(simpleLine.cartItemId)}
              compact
              tone="neutral"
              className="h-7 !gap-1 !px-0.5 sm:h-9 sm:!gap-2 sm:!px-1"
            />
          ) : (
            <button
              onClick={handleAdd}
              disabled={checking}
              aria-label="Add to cart"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-red text-white shadow-lg transition hover:opacity-90 disabled:opacity-60 sm:h-11 sm:w-11"
            >
              <PlusIcon size={15} className="sm:!h-[18px] sm:!w-[18px]" />
            </button>
          )}
        </div>
      </div>

      <div className={`mt-3 space-y-1 px-1 ${soldOut ? "opacity-60" : ""}`}>
        <button onClick={open} className="block w-full text-left">
          <p className="truncate font-poppins text-[15px] font-bold leading-5 text-ink sm:text-base">{product.name}</p>
        </button>
        <p className="w-fit rounded-lg bg-surface-alt px-2 py-1 font-poppins text-xs font-semibold leading-4 text-muted sm:text-sm">
          {product.discountPrice != null && <span className="mr-1.5 font-normal line-through opacity-70">{formatPaisa(product.basePrice)}</span>}
          {formatPaisa(price)}
        </p>
      </div>
    </div>
  );
}
