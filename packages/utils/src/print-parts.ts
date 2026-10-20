/**
 * Which slips of an order can be printed, and how a choice of slips travels in the address of the print page.
 *
 *  customer  the customer receipt (the final sale bill, with payment and change)
 *  pre       the bill shown to the guest before they pay
 *  kitchen   the kitchen slip for what the kitchen has not been sent yet
 *  full      the whole order again for the kitchen
 *  rev:<id>  only the items added at one point (an "additional items" slip)
 *
 * Any mix can be printed in one go; each one is its own slip.
 */
export type PrintSlip = { key: string; kind: "customer" | "pre" | "kitchen" | "kitchen-full" | "kitchen-extra"; revisionId?: string };

export type PrintOption = { key: string; label: string; hint: string };

export type PrintableOrder = {
  type: string;
  status: string;
  paymentStatus: string;
  revisions?: { id: string; createdAt: string | Date }[];
};

const FINISHED = new Set(["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"]);
const clock = (d: string | Date) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The slips that make sense for this order right now, in the order they print. */
export function printOptionsFor(order: PrintableOrder): PrintOption[] {
  const options: PrintOption[] = [{ key: "customer", label: "Customer receipt", hint: "The sale bill: items, prices, payment and change" }];
  // The bill before payment only makes sense while the order is still unpaid and open.
  if (order.paymentStatus !== "PAID" && !FINISHED.has(order.status)) {
    options.push({ key: "pre", label: "Pre-payment bill", hint: "Shown to the guest before they pay" });
  }
  options.push({ key: "kitchen", label: "Kitchen receipt", hint: "Items the kitchen has not been sent yet, with notes" });
  const revisions = order.revisions ?? [];
  if (revisions.length > 0) {
    options.push({ key: "full", label: "Full kitchen order", hint: "Every item again, from the start" });
    // the latest few additions, newest first
    for (const r of [...revisions].reverse().slice(0, 4)) {
      options.push({ key: `rev:${r.id}`, label: `Items added at ${clock(r.createdAt)}`, hint: "Kitchen slip with only those items" });
    }
  }
  return options;
}

const BASE_ORDER = ["customer", "pre", "kitchen", "full"];

/** Reads the \`parts\` of the print page address: a comma separated list; "both" means customer + kitchen. Unknown names are ignored. */
export function parsePrintParts(param: string | null | undefined): PrintSlip[] {
  const raw = (param ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const wanted = new Set<string>();
  for (const p of raw.length === 0 ? ["both"] : raw) {
    if (p === "both") {
      wanted.add("customer");
      wanted.add("kitchen");
    } else if (BASE_ORDER.includes(p) || (p.startsWith("rev:") && p.length > 4)) wanted.add(p);
  }
  const keys = [...BASE_ORDER.filter((k) => wanted.has(k)), ...[...wanted].filter((k) => k.startsWith("rev:"))];
  return keys.map((key): PrintSlip => {
    if (key === "customer") return { key, kind: "customer" };
    if (key === "pre") return { key, kind: "pre" };
    if (key === "kitchen") return { key, kind: "kitchen" };
    if (key === "full") return { key, kind: "kitchen-full" };
    return { key, kind: "kitchen-extra", revisionId: key.slice(4) };
  });
}

/** The \`parts\` value for a chosen set of slips. */
export function printPartsParam(keys: string[]): string {
  return keys.map((k) => encodeURIComponent(k)).join(",");
}
