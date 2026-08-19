"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { SkeletonBalancePage } from "../../../components/skeletons";

type LoyaltyTxn = { id: string; type: string; points: number; note: string | null; createdAt: string };
type Loyalty = { pointsBalance: number; transactions: LoyaltyTxn[] };

const TYPE_FALLBACK_LABEL: Record<string, string> = {
  EARNED: "Points Earned",
  REDEEMED: "Points Redeemed",
  EXPIRED: "Points Expired",
  ADJUSTMENT: "Manual Adjustment",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LoyaltyPage() {
  const { data, isLoading } = useQuery({ queryKey: ["loyalty"], queryFn: () => api.get<Loyalty>("/customers/me/loyalty") });
  if (isLoading) return <SkeletonBalancePage />;
  if (!data) return null;

  // Transactions arrive newest-first; the ledger is append-only, so each row's balance-at-the-time
  // can be reconstructed by walking backward from the current total and undoing more-recent rows.
  let runningBalance = data.pointsBalance;
  const rows = data.transactions.map((t) => {
    const balanceAfter = runningBalance;
    runningBalance -= t.points;
    return { ...t, balanceAfter };
  });

  return (
    <div>
      <div className="rounded-xl bg-brand-red/10 p-4 text-center">
        <p className="text-xs text-muted">Current Balance</p>
        <p className="text-3xl font-semibold text-brand-red">{data.pointsBalance} pts</p>
      </div>

      <p className="mt-5 text-sm font-medium text-ink">History</p>
      <div className="mt-2 space-y-2">
        {rows.map((t) => {
          const isPositive = t.points >= 0;
          return (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-4">
              <div>
                <p className="text-sm font-semibold text-ink">{t.note ?? TYPE_FALLBACK_LABEL[t.type] ?? t.type}</p>
                <p className="mt-1 text-xs text-muted">{formatDate(t.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                  {isPositive ? "+" : "-"}
                  {Math.abs(t.points).toFixed(2)} Points
                </p>
                <p className="mt-1 text-xs text-muted">Balance: {t.balanceAfter.toFixed(2)} Points</p>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-muted">No loyalty activity yet.</p>}
      </div>
    </div>
  );
}
