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

export function PopularProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const fallback = useFallbackProductImage();
  const image = resolveProductImage(product, fallback);
  const price = effectivePrice(product.basePrice, product.discountPrice);

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
    <div className="group relative z-0 flex aspect-square flex-col justify-end overflow-hidden rounded-2xl border border-line shadow-sm transition duration-200 ease-out hover:z-10 hover:shadow-lg">
      <button onClick={onClick} className="absolute inset-0" aria-label={product.name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
        />
      </button>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      <div className="relative p-3 pr-14">
        <button onClick={onClick} className="block w-full text-left">
          <p className="truncate font-poppins text-[14px] font-bold leading-[16px] text-white sm:text-[16px] sm:leading-[18px] lg:text-[20px] lg:leading-[21px]">
            {product.name}
          </p>
          {product.description && (
            <p className="truncate font-poppins text-[10px] font-medium leading-[14px] text-white/70 sm:text-[11px] sm:leading-[16px] lg:text-[12px] lg:leading-[20px]">
              {product.description}
            </p>
          )}
        </button>
        <p className="mt-1.5 font-poppins text-[13px] font-bold leading-[14px] text-white sm:text-[15px] sm:leading-[16px] lg:text-[18px] lg:leading-[18px]">
          {product.discountPrice != null && <span className="mr-1 text-xs font-normal text-white/60 line-through">{formatPaisa(product.basePrice)}</span>}
          {formatPaisa(price)}
        </p>
      </div>

      <div className="absolute bottom-3 right-3">
        {quantity > 0 && simpleLine ? (
          <QtyStepper
            quantity={quantity}
            itemName={product.name}
            onIncrement={() => updateQuantity(simpleLine.cartItemId, quantity + 1)}
            onDecrement={() => updateQuantity(simpleLine.cartItemId, quantity - 1)}
            onRemove={() => removeItem(simpleLine.cartItemId)}
          />
        ) : (
          <button
            onClick={handleAdd}
            disabled={checking}
            aria-label="Add to cart"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-red text-white shadow-lg transition hover:opacity-90 disabled:opacity-60 sm:h-8 sm:w-8 lg:h-9 lg:w-9"
          >
            <PlusIcon size={14} className="sm:hidden" />
            <PlusIcon size={16} className="hidden sm:block lg:hidden" />
            <PlusIcon size={18} className="hidden lg:block" />
          </button>
        )}
      </div>
    </div>
  );
}
