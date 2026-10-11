"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api } from "../../lib/api";
import { useMe, hasPermission } from "../../lib/useMe";
import { useSelectedBranch } from "../../lib/useSelectedBranch";
import { BranchInfoCard } from "./BranchInfoCard";
import { AccessGuide } from "./AccessGuide";

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

type OrderRow = { id: string; orderNumber: string; status: string; type: string; grandTotal: number; createdAt: string };
type KitchenRow = { id: string; status: string };
type TableRowLite = { id: string; status: string };

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  PREPARING: "bg-orange-50 text-orange-700",
  READY: "bg-green-50 text-green-700",
  OUT_FOR_DELIVERY: "bg-purple-50 text-purple-700",
  DELIVERED: "bg-green-50 text-green-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-neutral-100 text-neutral-500",
  REFUNDED: "bg-neutral-100 text-neutral-500",
};

function StatCard({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const body = (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 transition hover:shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-neutral-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/**
 * Dashboard for staff who don't have the owner-style "reports" permission. Instead of an empty page it shows what
 * their own job needs (today's orders, kitchen queue, table floor) based on exactly the permissions they hold,
 * plus one-tap shortcuts to every page they can open.
 */
export function WorkDashboard() {
  const { data: me } = useMe();
  const { branchId, branches } = useSelectedBranch();
  const canOrders = hasPermission(me, "orders.view");
  const canKitchen = hasPermission(me, "kitchen.access");
  const canTables = hasPermission(me, "tables.view") || hasPermission(me, "pos.access");
  const today = todayStr();
  const branchQs = branchId ? `&branchId=${branchId}` : "";

  const { data: orders } = useQuery({
    queryKey: ["work-orders", today, branchId],
    queryFn: () => api.get<OrderRow[]>(`/staff/orders?from=${today}&to=${today}&take=300${branchQs}`),
    enabled: canOrders,
    refetchInterval: 20000,
  });
  const { data: kitchen } = useQuery({
    queryKey: ["work-kitchen", branchId],
    queryFn: () => api.get<KitchenRow[]>(`/kitchen/orders?${branchId ? `branchId=${branchId}` : ""}`),
    enabled: canKitchen && !!branchId,
    refetchInterval: 15000,
  });
  const { data: tables } = useQuery({
    queryKey: ["work-tables", branchId],
    queryFn: () => api.get<TableRowLite[]>(`/tables/overview?branchId=${branchId}`),
    enabled: canTables && !!branchId,
    refetchInterval: 20000,
  });

  const done = new Set(["DELIVERED", "COMPLETED"]);
  const cancelled = new Set(["CANCELLED", "REFUNDED"]);
  const todays = orders ?? [];
  const open = todays.filter((o) => !done.has(o.status) && !cancelled.has(o.status));
  const kitchenCount = (s: string) => (kitchen ?? []).filter((k) => k.status === s).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">{greeting}{me ? `, ${me.name.split(" ")[0]}` : ""}</h1>
        <p className="mt-1 text-sm text-neutral-500">Welcome to your workspace. Here is your branch and what your account lets you do.</p>
      </div>

      {me && !me.isOwner && !me.allBranchesAccess && branches.length === 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No branch is assigned to your account, so there is no data to show yet. Ask an admin to give you a branch.</p>
      )}

      {me && (me.isOwner || me.allBranchesAccess || branches.length > 0) && (
        <div className="mt-4">
          <BranchInfoCard branchId={branchId ?? ""} scopeIds={me.isOwner || me.allBranchesAccess ? undefined : branches.map((x) => x.id)} greeting={{ name: me.name, role: me.role }} />
        </div>
      )}

      {/* Counts that fit the job. Money is never shown here: sales belong to people with the Reports permission. */}
      {(canOrders || canKitchen || canTables) && (
        <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {canKitchen && branchId && (
            <>
              <StatCard label="New" value={kitchen ? kitchenCount("CONFIRMED") : "…"} hint="Waiting to start" href="/kitchen" />
              <StatCard label="Preparing" value={kitchen ? kitchenCount("PREPARING") : "…"} hint="On the stove" href="/kitchen" />
              <StatCard label="Ready" value={kitchen ? kitchenCount("READY") : "…"} hint="Waiting to be handed over" href="/kitchen" />
              <StatCard label="Cancelled" value={kitchen ? kitchenCount("CANCELLED") : "…"} hint="Called off, stop preparing" href="/kitchen" />
            </>
          )}
          {canOrders && (
            <>
              <StatCard label="Orders today" value={orders ? todays.length : "…"} hint={`${open.length} still open`} href="/orders" />
              <StatCard label="Pending" value={orders ? todays.filter((o) => o.status === "PENDING").length : "…"} hint="Not accepted yet" href="/orders" />
              {/* the kitchen cards already show Ready, so it is not repeated for kitchen staff */}
              {!canKitchen && <StatCard label="Ready" value={orders ? todays.filter((o) => o.status === "READY").length : "…"} hint="Ready for pickup / serving" href="/orders" />}
            </>
          )}
          {canTables && branchId && (
            <StatCard label="Tables occupied" value={tables ? tables.filter((t) => t.status === "OCCUPIED").length : "…"} hint={`${tables ? tables.filter((t) => t.status === "AVAILABLE").length : 0} free`} href="/tables" />
          )}
        </div>
      )}
      {(canKitchen || canTables) && !branchId && branches.length > 1 && (
        <p className="mt-3 text-xs text-neutral-400">Pick a branch in the top bar to see the kitchen queue and table floor.</p>
      )}

      {canOrders && todays.length > 0 && (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-900">Latest orders today</p>
            <Link href="/orders" className="text-xs font-medium text-brand-red hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-neutral-100">
            {todays.slice(0, 8).map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-900">{o.orderNumber}</p>
                  <p className="text-xs text-neutral-400">{o.type.replace(/_/g, " ")} · {new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-medium text-neutral-800">{formatPaisa(o.grandTotal)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[o.status] ?? "bg-neutral-100 text-neutral-600"}`}>{o.status.replace(/_/g, " ")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {me && (
        <div className="mt-6">
          <AccessGuide me={me} />
        </div>
      )}
    </div>
  );
}
