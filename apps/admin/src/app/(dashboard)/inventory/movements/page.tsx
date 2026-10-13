"use client";

import { LoadingDots } from "../../../../components/LoadingDots";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { type InventoryUnit } from "@restaurant/validation";
import { api } from "../../../../lib/api";
import { Th, ThFilter } from "../../../../components/inventory/ThFilter";
import { BranchSelect, INPUT, TYPE_LABEL, dateTime, showQty, useInventoryBranch, type StockRow } from "../../../../components/inventory/shared";
import { Pagination } from "../../../../components/Pagination";

type Movement = {
  id: string;
  createdAt: string;
  branchName: string;
  itemName: string;
  unit: InventoryUnit;
  type: string;
  quantity: number;
  balanceAfter: number;
  unitCost: number | null;
  note: string;
  referenceType: string;
  staffName: string;
};
type Page = { total: number; page: number; pageSize: number; pageCount: number; items: Movement[] };

export default function MovementsPage() {
  const { branchId, setBranchId, branches } = useInventoryBranch();
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data: items } = useQuery({ queryKey: ["inventory-items-all"], queryFn: () => api.get<StockRow[]>("/inventory/stock?includeInactive=true") });
  const params = new URLSearchParams({ branchId, page: String(page), pageSize: "25" });
  if (itemId) params.set("itemId", itemId);
  if (type) params.set("type", type);
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
  const { data, isLoading } = useQuery({ queryKey: ["inventory-movements", params.toString()], queryFn: () => api.get<Page>(`/inventory/movements?${params.toString()}`), enabled: !!branchId });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <BranchSelect value={branchId} onChange={(b) => { setBranchId(b); setPage(1); }} branches={branches} />
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={`${INPUT} !w-auto`} aria-label="From date" />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={`${INPUT} !w-auto`} aria-label="To date" />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <Th>When</Th>
              <ThFilter label="Item" value={itemId} onChange={(v) => { setItemId(v); setPage(1); }} options={(items ?? []).map((i) => ({ value: i.id, label: i.name }))} />
              <ThFilter label="Change" value={type} onChange={(v) => { setType(v); setPage(1); }} options={Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v.label }))} />
              <Th>Quantity</Th>
              <Th>Balance</Th>
              <Th>By / note</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              <tr><td colSpan={6} className="p-6 text-center text-neutral-400"><LoadingDots>Loading</LoadingDots></td></tr>
            ) : (data?.items ?? []).length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-neutral-500">No stock changes found.</td></tr>
            ) : (
              data!.items.map((m) => {
                const t = TYPE_LABEL[m.type] ?? { label: m.type, tone: "bg-neutral-100 text-neutral-600" };
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-500">{dateTime(m.createdAt)}</td>
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{m.itemName}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${t.tone}`}>{t.label}</span></td>
                    <td className={`whitespace-nowrap px-4 py-2.5 font-semibold ${m.quantity >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {m.quantity >= 0 ? "+" : "-"}
                      {showQty(Math.abs(m.quantity), m.unit)}
                      {m.unitCost ? <span className="ml-1 text-[11px] font-normal text-neutral-400">@ {formatPaisa(m.unitCost)}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-neutral-600">{showQty(m.balanceAfter, m.unit)}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500">{[m.staffName, m.note].filter(Boolean).join(" · ") || "-"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {data && data.pageCount > 1 && (
        <div className="mt-3">
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPage={setPage} onPageSize={() => undefined} itemLabel="changes" sizes={[25]} />
        </div>
      )}
    </div>
  );
}
