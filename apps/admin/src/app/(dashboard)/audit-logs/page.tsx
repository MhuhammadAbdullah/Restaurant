"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  createdAt: string;
  staffUser: { id: string; name: string; email: string } | null;
};

const ENTITY_TYPES = ["", "Product", "Order", "StaffUser", "Branch", "Complaint", "Payment"];

export default function AuditLogsPage() {
  const [entityType, setEntityType] = useState("");
  const { data: logs } = useQuery({
    queryKey: ["audit-logs", entityType],
    queryFn: () => api.get<AuditLog[]>(`/audit-logs${entityType ? `?entityType=${entityType}` : ""}`),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Audit Logs</h1>
        <Select value={entityType || "all"} onValueChange={(v) => setEntityType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t || "all"} value={t || "all"}>{t || "All entity types"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Staff</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">Change</th>
              <th className="px-4 py-2">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs?.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2">{l.staffUser ? l.staffUser.name : <span className="text-neutral-400">System</span>}</td>
                <td className="px-4 py-2 font-medium">{l.action}</td>
                <td className="px-4 py-2 text-xs text-neutral-500">{l.entityType} · {l.entityId.slice(0, 8)}</td>
                <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-neutral-500" title={JSON.stringify({ old: l.oldValue, new: l.newValue })}>
                  {JSON.stringify(l.newValue ?? l.oldValue ?? {})}
                </td>
                <td className="px-4 py-2 text-xs text-neutral-400">{l.ipAddress ?? "-"}</td>
              </tr>
            ))}
            {(!logs || logs.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">No audit entries yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
