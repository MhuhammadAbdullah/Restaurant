"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { PRODUCT_IMAGE_PLACEHOLDER } from "./constants";

type FallbackInfo = { logoUrl: string | null; footerLogoUrl: string | null; productImageFallbackSource: "HEADER" | "FOOTER" | null };

/** A product's own uploaded photo always wins — the admin-selected logo (or the last-resort generic placeholder) only stands in when no image has been uploaded for that product yet. */
export function resolveProductImage(product: { images: { url: string; isPrimary: boolean }[] }, fallback: string): string {
  return product.images.find((i) => i.isPrimary)?.url ?? product.images[0]?.url ?? fallback;
}

/** Resolves which image (Header logo / Footer logo / generic placeholder) to use when a product has no photo of its own — shares the "cms-restaurant" query cache with Header/Footer, so this adds no extra network requests. */
export function useFallbackProductImage(): string {
  const { data } = useQuery({
    queryKey: ["cms-restaurant"],
    queryFn: () => api.public.get<FallbackInfo>("/cms/restaurant"),
    staleTime: 0,
  });
  if (data?.productImageFallbackSource === "HEADER" && data.logoUrl) return data.logoUrl;
  if (data?.productImageFallbackSource === "FOOTER" && data.footerLogoUrl) return data.footerLogoUrl;
  return PRODUCT_IMAGE_PLACEHOLDER;
}
