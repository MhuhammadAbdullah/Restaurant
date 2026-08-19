"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api } from "../../../lib/api";
import { SkeletonOrderCard } from "../../../components/skeletons";
import { OrderStatusStepper } from "../../../components/OrderStatusStepper";
import { OrderStatusBadge } from "../../../components/OrderStatusBadge";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  branch: { name: string };
  items: Array<{ nameSnapshot: string; quantity: number }>;
};

export default function OrdersPage() {
  const { data: orders, isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => api.get<Order[]>("/orders"), refetchInterval: 6000 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonOrderCard key={i} />
        ))}
      </div>
    );
  }

  if (!orders || orders.length === 0) return <p className="text-sm text-muted">No orders yet.</p>;

  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <Link key={o.id} href={`/order-confirmation/${o.orderNumber}`} className="block rounded-xl border border-line p-4 transition hover:border-brand-red">
          <div className="flex items-center justify-between">
            <p className="font-medium text-ink">{o.orderNumber}</p>
            <OrderStatusBadge status={o.status} />
          </div>
          <p className="text-xs text-muted">{o.branch.name} • {new Date(o.createdAt).toLocaleString()}</p>
          <p className="mt-1 text-sm text-muted">{o.items.map((i) => `${i.quantity}x ${i.nameSnapshot}`).join(", ")}</p>

          <div className="mt-3">
            <OrderStatusStepper status={o.status} />
          </div>

          <div className="mt-2 flex justify-between text-sm">
            <span className="text-muted">Total</span>
            <span className="font-semibold text-ink">{formatPaisa(o.grandTotal)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
