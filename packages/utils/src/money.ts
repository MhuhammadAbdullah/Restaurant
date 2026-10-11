/**
 * All money is stored/computed as an integer number of paisa (1 PKR = 100 paisa).
 * Never use floats for money math — rounding errors compound across discounts/tax/deal pricing.
 */

export function rupeesToPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paisaToRupees(paisa: number): number {
  return paisa / 100;
}

export function formatPaisa(paisa: number, currency = "Rs."): string {
  return `${currency} ${paisaToRupees(paisa).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Bills are settled in whole rupees: the total after tax/discounts is rounded to the nearest rupee
 * (1945.64 -> 1946, 1267.23 -> 1267). Half a rupee rounds up.
 */
export function roundToRupee(paisa: number): number {
  return Math.round(paisa / 100) * 100;
}

export function applyTax(amountPaisa: number, taxPct: number): number {
  return Math.round(amountPaisa * (taxPct / 100));
}

export function sumPaisa(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
