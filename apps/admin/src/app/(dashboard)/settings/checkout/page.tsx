"use client";

import { LoadingDots } from "../../../../components/LoadingDots";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResolvedCheckoutConfig } from "@restaurant/validation";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { Switch } from "../../../../components/ui/switch";
import { ImageUploadField } from "../../../../components/ImageUploadField";

type RestaurantInfo = { checkout: ResolvedCheckoutConfig };
type Payments = ResolvedCheckoutConfig["payments"];
const DEFAULT_PAYMENTS: Payments = {
  cod: { enabled: true, label: "Cash on Delivery", pickupLabel: "Pay at Pickup", iconUrl: null },
  online: { enabled: true, label: "Online Payment", iconUrl: null },
};

const MAX_PRESETS = 4;
const MAX_AMOUNT = 100_000;

function Card({ n, title, description, right, children }: { n: number; title: string; description: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white">{n}</span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">{title}</p>
            <p className="text-xs text-neutral-500">{description}</p>
          </div>
        </div>
        {right}
      </div>
      {children && <div className="mt-4 space-y-3">{children}</div>}
    </section>
  );
}

function StatusPill({ on, onText, offText }: { on: boolean; onText: string; offText: string }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${on ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{on ? onText : offText}</span>;
}

export default function CheckoutSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });

  const [showCoupon, setShowCoupon] = useState(true);
  const [showTip, setShowTip] = useState(true);
  const [showGift, setShowGift] = useState(true);
  const [presets, setPresets] = useState<string[]>(["100", "200", "500"]);
  const [defaultTip, setDefaultTip] = useState("0");
  const [payments, setPayments] = useState<Payments>(DEFAULT_PAYMENTS);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  const snapshot = useMemo(() => JSON.stringify({ showCoupon, showTip, showGift, presets, defaultTip, payments }), [showCoupon, showTip, showGift, presets, defaultTip, payments]);
  const dirty = saved !== "" && snapshot !== saved;

  useEffect(() => {
    if (!restaurant) return;
    const c = restaurant.checkout;
    const next = { showCoupon: c.showCoupon, showTip: c.showTip, showGift: c.showGift, presets: c.tipPresets.map(String), defaultTip: String(c.defaultTip), payments: c.payments };
    setPayments(next.payments);
    setShowCoupon(next.showCoupon);
    setShowTip(next.showTip);
    setShowGift(next.showGift);
    setPresets(next.presets);
    setDefaultTip(next.defaultTip);
    setSaved(JSON.stringify(next));
  }, [restaurant]);

  function reset() {
    if (!saved) return;
    const s = JSON.parse(saved) as { showCoupon: boolean; showTip: boolean; showGift: boolean; presets: string[]; defaultTip: string; payments: Payments };
    setPayments(s.payments);
    setShowCoupon(s.showCoupon);
    setShowTip(s.showTip);
    setShowGift(s.showGift);
    setPresets(s.presets);
    setDefaultTip(s.defaultTip);
  }

  const amounts = presets.map((p) => Number(p));
  const presetsValid = amounts.every((a) => Number.isInteger(a) && a >= 1 && a <= MAX_AMOUNT);
  const duplicates = new Set(amounts).size !== amounts.length;
  const defaultNum = Number(defaultTip || 0);
  const defaultValid = Number.isInteger(defaultNum) && defaultNum >= 0 && defaultNum <= MAX_AMOUNT;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!presetsValid) return toast.error(`Tip amounts must be whole numbers between 1 and ${MAX_AMOUNT.toLocaleString()}`);
    if (duplicates) return toast.error("Two tip buttons have the same amount");
    if (!defaultValid) return toast.error("The default tip must be 0 or a whole number");
    if (!payments.cod.enabled && !payments.online.enabled) return toast.error("Keep at least one payment method on");
    if (!payments.cod.label.trim() || !payments.cod.pickupLabel.trim() || !payments.online.label.trim()) return toast.error("Payment method names cannot be empty");
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", { checkout: { showCoupon, showTip, showGift, tipPresets: amounts, defaultTip: defaultNum, payments } });
      await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the checkout settings");
    } finally {
      setSaving(false);
    }
  }

  const sortedAmounts = [...amounts].filter((a) => a > 0).sort((a, b) => a - b);

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Checkout</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">Choose what customers see on the checkout page: the coupon box, the tip box, the tip amounts offered, and the payment methods (names and icons).</p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={!canManage} className="grid grid-cols-1 gap-5 disabled:opacity-70 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <Card
              n={1}
              title="Coupon code"
              description="A box where customers type a coupon code. Hidden means customers cannot use coupons on the website."
              right={<Switch checked={showCoupon} onCheckedChange={setShowCoupon} aria-label="Show the coupon box at checkout" />}
            >
              <StatusPill on={showCoupon} onText="Shown at checkout" offText="Hidden, coupons cannot be used online" />
            </Card>

            <Card
              n={2}
              title="Tip"
              description="A tip box on top of the bill (it goes to the rider for delivery). Hidden means no tip can be added online."
              right={<Switch checked={showTip} onCheckedChange={setShowTip} aria-label="Show the tip box at checkout" />}
            >
              <StatusPill on={showTip} onText="Shown at checkout" offText="Hidden, no tips online" />
              <div className={showTip ? "space-y-4" : "space-y-4 opacity-50"}>
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Quick tip buttons (Rs.)</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {presets.map((value, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={MAX_AMOUNT}
                          inputMode="numeric"
                          value={value}
                          onChange={(e) => setPresets((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                          disabled={!showTip}
                          className="input w-24"
                          aria-label={`Tip button ${i + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => setPresets((p) => p.filter((_, j) => j !== i))}
                          disabled={!showTip}
                          aria-label={`Remove tip button ${i + 1}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {presets.length < MAX_PRESETS && (
                      <button type="button" onClick={() => setPresets((p) => [...p, ""])} disabled={!showTip} className="rounded-lg border border-dashed border-brand-red px-3 py-2 text-sm font-medium text-brand-red hover:bg-red-50">
                        + Add amount
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">Up to {MAX_PRESETS} buttons. Customers can also type any other amount. Leave no buttons to show only the &quot;Other amount&quot; box.</p>
                  {duplicates && <p className="mt-1 text-xs text-red-600">Two buttons have the same amount.</p>}
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Default tip (Rs.)</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="number" min={0} max={MAX_AMOUNT} inputMode="numeric" value={defaultTip} onChange={(e) => setDefaultTip(e.target.value)} disabled={!showTip} className={`input w-28 ${defaultValid ? "" : "!border-red-400"}`} aria-label="Default tip" />
                    {sortedAmounts.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setDefaultTip(String(a))}
                        disabled={!showTip}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${Number(defaultTip) === a ? "border-brand-red bg-red-50 text-brand-red" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}
                      >
                        Rs. {a}
                      </button>
                    ))}
                    <button type="button" onClick={() => setDefaultTip("0")} disabled={!showTip} className={`rounded-full border px-3 py-1 text-xs font-medium ${Number(defaultTip) === 0 ? "border-brand-red bg-red-50 text-brand-red" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>
                      No default
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    {defaultNum > 0 ? `A tip of Rs. ${defaultNum} is already added when the checkout opens. The customer can remove or change it.` : "No tip is added by default. The customer chooses one if they want to."}
                  </p>
                </div>
              </div>
            </Card>

            <Card n={3} title="Payment methods" description="The ways customers can pay at checkout. Change the name and icon of each, or switch one off. At least one must stay on.">
              <div className="grid gap-3 md:grid-cols-2">
              {([
                { key: "cod" as const, title: "Cash payment", note: "Cash on Delivery for delivery orders, Pay at Pickup for pickup orders. Not available for gift orders." },
                { key: "online" as const, title: "Online payment", note: "Card or wallet payment through the payment gateway." },
              ]).map(({ key, title, note }) => {
                const m = payments[key];
                const setM = (patch: Partial<Payments["cod"]> & Partial<Payments["online"]>) => setPayments((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
                const lastOn = m.enabled && !payments[key === "cod" ? "online" : "cod"].enabled;
                return (
                  <div key={key} className="rounded-lg border border-neutral-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{title}</p>
                        <p className="text-xs text-neutral-500">{note}</p>
                      </div>
                      <Switch checked={m.enabled} onCheckedChange={(v) => setM({ enabled: v })} disabled={lastOn} aria-label={`Show ${title} at checkout`} />
                    </div>
                    <div className={`mt-3 flex items-start gap-3 ${m.enabled ? "" : "opacity-50"}`}>
                      <div className="w-[104px] shrink-0"><ImageUploadField label="Icon" folder="restaurant" value={m.iconUrl ?? ""} onChange={(url) => setM({ iconUrl: url || null })} icon hint="Leave empty for the default icon" /></div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <label className="block text-xs font-medium text-neutral-500">
                          {key === "cod" ? "Name for delivery orders" : "Name"}
                          <input value={m.label} maxLength={40} onChange={(e) => setM({ label: e.target.value })} className="input mt-1 w-full" />
                        </label>
                        {key === "cod" && (
                          <label className="block text-xs font-medium text-neutral-500">
                            Name for pickup orders
                            <input value={payments.cod.pickupLabel} maxLength={40} onChange={(e) => setM({ pickupLabel: e.target.value })} className="input mt-1 w-full" />
                          </label>
                        )}
                        {m.iconUrl && (
                          <button type="button" onClick={() => setM({ iconUrl: null })} className="text-xs text-brand-red hover:underline">Use the default icon</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </Card>

            <Card
              n={4}
              title="Send as a Gift"
              description="The button that lets a customer send the order to someone else as a gift. Gifts are paid online, so they also need Online Payment to be on. Hidden means customers cannot place gift orders."
              right={<Switch checked={showGift} onCheckedChange={setShowGift} aria-label="Show the Send as a Gift button at checkout" />}
            >
              <StatusPill on={showGift} onText="Shown at checkout" offText="Hidden, no gift orders" />
              {showGift && !payments.online.enabled && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Online Payment is switched off, so customers will see the gift button but cannot use it. Switch Online Payment on in step 3, or hide the button here.</p>}
            </Card>
          </div>

          <aside className="xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-neutral-900">Live preview</p>
              <div className="mt-3 space-y-3 rounded-xl border border-neutral-200 bg-[#F2EFE9] p-3 text-xs">
                {showCoupon ? (
                  <div>
                    <p className="font-medium text-neutral-800">Coupon Code</p>
                    <div className="mt-1.5 flex gap-2">
                      <span className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-400">Enter coupon code</span>
                      <span className="rounded-lg border border-brand-red px-3 py-2 font-semibold text-brand-red">Apply</span>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-neutral-300 py-3 text-center text-neutral-400">Coupon box hidden</p>
                )}
                {showTip ? (
                  <div className="rounded-xl border border-neutral-200 bg-white p-3">
                    <p className="font-semibold text-neutral-800">Tip your rider <span className="font-normal text-neutral-400">(optional)</span></p>
                    {amounts.some((a) => a > 0) && (
                      <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${amounts.filter((a) => a > 0).length}, minmax(0, 1fr))` }}>
                        {amounts.filter((a) => a > 0).map((a, i) => (
                          <span key={i} className={`rounded-md border px-2 py-2 text-center font-semibold ${defaultNum === a ? "border-brand-red bg-brand-red text-white" : "border-neutral-200 bg-neutral-50 text-neutral-800"}`}>Rs. {a}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-1.5 flex gap-1.5">
                      <span className="flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-400">{defaultNum > 0 && !amounts.includes(defaultNum) ? `Rs. ${defaultNum} added` : "Other amount"}</span>
                      <span className="rounded-md bg-brand-red px-3 py-2 font-semibold text-white">Add</span>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-neutral-300 py-3 text-center text-neutral-400">Tip box hidden</p>
                )}
              </div>
              <div className="mt-3 rounded-xl border border-neutral-200 bg-[#F2EFE9] p-3 text-xs">
                <p className="mb-2 font-medium text-neutral-800">Payment Method</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { m: payments.cod, label: payments.cod.label },
                    { m: payments.online, label: payments.online.label },
                  ]).filter((x) => x.m.enabled).map((x, i) => (
                    <span key={i} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 font-medium text-neutral-800">
                      {x.m.iconUrl ? <img src={x.m.iconUrl} alt="" className="h-5 w-5 object-contain" /> : <span className="h-5 w-5 rounded bg-neutral-200" />}
                      <span className="truncate">{x.label}</span>
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-neutral-400">A simplified preview of the checkout page.</p>
            </div>
          </aside>

          <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg xl:col-span-2">
            <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving || !dirty}>
              {saving ? <LoadingDots>Saving</LoadingDots> : "Save Changes"}
            </button>
            <button type="button" onClick={reset} disabled={!dirty || saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
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
