"use client";

import { useQuery } from "@tanstack/react-query";
import { FaArrowDown, FaArrowUp, FaGift } from "react-icons/fa6";
import { api } from "../../../lib/api";
import { SkeletonBalancePage } from "../../../components/skeletons";

type LoyaltyTxn = { id: string; type: string; points: number; note: string | null; createdAt: string };
type Loyalty = { pointsBalance: number; transactions: LoyaltyTxn[] };

const TYPE_FALLBACK_LABEL: Record<string, string> = {
  EARNED: "Points earned",
  REDEEMED: "Points redeemed",
  EXPIRED: "Points expired",
  ADJUSTMENT: "Manual adjustment",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));

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

  const earned = data.transactions.filter((t) => t.points > 0).reduce((n, t) => n + t.points, 0);
  const spent = data.transactions.filter((t) => t.points < 0).reduce((n, t) => n + Math.abs(t.points), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Loyalty Points</h1>
      <p className="mt-0.5 text-sm text-muted">Earn points on every order and use them as a discount at checkout.</p>

      <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-red to-[#b91a16] p-6 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/80">Current balance</p>
            <p className="mt-1 text-4xl font-bold tracking-tight">
              {fmt(data.pointsBalance)} <span className="text-lg font-medium text-white/80">pts</span>
            </p>
          </div>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15">
            <FaGift size={24} />
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4 text-sm">
          <div>
            <p className="text-white/70">Total earned</p>
            <p className="text-lg font-semibold">{fmt(earned)}</p>
          </div>
          <div>
            <p className="text-white/70">Total used</p>
            <p className="text-lg font-semibold">{fmt(spent)}</p>
          </div>
        </div>
      </div>

      <h2 className="mt-7 text-base font-semibold text-ink">History</h2>
      <div className="mt-3 space-y-2">
        {rows.map((t) => {
          const positive = t.points >= 0;
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${positive ? "bg-green-50 text-green-600 dark:bg-green-500/10" : "bg-red-50 text-red-600 dark:bg-red-500/10"}`}>
                {positive ? <FaArrowUp size={13} /> : <FaArrowDown size={13} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{t.note ?? TYPE_FALLBACK_LABEL[t.type] ?? t.type}</p>
                <p className="mt-0.5 text-xs text-muted">{formatDate(t.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${positive ? "text-green-600" : "text-red-600"}`}>
                  {positive ? "+" : "-"}
                  {fmt(Math.abs(t.points))} pts
                </p>
                <p className="mt-0.5 text-xs text-muted">Balance {fmt(t.balanceAfter)}</p>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink">No points activity yet</p>
            <p className="mt-1 text-xs text-muted">Place an order to start earning.</p>
          </div>
        )}
      </div>
    </div>
  );
}
