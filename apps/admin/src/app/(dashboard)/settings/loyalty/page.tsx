"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { Switch } from "../../../../components/ui/switch";

type LoyaltyConfig = {
  enabled: boolean;
  signupBonusPoints: number;
  earnRatePaisaPerPoint: number;
  redemptionValuePaisaPerPoint: number;
  expiryDays: number;
};

type RestaurantInfo = { name: string; loyalty: LoyaltyConfig };

type FormState = { enabled: boolean; signupBonusPoints: number; earnRateRupees: number; redemptionValueRupees: number; expiryDays: number };

const EXPIRY_PRESETS: [number, string][] = [
  [0, "Never"],
  [30, "30 days"],
  [90, "3 months"],
  [180, "6 months"],
  [365, "1 year"],
];

const rs = (n: number) => `Rs. ${Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function SectionCard({ n, title, description, children }: { n: number; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white">{n}</span>
        <div>
          <p className="text-sm font-semibold text-neutral-900">{title}</p>
          <p className="text-xs text-neutral-500">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function NumberField({ value, onChange, min, step, className }: { value: number; onChange: (v: number) => void; min: number; step?: string; className?: string }) {
  return <input type="number" min={min} step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(Number(e.target.value))} className={`input ${className ?? "w-28"}`} />;
}

export default function LoyaltySettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });

  const [form, setForm] = useState<FormState>({ enabled: true, signupBonusPoints: 0, earnRateRupees: 100, redemptionValueRupees: 1, expiryDays: 0 });
  const [saved, setSaved] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [sampleOrder, setSampleOrder] = useState(2500);

  useEffect(() => {
    if (!restaurant?.loyalty) return;
    const l = restaurant.loyalty;
    const next: FormState = {
      enabled: l.enabled,
      signupBonusPoints: l.signupBonusPoints,
      earnRateRupees: l.earnRatePaisaPerPoint / 100,
      redemptionValueRupees: l.redemptionValuePaisaPerPoint / 100,
      expiryDays: l.expiryDays,
    };
    setForm(next);
    setSaved(next);
  }, [restaurant]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = useMemo(() => !!saved && JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);

  const earnValid = form.earnRateRupees >= 0.01;
  const redeemValid = form.redemptionValueRupees >= 0.01;
  const bonusValid = Number.isInteger(form.signupBonusPoints) && form.signupBonusPoints >= 0;
  const expiryValid = Number.isInteger(form.expiryDays) && form.expiryDays >= 0;
  const valid = earnValid && redeemValid && bonusValid && expiryValid;

  // Worked example for the "what customers see" panel
  const pointsEarned = earnValid ? Math.floor(sampleOrder / form.earnRateRupees) : 0;
  const pointsWorth = pointsEarned * form.redemptionValueRupees;
  const cashbackPct = earnValid && redeemValid ? (form.redemptionValueRupees / form.earnRateRupees) * 100 : 0;
  const bonusWorth = form.signupBonusPoints * form.redemptionValueRupees;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      toast.error("Please fix the highlighted fields first");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", {
        loyalty: {
          enabled: form.enabled,
          signupBonusPoints: form.signupBonusPoints,
          earnRatePaisaPerPoint: Math.round(form.earnRateRupees * 100),
          redemptionValuePaisaPerPoint: Math.round(form.redemptionValueRupees * 100),
          expiryDays: form.expiryDays,
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
      <p className="mt-1 text-sm text-neutral-500">Reward customers with points on every order and let them spend the points as discount. Applies to the website, POS and dine-in.</p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={!canManage} className="grid grid-cols-1 gap-5 disabled:opacity-70 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-4">
            <div className={`rounded-xl border-2 p-5 shadow-sm ${form.enabled ? "border-green-200 bg-green-50/60" : "border-neutral-200 bg-neutral-50"}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                    Loyalty program
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${form.enabled ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}>{form.enabled ? "ON" : "OFF"}</span>
                  </p>
                  <p className="mt-1 max-w-xl text-xs text-neutral-500">
                    {form.enabled
                      ? "Customers earn points on registration and paid orders, and can redeem them at checkout."
                      : "No points are earned or redeemed, and “Loyalty Points” is hidden from customer accounts, whatever their balance is. Existing balances are kept. Admins can still adjust points from the Customers page."}
                  </p>
                </div>
                <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} aria-label="Loyalty program on or off" />
              </div>
            </div>

            <div className={`space-y-4 ${form.enabled ? "" : "pointer-events-none opacity-50"}`}>
              <SectionCard n={1} title="Earning points" description="How customers collect points.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Spend → 1 point</p>
                    <div className="flex items-center gap-2 text-sm text-neutral-700">
                      <span>Rs.</span>
                      <NumberField value={form.earnRateRupees} onChange={(v) => set("earnRateRupees", v)} min={0.01} step="0.01" />
                      <span>= 1 point</span>
                    </div>
                    {!earnValid && <p className="mt-1 text-xs text-red-600">Must be at least Rs. 0.01</p>}
                    <p className="mt-1 text-xs text-neutral-400">Counted on every paid order by a logged-in customer.</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">Signup bonus</p>
                    <div className="flex items-center gap-2 text-sm text-neutral-700">
                      <NumberField value={form.signupBonusPoints} onChange={(v) => set("signupBonusPoints", Math.floor(v))} min={0} />
                      <span>points</span>
                    </div>
                    {!bonusValid && <p className="mt-1 text-xs text-red-600">Enter a whole number, 0 or more</p>}
                    <p className="mt-1 text-xs text-neutral-400">{form.signupBonusPoints > 0 ? `Worth ${rs(bonusWorth)} on a customer's first order.` : "0 = no bonus."}</p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard n={2} title="Spending points" description="How much discount points are worth at checkout.">
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Point value</p>
                  <div className="flex items-center gap-2 text-sm text-neutral-700">
                    <span>1 point = Rs.</span>
                    <NumberField value={form.redemptionValueRupees} onChange={(v) => set("redemptionValueRupees", v)} min={0.01} step="0.01" />
                    <span>discount</span>
                  </div>
                  {!redeemValid && <p className="mt-1 text-xs text-red-600">Must be at least Rs. 0.01</p>}
                </div>
                {earnValid && redeemValid && (
                  <p className={`rounded-lg px-3 py-2 text-xs ${cashbackPct > 10 ? "bg-amber-50 text-amber-800" : "bg-neutral-50 text-neutral-600"}`}>
                    Customers effectively get <b>{cashbackPct.toFixed(cashbackPct < 1 ? 2 : 1)}%</b> back on what they spend.
                    {cashbackPct > 10 && " That is quite generous; double-check the earning rate and point value."}
                  </p>
                )}
              </SectionCard>

              <SectionCard n={3} title="Points expiry" description="How long points stay valid after they are earned.">
                <div className="flex flex-wrap gap-2">
                  {EXPIRY_PRESETS.map(([days, label]) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => set("expiryDays", days)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${form.expiryDays === days ? "border-brand-red bg-red-50 text-brand-red" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <span>Custom:</span>
                  <NumberField value={form.expiryDays} onChange={(v) => set("expiryDays", Math.floor(v))} min={0} className="w-24" />
                  <span>days</span>
                </div>
                {!expiryValid && <p className="text-xs text-red-600">Enter a whole number, 0 or more</p>}
                <p className="text-xs text-neutral-400">{form.expiryDays === 0 ? "Points never expire." : `Points expire ${form.expiryDays} days after being earned.`}</p>
              </SectionCard>
            </div>
          </div>

          <aside className="xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-neutral-900">How it will work</p>
              {!form.enabled ? (
                <p className="mt-3 rounded-lg bg-neutral-50 p-4 text-center text-sm text-neutral-500">Loyalty is off. Customers won&apos;t see or earn any points.</p>
              ) : (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <p className="text-xs font-medium text-neutral-500">If a customer orders for</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-neutral-700">Rs.</span>
                      <input type="number" min={0} value={sampleOrder} onChange={(e) => setSampleOrder(Math.max(0, Number(e.target.value)))} className="input w-28" />
                    </div>
                    <p className="mt-2 text-neutral-800">
                      They earn <b className="text-brand-red">{pointsEarned.toLocaleString()} point{pointsEarned === 1 ? "" : "s"}</b>
                      <span className="text-neutral-500"> (worth {rs(pointsWorth)})</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <p className="text-xs font-medium text-neutral-500">Next order</p>
                    <p className="mt-1 text-neutral-800">
                      Using all {pointsEarned.toLocaleString()} points gives <b className="text-brand-red">{rs(pointsWorth)}</b> off.
                    </p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <p className="text-xs font-medium text-neutral-500">New customer</p>
                    <p className="mt-1 text-neutral-800">
                      {form.signupBonusPoints > 0 ? (
                        <>Gets <b className="text-brand-red">{form.signupBonusPoints.toLocaleString()} points</b> on signup ({rs(bonusWorth)} value).</>
                      ) : (
                        "No signup bonus."
                      )}
                    </p>
                  </div>
                  <p className="text-xs text-neutral-400">{form.expiryDays === 0 ? "Points never expire." : `Unused points expire after ${form.expiryDays} days.`}</p>
                </div>
              )}
            </div>
          </aside>

          <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg xl:col-span-2">
            <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving || !dirty}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" onClick={() => saved && setForm(saved)} disabled={!dirty || saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
              Reset
            </button>
            <span className={`text-xs ${dirty ? "font-medium text-amber-600" : "text-neutral-400"}`}>{dirty ? "You have unsaved changes" : "All changes saved"}</span>
          </div>
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
