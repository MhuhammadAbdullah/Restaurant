"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useMe, hasPermission } from "../../../lib/useMe";
import { BlockToggle, CustomerDetailModal, type CustomerStatus } from "../../../components/customers/CustomerDetailModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

type CustomerListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  isGuest: boolean;
  status: CustomerStatus;
  createdAt: string;
  loyaltyPoints: number;
  orderCount: number;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canBlockCustomers = hasPermission(me, "customers.block");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "registered" | "guest">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: customers } = useQuery({
    queryKey: ["staff-customers", search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const qs = params.toString();
      return api.get<CustomerListItem[]>(`/staff/customers${qs ? `?${qs}` : ""}`);
    },
  });

  async function toggleRowStatus(c: CustomerListItem) {
    const blocking = c.status === "ACTIVE";
    if (blocking && !confirm(`Block ${c.name} (${c.phone})? This phone number won't be able to place new orders until unblocked.`)) return;
    setTogglingId(c.id);
    try {
      await api.patch(`/staff/customers/${c.id}/status`, { status: blocking ? "INACTIVE" : "ACTIVE" });
      await queryClient.invalidateQueries({ queryKey: ["staff-customers"] });
      await queryClient.invalidateQueries({ queryKey: ["staff-customer"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update customer status");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Customers</h1>
      <p className="mt-1 text-sm text-neutral-500">Every person who has an account or has placed an order, registered or guest.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          placeholder="Search name, phone, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "registered" | "guest")}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="registered">Registered Only</SelectItem>
            <SelectItem value="guest">Not Registered Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Orders</th>
              <th className="px-4 py-2.5 font-medium">Loyalty</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5 font-medium">Blocked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {customers?.map((c) => (
              <tr key={c.id} onClick={() => setSelectedId(c.id)} className="cursor-pointer hover:bg-neutral-50">
                <td className="px-4 py-2.5 font-medium text-neutral-900">{c.name}</td>
                <td className="px-4 py-2.5 text-neutral-600">{c.phone}</td>
                <td className="px-4 py-2.5 text-neutral-600">{c.email ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.isGuest ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                    {c.isGuest ? "Not Registered" : "Registered"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-neutral-600">{c.orderCount}</td>
                <td className="px-4 py-2.5 text-neutral-600">{c.isGuest ? "—" : `${c.loyaltyPoints} pts`}</td>
                <td className="px-4 py-2.5 text-neutral-500">{formatDate(c.createdAt)}</td>
                <td className="px-4 py-2.5">
                  <BlockToggle status={c.status} canEdit={canBlockCustomers} busy={togglingId === c.id} onToggle={() => toggleRowStatus(c)} />
                </td>
              </tr>
            ))}
            {customers?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">No customers found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedId && <CustomerDetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
