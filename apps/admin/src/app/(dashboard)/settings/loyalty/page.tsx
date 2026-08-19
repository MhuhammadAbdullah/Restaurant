"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";

type LoyaltyConfig = {
  enabled: boolean;
  signupBonusPoints: number;
  earnRatePaisaPerPoint: number;
  redemptionValuePaisaPerPoint: number;
  expiryDays: number;
};

type RestaurantInfo = { name: string; loyalty: LoyaltyConfig };

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

export default function LoyaltySettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });

  const [enabled, setEnabled] = useState(true);
  const [signupBonusPoints, setSignupBonusPoints] = useState(0);
  const [earnRateRupees, setEarnRateRupees] = useState(100);
  const [redemptionValueRupees, setRedemptionValueRupees] = useState(1);
  const [expiryDays, setExpiryDays] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurant?.loyalty) return;
    const l = restaurant.loyalty;
    setEnabled(l.enabled);
    setSignupBonusPoints(l.signupBonusPoints);
    setEarnRateRupees(l.earnRatePaisaPerPoint / 100);
    setRedemptionValueRupees(l.redemptionValuePaisaPerPoint / 100);
    setExpiryDays(l.expiryDays);
  }, [restaurant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", {
        loyalty: {
          enabled,
          signupBonusPoints,
          earnRatePaisaPerPoint: Math.round(earnRateRupees * 100),
          redemptionValuePaisaPerPoint: Math.round(redemptionValueRupees * 100),
          expiryDays,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
      toast.success("Loyalty settings saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save loyalty settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Loyalty Program</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Controls how customers earn and redeem loyalty points across the website, POS, and dine-in orders.
      </p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4 max-w-3xl">
        <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-70">
          <div className="rounded-xl border-2 border-brand-red/20 bg-brand-red/5 p-5 shadow-sm">
            <p className="text-sm font-semibold text-neutral-900">Loyalty Program</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Master switch. When off, no points are earned on registration or any order (online, POS, dine-in), customers can&apos;t
              redeem points at checkout, and &quot;Loyalty Points&quot; is hidden from their account, regardless of their existing
              balance. Admins can still manually adjust a customer&apos;s points from the Customers page either way.
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm font-medium text-neutral-900">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              {enabled ? "Loyalty program is ON" : "Loyalty program is OFF"}
            </label>
          </div>

          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${!enabled ? "opacity-50" : ""}`}>
            <SettingsCard title="Signup Bonus" description="Points automatically credited the moment a new customer registers.">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={signupBonusPoints}
                  onChange={(e) => setSignupBonusPoints(Math.max(0, Number(e.target.value)))}
                  className="input w-24"
                />
                <span className="text-sm text-neutral-500">points on registration</span>
              </div>
            </SettingsCard>

            <SettingsCard title="Earning Rate" description="Applies to every paid order (online, POS, and dine-in) for a logged-in customer.">
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <span>Rs.</span>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={earnRateRupees}
                  onChange={(e) => setEarnRateRupees(Math.max(0.01, Number(e.target.value)))}
                  className="input w-24"
                />
                <span>spent = 1 point</span>
              </div>
            </SettingsCard>

            <SettingsCard title="Redemption Value" description="How much discount 1 point is worth when redeemed at checkout.">
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <span>1 point = Rs.</span>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={redemptionValueRupees}
                  onChange={(e) => setRedemptionValueRupees(Math.max(0.01, Number(e.target.value)))}
                  className="input w-24"
                />
                <span>discount</span>
              </div>
            </SettingsCard>

            <SettingsCard title="Points Expiry" description="How long after earning a point remains valid. 0 = never expire.">
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="number"
                  min={0}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Math.max(0, Number(e.target.value)))}
                  className="input w-24"
                />
                <span>days {expiryDays === 0 && <span className="text-neutral-400">(never expire)</span>}</span>
              </div>
            </SettingsCard>
          </div>

          <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </fieldset>
      </form>

      <style jsx global>{`
        .input {
          border-radius: 0.5rem;
          border: 1px solid #d4d4d4;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
