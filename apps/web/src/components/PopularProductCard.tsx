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
    <div className="group relative z-0 flex flex-col">
      <ProductTagBadge tag={product.tag} />
      <button
        onClick={onClick}
        aria-label={product.name}
        className="relative block aspect-square w-full overflow-hidden rounded-3xl bg-surface-alt"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
      </button>

      <div className="relative mt-3 flex items-end justify-between gap-2 px-1">
        <div className="min-w-0 flex-1">
          <button onClick={onClick} className="block w-full text-left">
            <p className="truncate font-poppins text-[14px] font-bold uppercase leading-[18px] text-ink sm:text-[16px] lg:text-[18px]">
              {product.name}
            </p>
          </button>
          <p className="mt-1.5 font-poppins text-[12px] font-semibold uppercase leading-[16px] text-muted sm:text-[13px] lg:text-[15px]">
            {product.discountPrice != null && <span className="mr-1.5 text-[11px] font-normal line-through opacity-70">{formatPaisa(product.basePrice)}</span>}
            {formatPaisa(price)}
          </p>
        </div>

        <div className="shrink-0">
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
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-red text-white transition hover:opacity-90 disabled:opacity-60 sm:h-9 sm:w-9 lg:h-11 lg:w-11"
            >
              <PlusIcon size={16} className="sm:hidden" />
              <PlusIcon size={18} className="hidden sm:block lg:hidden" />
              <PlusIcon size={22} className="hidden lg:block" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
