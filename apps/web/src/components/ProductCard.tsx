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

export function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
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
    <div className={`group relative z-0 flex flex-col rounded-2xl border bg-surface transition duration-200 ease-out hover:z-10 hover:shadow-lg ${soldOut ? "border-line" : "border-brand-red"}`}>
      <ProductTagBadge tag={product.tag} />
      <button onClick={open} className="p-1.5 text-left">
        {image && (
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={product.name}
              className={`h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 ${soldOut ? "opacity-40 grayscale" : ""}`}
            />
            {soldOut && <SoldOutStamp />}
          </div>
        )}
      </button>
      <div className={`flex flex-1 flex-col px-2.5 pb-2.5 pt-1 sm:px-3 sm:pb-3 sm:pt-1.5 ${soldOut ? "opacity-60" : ""}`}>
        <button onClick={open} className="text-left">
          <p className="font-poppins text-[12px] font-bold uppercase leading-[15px] text-ink sm:text-[14px] sm:leading-[17px] lg:text-[16px] lg:leading-[19px]">
            {product.name}
          </p>
          {product.description && (
            <p className="mt-1 line-clamp-2 font-poppins text-[9px] font-medium leading-[12px] text-muted sm:text-[10px] sm:leading-[14px] lg:text-[11px] lg:leading-[16px]">
              {product.description}
            </p>
          )}
        </button>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <span className="font-poppins text-[12px] font-bold leading-[14px] uppercase text-ink sm:text-[13px] sm:leading-[15px] lg:text-[15px] lg:leading-[16px]">
            {product.discountPrice != null && <span className="mr-1 text-xs font-normal text-muted line-through">{formatPaisa(product.basePrice)}</span>}
            {formatPaisa(price)}
          </span>
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
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-red text-white transition hover:opacity-90 disabled:opacity-60 sm:h-7 sm:w-7 sm:rounded-lg lg:h-8 lg:w-8"
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
