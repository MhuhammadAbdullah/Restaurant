const STATUS_STEPS = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export function OrderStatusStepper({ status }: { status: string }) {
  if (status === "CANCELLED" || status === "REFUNDED") {
    return (
      <div className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700">
        Order {status === "CANCELLED" ? "Cancelled" : "Refunded"}
      </div>
    );
  }

  const activeIndex = STATUS_STEPS.indexOf(status as (typeof STATUS_STEPS)[number]);

  return (
    <div>
      <div className="flex items-center gap-1">
        {STATUS_STEPS.map((step, i) => {
          const reached = activeIndex >= i;
          return <div key={step} className={`h-1.5 flex-1 rounded-full ${reached ? "bg-brand-red" : "bg-surface-alt"}`} title={step} />;
        })}
      </div>
      <p className="mt-1.5 text-center text-xs font-semibold text-brand-red">{status.replace(/_/g, " ")}</p>
    </div>
  );
}
