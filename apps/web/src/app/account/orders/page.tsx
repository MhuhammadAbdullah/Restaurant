"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FaBagShopping, FaChevronRight } from "react-icons/fa6";
import { formatPaisa } from "@restaurant/utils";
import { api } from "../../../lib/api";
import { SkeletonOrderCard } from "../../../components/skeletons";
import { OrderStatusStepper } from "../../../components/OrderStatusStepper";
import { OrderStatusBadge } from "../../../components/OrderStatusBadge";

type Order = {
  id: string;
  orderNumber: string;
  orderCode?: string | null;
  status: string;
  grandTotal: number;
  createdAt: string;
  branch: { name: string };
  items: Array<{ nameSnapshot: string; quantity: number }>;
};

const ACTIVE = new Set(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"]);
type Tab = "all" | "active" | "past";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function OrdersPage() {
  const { data: orders, isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => api.get<Order[]>("/orders"), refetchInterval: 6000 });
  const [tab, setTab] = useState<Tab>("all");

  const counts = useMemo(() => {
    const active = (orders ?? []).filter((o) => ACTIVE.has(o.status)).length;
    return { all: orders?.length ?? 0, active, past: (orders?.length ?? 0) - active };
  }, [orders]);

  const shown = useMemo(() => (orders ?? []).filter((o) => (tab === "all" ? true : tab === "active" ? ACTIVE.has(o.status) : !ACTIVE.has(o.status))), [orders, tab]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">My Orders</h1>
      <p className="mt-0.5 text-sm text-muted">Track current orders and look back at past ones.</p>

      <div className="mt-4 flex gap-2">
        {(
          [
            ["all", "All"],
            ["active", "In progress"],
            ["past", "Past orders"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
              tab === k ? "border-brand-red bg-brand-red text-white" : "border-line bg-surface text-ink hover:border-brand-red"
            }`}
          >
            {label}
            <span className={`rounded-full px-1.5 text-xs ${tab === k ? "bg-white/25" : "bg-surface-alt text-muted"}`}>{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <SkeletonOrderCard key={i} />)}

        {!isLoading &&
          shown.map((o) => {
            const active = ACTIVE.has(o.status);
            const summary = o.items.map((i) => `${i.quantity}x ${i.nameSnapshot}`).join(", ");
            return (
              <Link key={o.id} href={`/order-confirmation/${o.orderNumber}`} className="group block rounded-2xl border border-line bg-surface p-4 transition hover:border-brand-red hover:shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-ink">Order {o.orderCode ?? o.orderNumber}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {o.branch.name} · {formatWhen(o.createdAt)}
                    </p>
                  </div>
                  <OrderStatusBadge status={o.status} />
                </div>

                <p className="mt-3 line-clamp-2 text-sm text-muted">{summary}</p>

                {active && (
                  <div className="mt-4 rounded-xl bg-surface-alt px-3 py-3">
                    <OrderStatusStepper status={o.status} />
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <div>
                    <p className="text-xs text-muted">Total</p>
                    <p className="text-base font-bold text-ink">{formatPaisa(o.grandTotal)}</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-brand-red">
                    {active ? "Track order" : "View details"} <FaChevronRight size={11} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            );
          })}

        {!isLoading && shown.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
              <FaBagShopping size={22} />
            </span>
            <p className="mt-4 text-base font-semibold text-ink">{counts.all === 0 ? "No orders yet" : tab === "active" ? "No orders in progress" : "No past orders"}</p>
            <p className="mt-1 text-sm text-muted">{counts.all === 0 ? "When you place an order it will show up here." : "Switch the filter above to see your other orders."}</p>
            {counts.all === 0 && (
              <Link href="/" className="mt-5 rounded-xl bg-brand-red px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                Browse the menu
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
