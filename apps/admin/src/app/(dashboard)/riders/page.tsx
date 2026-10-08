"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api } from "../../../lib/api";
import { useSelectedBranch } from "../../../lib/useSelectedBranch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

type Rider = {
  id: string;
  name: string;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
  branches: { id: string; name: string }[];
  assignedOrders: number;
  completedOrders: number;
  unsettledAmount: number;
};

export default function RidersPage() {
  const router = useRouter();
  const { branchId } = useSelectedBranch();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "INACTIVE">("");

  const { data: riders } = useQuery({
    queryKey: ["riders", branchId, search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (branchId) params.set("branchId", branchId);
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      const qs = params.toString();
      return api.get<Rider[]>(`/staff/riders${qs ? `?${qs}` : ""}`);
    },
  });

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Riders</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Riders are staff accounts with the "Rider" role. Add or deactivate one from <span className="font-medium">Staff &amp; Roles</span>.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input placeholder="Search name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : (v as "ACTIVE" | "INACTIVE"))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="mt-1.5 text-xs text-neutral-400">Use the branch picker above to filter by branch.</p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Branch</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Assigned Orders</th>
              <th className="px-4 py-2.5 font-medium">Completed Orders</th>
              <th className="px-4 py-2.5 font-medium">Cash to Settle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {riders?.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/riders/${r.id}`)} className="cursor-pointer hover:bg-neutral-50">
                <td className="px-4 py-2.5 font-medium text-brand-red">{r.name}</td>
                <td className="px-4 py-2.5 text-neutral-600">{r.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-neutral-600">{r.branches.map((b) => b.name).join(", ") || "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {r.status === "ACTIVE" ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-neutral-600">{r.assignedOrders}</td>
                <td className="px-4 py-2.5 text-neutral-600">{r.completedOrders}</td>
                <td className="px-4 py-2.5">
                  {r.unsettledAmount > 0 ? (
                    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">{formatPaisa(r.unsettledAmount)}</span>
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {riders?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">No riders match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
