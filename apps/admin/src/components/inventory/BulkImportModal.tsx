"use client";

import { LoadingDots } from "../LoadingDots";
import { useMemo, useState } from "react";
import { INVENTORY_UNITS, type InventoryUnit } from "@restaurant/validation";
import { api, ApiError } from "../../lib/api";
import { toast } from "../../store/useToastStore";
import { INPUT, Modal } from "./shared";

type Row = { name: string; unit: InventoryUnit | null; minLevel: number; costPerUnit: number; quantity: number; error: string };

const UNIT_ALIASES: Record<string, InventoryUnit> = {
  mg: "MG", milligram: "MG", milligrams: "MG",
  lb: "LB", lbs: "LB", pound: "LB", pounds: "LB",
  oz: "OZ", ounce: "OZ", ounces: "OZ",
  cl: "CL", centilitre: "CL", centiliter: "CL",
  tsp: "TSP", teaspoon: "TSP", tbsp: "TBSP", tablespoon: "TBSP", cup: "CUP", cups: "CUP",
  floz: "FLOZ", gal: "GALLON", gallon: "GALLON", gallons: "GALLON",
  pair: "PAIR", pairs: "PAIR",
  pack: "PACK", packs: "PACK", packet: "PACK", packets: "PACK", pkt: "PACK",
  box: "BOX", boxes: "BOX", bottle: "BOTTLE", bottles: "BOTTLE", btl: "BOTTLE", can: "CAN", cans: "CAN", tin: "CAN", tins: "CAN",
  bag: "BAG", bags: "BAG", carton: "CARTON", cartons: "CARTON", tray: "TRAY", trays: "TRAY", jar: "JAR", jars: "JAR",
  sachet: "SACHET", sachets: "SACHET", roll: "ROLL", rolls: "ROLL", bunch: "BUNCH", bunches: "BUNCH", slice: "SLICE", slices: "SLICE",
  kg: "KG", kgs: "KG", kilo: "KG", kilogram: "KG",
  g: "G", gm: "G", gram: "G", grams: "G",
  l: "LITER", lt: "LITER", ltr: "LITER", liter: "LITER", litre: "LITER", liters: "LITER", litres: "LITER",
  ml: "ML", millilitre: "ML", milliliter: "ML",
  pc: "PIECE", pcs: "PIECE", piece: "PIECE", pieces: "PIECE", nos: "PIECE", no: "PIECE",
  dozen: "DOZEN", doz: "DOZEN",
};

const EXAMPLE = `Chicken, kg, 5, 650, 20
Cooking oil, litre, 2, 480, 15
Burger bun, pcs, 50, 25, 200
Cheese slices, pcs, 40, 18, 120`;

function parse(text: string): Row[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|,/).map((p) => p.trim());
      const [name = "", unitText = "", min = "", cost = "", qty = ""] = parts;
      const unit = UNIT_ALIASES[unitText.toLowerCase().replace(/\./g, "")] ?? null;
      const num = (v: string) => (v === "" ? 0 : Number(v.replace(/[^\d.\-]/g, "")));
      const row: Row = { name, unit, minLevel: num(min), costPerUnit: num(cost), quantity: num(qty), error: "" };
      if (!name) row.error = "Name is missing";
      else if (!unit) row.error = `Unit "${unitText}" is not known (try kg, g, lb, oz, litre, ml, pcs, dozen, box, bottle, pack...)`;
      else if ([row.minLevel, row.costPerUnit, row.quantity].some((n) => Number.isNaN(n) || n < 0)) row.error = "A number is not valid";
      return row;
    });
}

/** Add many ingredients at once by pasting a list (from a notebook or a spreadsheet). */
export function BulkImportModal({ branchId, branchName, onClose, onDone }: { branchId: string; branchName: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const rows = useMemo(() => parse(text), [text]);
  const good = rows.filter((r) => !r.error);

  async function save() {
    setSaving(true);
    try {
      const res = await api.post<{ created: number; skipped: string[] }>("/inventory/items/bulk", {
        branchId,
        rows: good.map((r) => ({ name: r.name, unit: r.unit, minLevel: r.minLevel, costPerUnit: r.costPerUnit, quantity: r.quantity })),
      });
      toast.success(`${res.created} item${res.created === 1 ? "" : "s"} added${res.skipped.length ? `, ${res.skipped.length} already existed` : ""}.`);
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add the items");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add many items" onClose={onClose} wide busy={saving}>
      <p className="-mt-2 text-sm text-neutral-500">
        One item per line: <b className="text-neutral-700">name, unit, alert level, cost per unit (Rs.), stock now</b>. Only the name and unit are needed (kg, g, mg, lb, oz, L, ml, pcs, dozen, box, bottle, pack...). The stock you type is added to <b className="text-neutral-700">{branchName}</b>.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className={`${INPUT} mt-3 font-mono`} placeholder={EXAMPLE} autoFocus />
      <button type="button" onClick={() => setText(EXAMPLE)} className="mt-1 text-xs font-medium text-brand-red hover:underline">Fill an example</button>

      {rows.length > 0 && (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-neutral-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500">
              <tr><th className="px-3 py-2 font-medium">Item</th><th className="px-3 py-2 font-medium">Unit</th><th className="px-3 py-2 font-medium">Alert</th><th className="px-3 py-2 font-medium">Cost</th><th className="px-3 py-2 font-medium">Stock</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r, i) => (
                <tr key={i} className={r.error ? "bg-red-50" : ""}>
                  <td className="px-3 py-1.5 font-medium text-neutral-800">{r.name || "-"}</td>
                  {r.error ? (
                    <td colSpan={4} className="px-3 py-1.5 text-red-600">{r.error}</td>
                  ) : (
                    <>
                      <td className="px-3 py-1.5">{r.unit ? INVENTORY_UNITS[r.unit].label : ""}</td>
                      <td className="px-3 py-1.5">{r.minLevel || "-"}</td>
                      <td className="px-3 py-1.5">{r.costPerUnit || "-"}</td>
                      <td className="px-3 py-1.5">{r.quantity || "-"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">{rows.length === 0 ? "" : `${good.length} ready${rows.length - good.length ? `, ${rows.length - good.length} need fixing` : ""}. Names that already exist are skipped.`}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving || good.length === 0} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? <LoadingDots>Adding</LoadingDots> : `Add ${good.length || ""} item${good.length === 1 ? "" : "s"}`}</button>
        </div>
      </div>
    </Modal>
  );
}
