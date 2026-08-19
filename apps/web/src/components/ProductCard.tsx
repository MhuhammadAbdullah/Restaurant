"use client";

import { useState } from "react";
import { formatPaisa, effectivePrice } from "@restaurant/utils";
import type { CartProductItem, Product } from "../lib/types";
import { api } from "../lib/api";
import { useCartStore, makeCartItemId } from "../store/useCartStore";
import { QtyStepper } from "./QtyStepper";
import { resolveProductImage, useFallbackProductImage } from "../lib/image";
import { toast } from "../store/useToastStore";

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
    <div className="relative z-0 flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition duration-200 ease-out hover:z-10 hover:scale-[1.03] hover:shadow-lg">
      <button onClick={onClick} className="p-2 text-left">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={product.name} className="aspect-square w-full rounded-lg object-cover" />
        )}
      </button>
      <div className="flex flex-1 flex-col p-3">
        <button onClick={onClick} className="text-left">
          <p className="text-base font-medium text-ink">{product.name}</p>
          {product.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{product.description}</p>}
        </button>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-base font-semibold text-brand-red">
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
              className="rounded-lg bg-brand-red px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {checking ? "..." : "ADD"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
