"use client";

import { LoadingDots } from "../../../../components/LoadingDots";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { type InventoryUnit } from "@restaurant/validation";
import { api } from "../../../../lib/api";
import { BranchSelect, INPUT, showQty, useInventoryBranch } from "../../../../components/inventory/shared";

type Row = { itemId: string; name: string; unit: InventoryUnit; quantity: number; cost: number };
type Valuation = { itemId: string; name: string; unit: InventoryUnit; quantity: number; value: number };
type Report = {
  consumption: Row[];
  waste: Row[];
  purchases: Row[];
  totals: { consumptionCost: number; wasteCost: number; purchaseCost: number; stockValue: number };
  valuation: Valuation[];
};

const day = (d: Date) => d.toISOString().slice(0, 10);

function Table({ title, hint, rows, empty }: { title: string; hint: string; rows: Row[]; empty: string }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      <p className="text-xs text-neutral-500">{hint}</p>
      <div className="mt-3 divide-y divide-neutral-100">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-400">{empty}</p>
        ) : (
          rows.slice(0, 12).map((r) => (
            <div key={r.itemId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate text-neutral-800">{r.name}</span>
              <span className="shrink-0 text-neutral-500">{showQty(r.quantity, r.unit)}</span>
              <span className="w-24 shrink-0 text-right font-medium text-neutral-900">{r.cost > 0 ? formatPaisa(r.cost) : "-"}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const { branchId, setBranchId, branches } = useInventoryBranch();
  const [from, setFrom] = useState(day(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(day(new Date()));
  const [allBranches, setAllBranches] = useState(false);

  const params = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() });
  if (!allBranches && branchId) params.set("branchId", branchId);
  const { data, isLoading } = useQuery({ queryKey: ["inventory-report", params.toString()], queryFn: () => api.get<Report>(`/inventory/reports?${params.toString()}`), enabled: !!branchId });

  const cards = data
    ? [
        { label: "Stock value now", value: formatPaisa(data.totals.stockValue), tone: "text-neutral-900" },
        { label: "Taken out", value: formatPaisa(data.totals.consumptionCost), tone: "text-neutral-900" },
        { label: "Bought", value: formatPaisa(data.totals.purchaseCost), tone: "text-green-700" },
        { label: "Wasted", value: formatPaisa(data.totals.wasteCost), tone: data.totals.wasteCost > 0 ? "text-red-600" : "text-neutral-900" },
      ]
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {!allBranches && <BranchSelect value={branchId} onChange={setBranchId} branches={branches} />}
        {branches.length > 1 && (
          <label className="flex items-center gap-1.5 text-xs text-neutral-500">
            <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} className="accent-[#ED2320]" /> All my branches
          </label>
        )}
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${INPUT} !w-auto`} aria-label="From date" />
        <span className="text-sm text-neutral-400">to</span>
        <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${INPUT} !w-auto`} aria-label="To date" />
      </div>

      {isLoading || !data ? (
        <p className="mt-6 text-sm text-neutral-400"><LoadingDots>Loading</LoadingDots></p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-neutral-500">{c.label}</p>
                <p className={`mt-1 text-xl font-semibold ${c.tone}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-400">Costs use the cost you set on each item. Items without a cost show a dash.</p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Table title="Taken out" hint="What staff recorded as Stock out in this period (waste is shown separately)." rows={data.consumption} empty="No stock taken out." />
            <Table title="Waste" hint="Spoiled, spilled or expired stock." rows={data.waste} empty="No waste recorded." />
            <Table title="Purchases" hint="Goods received from suppliers." rows={data.purchases} empty="Nothing received." />
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-neutral-900">Stock value</p>
              <p className="text-xs text-neutral-500">What is on the shelf now, biggest first.</p>
              <div className="mt-3 divide-y divide-neutral-100">
                {data.valuation.length === 0 ? (
                  <p className="py-4 text-center text-sm text-neutral-400">No stock yet.</p>
                ) : (
                  data.valuation.slice(0, 12).map((r) => (
                    <div key={r.itemId} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-neutral-800">{r.name}</span>
                      <span className="shrink-0 text-neutral-500">{showQty(r.quantity, r.unit)}</span>
                      <span className="w-24 shrink-0 text-right font-medium text-neutral-900">{r.value > 0 ? formatPaisa(r.value) : "-"}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
