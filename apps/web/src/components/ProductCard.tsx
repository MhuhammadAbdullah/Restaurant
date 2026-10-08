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

export function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
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
    <div className="group relative z-0 flex flex-col rounded-2xl border border-brand-red bg-surface transition duration-200 ease-out hover:z-10 hover:shadow-lg">
      <ProductTagBadge tag={product.tag} />
      <button onClick={onClick} className="p-2 text-left">
        {image && (
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            />
          </div>
        )}
      </button>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-2">
        <button onClick={onClick} className="text-left">
          <p className="font-poppins text-[14px] font-bold uppercase leading-[16px] text-ink sm:text-[16px] sm:leading-[18px] lg:text-[20px] lg:leading-[21px]">
            {product.name}
          </p>
          {product.description && (
            <p className="mt-2.5 line-clamp-2 font-poppins text-[10px] font-medium leading-[14px] text-muted sm:text-[11px] sm:leading-[16px] lg:text-[12px] lg:leading-[20px]">
              {product.description}
            </p>
          )}
        </button>
        <div className="mt-auto flex items-end justify-between pt-4">
          <span className="font-poppins text-[13px] font-bold leading-[14px] uppercase text-ink sm:text-[15px] sm:leading-[16px] lg:text-[18px] lg:leading-[18px]">
            {product.discountPrice != null && <span className="mr-1 text-xs font-normal text-muted line-through">{formatPaisa(product.basePrice)}</span>}
            {formatPaisa(price)}
          </span>
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
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-red text-white sm:h-9 sm:w-9 sm:rounded-xl transition hover:opacity-90 disabled:opacity-60 lg:h-11 lg:w-11"
            >
              <PlusIcon size={14} className="sm:hidden" />
              <PlusIcon size={18} className="hidden sm:block lg:hidden" />
              <PlusIcon size={22} className="hidden lg:block" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
