"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { ImageUploadField } from "../../../../components/ImageUploadField";

type RestaurantInfo = {
  name: string;
  logoUrl: string | null;
  receiptLogoUrl: string | null;
  receiptTaxNumber: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  receiptFooterText: string | null;
  receiptThankYouMessage: string | null;
  kitchenReceiptHeaderText: string | null;
  kitchenReceiptFooterText: string | null;
};

const LIMITS = { tax: 60, thanks: 200, footer: 500, kitchenHeader: 200, kitchenFooter: 200 };
const THANK_YOU_IDEAS = ["Thank you for dining with us!", "Thank you! Visit us again soon.", "We hope you enjoyed your meal!", "Shukriya! Phir milenge."];

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

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={`text-[11px] ${value.length > max * 0.9 ? "text-amber-600" : "text-neutral-400"}`}>{value.length}/{max}</span>;
}

// Sample line items so the preview looks like a real receipt without needing a real order.
const PREVIEW_ITEMS = [
  { name: "Chicken Tikka Pizza", qty: 1, price: 129000, note: "Cheese Burst Crust" },
  { name: "Coke 1.5L", qty: 2, price: 25000 },
];
const PREVIEW_SUBTOTAL = PREVIEW_ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
const PREVIEW_TAX = Math.round(PREVIEW_SUBTOTAL * 0.05);
const PREVIEW_TOTAL = PREVIEW_SUBTOTAL + PREVIEW_TAX;

function ReceiptPreview({ logoUrl, name, taxNumber, phone, thankYouMessage, footerText }: { logoUrl: string; name: string; taxNumber: string; phone: string; thankYouMessage: string; footerText: string }) {
  return (
    <div className="font-mono text-sm">
      <div className="text-center">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="mx-auto mb-2 h-12 w-12 object-contain" />
        )}
        <p className="text-base font-bold">{name || "Your Restaurant"}</p>
        <p className="text-xs text-neutral-600">DHA Branch, Karachi</p>
        {phone && <p className="text-xs text-neutral-600">{phone}</p>}
        {taxNumber && <p className="text-xs text-neutral-500">Tax #: {taxNumber}</p>}
      </div>
      <div className="my-3 border-t border-dashed border-neutral-300" />
      <div className="space-y-0.5 text-xs">
        <p>Order #: POS-000123</p>
        <p>Date: {new Date().toLocaleString()}</p>
        <p>Customer: Sample Customer</p>
      </div>
      <div className="my-3 border-t border-dashed border-neutral-300" />
      <div className="space-y-2">
        {PREVIEW_ITEMS.map((item) => (
          <div key={item.name}>
            <div className="flex justify-between gap-2 text-xs">
              <span>{item.qty}x {item.name}</span>
              <span className="shrink-0">{formatPaisa(item.price * item.qty)}</span>
            </div>
            {item.note && <p className="pl-3 text-[11px] text-neutral-500">+ {item.note}</p>}
          </div>
        ))}
      </div>
      <div className="my-3 border-t border-dashed border-neutral-300" />
      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatPaisa(PREVIEW_SUBTOTAL)}</span></div>
        <div className="flex justify-between"><span>Tax</span><span>{formatPaisa(PREVIEW_TAX)}</span></div>
        <div className="flex justify-between border-t border-neutral-300 pt-1 text-sm font-bold"><span>Grand Total</span><span>{formatPaisa(PREVIEW_TOTAL)}</span></div>
      </div>
      {(thankYouMessage || footerText) && (
        <>
          <div className="my-3 border-t border-dashed border-neutral-300" />
          <div className="text-center text-xs text-neutral-600">
            {thankYouMessage && <p className="font-medium">{thankYouMessage}</p>}
            {footerText && <p className="mt-1 whitespace-pre-line">{footerText}</p>}
          </div>
        </>
      )}
    </div>
  );
}

function KitchenTicketPreview({ headerText, restaurantName, footerText }: { headerText: string; restaurantName: string; footerText: string }) {
  return (
    <div className="font-mono text-sm">
      <p className="text-center text-base font-bold">{headerText || restaurantName || "Kitchen Copy"}</p>
      <div className="my-3 border-t border-dashed border-neutral-300" />
      <div className="space-y-0.5 text-xs">
        <p>Order #: POS-000123</p>
        <p>Type: DINE IN</p>
        <p>Table: 4</p>
      </div>
      <div className="my-3 border-t border-dashed border-neutral-300" />
      <div className="space-y-1 text-xs">
        {PREVIEW_ITEMS.map((item) => (
          <p key={item.name}>{item.qty}x {item.name}{item.note ? ` (${item.note})` : ""}</p>
        ))}
      </div>
      {footerText && (
        <>
          <div className="my-3 border-t border-dashed border-neutral-300" />
          <p className="text-center text-xs text-neutral-600">{footerText}</p>
        </>
      )}
    </div>
  );
}

