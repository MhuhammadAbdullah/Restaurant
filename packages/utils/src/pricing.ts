/**
 * Single source of truth for "regular vs discount" price resolution — used by
 * Product/Deal/ChoiceOption/Addon pricing everywhere (backend pricing services,
 * admin forms, customer-facing popups). Never duplicate this `?? `/percent math inline.
 */

export function effectivePrice(regularPaisa: number, discountPaisa?: number | null): number {
  if (discountPaisa == null) return regularPaisa;
  if (discountPaisa <= 0 || discountPaisa >= regularPaisa) return regularPaisa;
  return discountPaisa;
}

export function discountPercent(regularPaisa: number, discountPaisa?: number | null): number {
  if (regularPaisa <= 0) return 0;
  const effective = effectivePrice(regularPaisa, discountPaisa);
  if (effective >= regularPaisa) return 0;
  return Math.round(((regularPaisa - effective) / regularPaisa) * 100);
}