export default function ReceiptSettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "settings.manage");

  const { data: restaurant } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<RestaurantInfo>("/cms/restaurant") });

  const [tab, setTab] = useState<"customer" | "kitchen">("customer");
  const [paper, setPaper] = useState<"58" | "80">("80");
  const [receiptLogoUrl, setReceiptLogoUrl] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [thankYouMessage, setThankYouMessage] = useState("");
  const [footerText, setFooterText] = useState("");
  const [kitchenHeader, setKitchenHeader] = useState("");
  const [kitchenFooter, setKitchenFooter] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  const snapshot = useMemo(
    () => JSON.stringify({ receiptLogoUrl, taxNumber, thankYouMessage, footerText, kitchenHeader, kitchenFooter }),
    [receiptLogoUrl, taxNumber, thankYouMessage, footerText, kitchenHeader, kitchenFooter],
  );
  const dirty = saved !== "" && snapshot !== saved;
  const customerDirty = useMemo(() => {
    if (!saved) return false;
    const s = JSON.parse(saved);
    return s.receiptLogoUrl !== receiptLogoUrl || s.taxNumber !== taxNumber || s.thankYouMessage !== thankYouMessage || s.footerText !== footerText;
  }, [saved, receiptLogoUrl, taxNumber, thankYouMessage, footerText]);
  const kitchenDirty = dirty && (() => { const s = JSON.parse(saved); return s.kitchenHeader !== kitchenHeader || s.kitchenFooter !== kitchenFooter; })();

  useEffect(() => {
    if (!restaurant) return;
    const next = {
      receiptLogoUrl: restaurant.receiptLogoUrl ?? "",
      taxNumber: restaurant.receiptTaxNumber ?? "",
      thankYouMessage: restaurant.receiptThankYouMessage ?? "",
      footerText: restaurant.receiptFooterText ?? "",
      kitchenHeader: restaurant.kitchenReceiptHeaderText ?? "",
      kitchenFooter: restaurant.kitchenReceiptFooterText ?? "",
    };
    setReceiptLogoUrl(next.receiptLogoUrl);
    setTaxNumber(next.taxNumber);
    setThankYouMessage(next.thankYouMessage);
    setFooterText(next.footerText);
    setKitchenHeader(next.kitchenHeader);
    setKitchenFooter(next.kitchenFooter);
    setSaved(JSON.stringify(next));
  }, [restaurant]);

  function reset() {
    if (!saved) return;
    const s = JSON.parse(saved);
    setReceiptLogoUrl(s.receiptLogoUrl);
    setTaxNumber(s.taxNumber);
    setThankYouMessage(s.thankYouMessage);
    setFooterText(s.footerText);
    setKitchenHeader(s.kitchenHeader);
    setKitchenFooter(s.kitchenFooter);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", {
        receiptLogoUrl: receiptLogoUrl || null,
        receiptTaxNumber: taxNumber.trim() || null,
        receiptThankYouMessage: thankYouMessage.trim() || null,
        receiptFooterText: footerText.trim() || null,
        kitchenReceiptHeaderText: kitchenHeader.trim() || null,
        kitchenReceiptFooterText: kitchenFooter.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] });
      toast.success("Receipt settings saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save receipt settings");
    } finally {
      setSaving(false);
    }
  }

  const previewLogo = receiptLogoUrl || restaurant?.logoUrl || "";

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Receipts</h1>
      <p className="mt-1 text-sm text-neutral-500">
        What prints on customer receipts and kitchen tickets from the POS. The restaurant name and phone come from{" "}
        <Link href="/settings/header" className="font-medium underline">Header &amp; Branding</Link>; branch name, address and phone come from each branch.
      </p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <div className="mt-5 grid max-w-md grid-cols-2 gap-2">
        {(
          [
            ["customer", "Customer receipt", customerDirty],
            ["kitchen", "Kitchen ticket", kitchenDirty],
          ] as ["customer" | "kitchen", string, boolean][]
        ).map(([key, label, d]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${tab === key ? "border-brand-red bg-red-50 text-brand-red" : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"}`}
          >
            {label}
            {d && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Unsaved</span>}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={!canManage} className="grid grid-cols-1 gap-5 disabled:opacity-70 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            {tab === "customer" ? (
              <>
                <SectionCard n={1} title="Logo & registration" description="Printed at the top of the customer receipt.">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[190px_1fr]">
                    <ImageUploadField label="Receipt logo" folder="restaurant" value={receiptLogoUrl} onChange={setReceiptLogoUrl} shape="square" hint="Black & white prints cleanest" />
                    <div className="space-y-3">
                      <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                        {receiptLogoUrl ? "Using this receipt logo." : restaurant?.logoUrl ? "No receipt logo set, so your header logo is used." : "No logo set, so receipts print without one."}
                        {" "}A simple black &amp; white mark usually looks best on a thermal printer.
                      </p>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-medium text-neutral-500">Tax / registration number</p>
                          <Counter value={taxNumber} max={LIMITS.tax} />
                        </div>
                        <input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value.slice(0, LIMITS.tax))} placeholder="e.g. NTN 1234567-8" className="input w-full" />
                        <p className="mt-1 text-xs text-neutral-400">Printed under the restaurant name. Leave empty to hide.</p>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard n={2} title="Closing message" description="Shown at the bottom of every customer receipt.">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-medium text-neutral-500">Thank-you message</p>
                      <Counter value={thankYouMessage} max={LIMITS.thanks} />
                    </div>
                    <input value={thankYouMessage} onChange={(e) => setThankYouMessage(e.target.value.slice(0, LIMITS.thanks))} placeholder="Thank you for dining with us!" className="input w-full" />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {THANK_YOU_IDEAS.map((idea) => (
                        <button key={idea} type="button" onClick={() => setThankYouMessage(idea)} className="rounded-full border border-neutral-300 px-2.5 py-1 text-[11px] text-neutral-600 hover:border-brand-red hover:text-brand-red">
                          {idea}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-medium text-neutral-500">Footer text</p>
                      <Counter value={footerText} max={LIMITS.footer} />
                    </div>
                    <textarea value={footerText} onChange={(e) => setFooterText(e.target.value.slice(0, LIMITS.footer))} placeholder="Return policy, website, social handle or any closing note" className="input w-full" rows={3} />
                  </div>
                </SectionCard>
              </>
            ) : (
              <SectionCard n={1} title="Kitchen ticket text" description="Keep it short: kitchen staff need preparation info, not marketing copy.">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-500">Header text</p>
                    <Counter value={kitchenHeader} max={LIMITS.kitchenHeader} />
                  </div>
                  <input value={kitchenHeader} onChange={(e) => setKitchenHeader(e.target.value.slice(0, LIMITS.kitchenHeader))} placeholder="e.g. Kitchen Copy" className="input w-full" />
                  <p className="mt-1 text-xs text-neutral-400">If empty, the restaurant name is printed.</p>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-500">Footer text</p>
                    <Counter value={kitchenFooter} max={LIMITS.kitchenFooter} />
                  </div>
                  <input value={kitchenFooter} onChange={(e) => setKitchenFooter(e.target.value.slice(0, LIMITS.kitchenFooter))} placeholder="Optional, e.g. Check allergies before serving" className="input w-full" />
                </div>
              </SectionCard>
            )}
          </div>

          <aside className="xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">Live preview</p>
                <div className="flex overflow-hidden rounded-lg border border-neutral-300 text-[11px] font-medium">
                  {(["58", "80"] as const).map((w) => (
                    <button key={w} type="button" onClick={() => setPaper(w)} className={`px-2.5 py-1 ${paper === w ? "bg-brand-red text-white" : "bg-white text-neutral-600"}`}>
                      {w} mm
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-neutral-100 px-3 py-5">
                <div className={`mx-auto bg-white p-4 shadow-md ${paper === "58" ? "max-w-[230px]" : "max-w-[320px]"}`} style={{ borderRadius: 2 }}>
                  {tab === "customer" ? (
                    <ReceiptPreview logoUrl={previewLogo} name={restaurant?.name ?? ""} taxNumber={taxNumber} phone={restaurant?.contactPhone ?? ""} thankYouMessage={thankYouMessage} footerText={footerText} />
                  ) : (
                    <KitchenTicketPreview headerText={kitchenHeader} restaurantName={restaurant?.name ?? ""} footerText={kitchenFooter} />
                  )}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-neutral-400">Sample order data. Paper width only changes this preview; the printer decides the real width.</p>
            </div>
          </aside>

          <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg xl:col-span-2">
            <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving || !dirty}>
              {saving ? "Saving..." : "Save Changes"}
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
