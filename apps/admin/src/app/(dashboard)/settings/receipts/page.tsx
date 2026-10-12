"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { ImageUploadField } from "../../../../components/ImageUploadField";
import { CustomerReceiptBody, type ReceiptData } from "../../../../components/receipt/CustomerReceiptBody";

type MsgKey = "dineIn" | "takeaway" | "walkIn" | "delivery" | "preBill";
const MESSAGE_TYPES: { key: MsgKey; label: string; hint: string; placeholder: string }[] = [
  { key: "dineIn", label: "Dine-in receipt", hint: "Final bill after a table pays.", placeholder: "Thanks for dining with us!" },
  { key: "takeaway", label: "Takeaway receipt", hint: "Orders collected at the counter.", placeholder: "Thank you for your takeaway order!" },
  { key: "walkIn", label: "Walk-in receipt", hint: "Quick counter sales.", placeholder: "Thank you for visiting us!" },
  { key: "delivery", label: "Delivery receipt", hint: "Orders sent out with a rider.", placeholder: "Thank you for ordering from us!" },
  { key: "preBill", label: "Pre-payment bill", hint: "Shown to dine-in guests before they pay.", placeholder: "Thank you for dining with us!" },
];
const EMPTY_MESSAGES: Record<MsgKey, string> = { dineIn: "", takeaway: "", walkIn: "", delivery: "", preBill: "" };

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
  receiptMessages: Partial<Record<MsgKey, string>>;
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
/** Sample order for the customer receipt preview. It is drawn by the same component as the real printed receipt. */
function sampleReceipt(
  type: MsgKey,
  r: { name: string; logoUrl: string; taxNumber: string; phone: string; thankYouMessage: string; footerText: string; messages: Record<MsgKey, string> },
): ReceiptData {
  const delivery = type === "delivery";
  const dineIn = type === "dineIn" || type === "preBill";
  const items = [
    { id: "1", nameSnapshot: "Chicken Tikka Pizza", quantity: 1, unitPrice: 129000, lineTotal: 129000, specialInstructions: null, orderRevisionId: null, choices: [{ nameSnapshot: "Large", priceAdjustmentSnapshot: 0 }], addons: [{ nameSnapshot: "Cheese Burst Crust", priceSnapshot: 0, quantity: 1 }], dealSlots: [] },
    { id: "2", nameSnapshot: "Coke 1.5L", quantity: 2, unitPrice: 25000, lineTotal: 50000, specialInstructions: null, orderRevisionId: null, choices: [], addons: [], dealSlots: [] },
  ];
  const subtotal = 179000;
  const taxAmount = Math.round(subtotal * 0.15);
  const deliveryFee = delivery ? 15000 : 0;
  const grandTotal = subtotal + taxAmount + deliveryFee;
  return {
    operator: delivery ? null : "Ali",
    coupon: null,
    restaurant: {
      name: r.name || "Your Restaurant",
      logoUrl: r.logoUrl || null,
      taxNumber: r.taxNumber || null,
      currency: "PKR",
      contactPhone: r.phone || null,
      contactEmail: null,
      socialLinks: null,
      footerText: r.footerText || null,
      thankYouMessage: r.thankYouMessage || null,
      messages: r.messages,
    },
    order: {
      id: "sample",
      orderNumber: "ORD-20260101-0123",
      orderCode: "A1B2C3",
      dailyNo: 12,
      type: dineIn ? "DINE_IN" : type === "takeaway" ? "TAKEAWAY" : type === "walkIn" ? "WALK_IN" : "ONLINE_DELIVERY",
      source: "POS",
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
      contactName: "Sample Customer",
      contactPhone: "0300 1234567",
      contactEmail: null,
      deliveryAddressSnapshot: delivery ? "House 12, Street 5" : null,
      deliveryArea: delivery ? "DHA Phase 6" : null,
      deliveryCity: delivery ? "Karachi" : null,
      deliveryLandmark: delivery ? "Near the main park" : null,
      contactAlternatePhone: null,
      specialInstructions: null,
      subtotal,
      taxAmount,
      deliveryFee,
      discountAmount: 0,
      couponCode: null,
      couponDiscountAmount: 0,
      loyaltyDiscountAmount: 0,
      loyaltyPointsRedeemed: 0,
      grandTotal,
      tipAmount: 0,
      paymentMethod: delivery ? "COD" : "CASH",
      paymentStatus: type === "preBill" || delivery ? "PENDING" : "PAID",
      branch: { name: "DHA Branch", address: "Plot 12, Phase 6, DHA, Karachi", phone: r.phone || "021 1234567" },
      table: dineIn ? { number: "4", name: null } : null,
      customer: null,
      payments: type === "preBill" || delivery ? [] : [{ id: "p1", method: "CASH", status: "PAID", amount: grandTotal, amountTendered: Math.ceil(grandTotal / 100000) * 100000 }],
      items,
    },
  };
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
  const [messages, setMessages] = useState<Record<MsgKey, string>>(EMPTY_MESSAGES);
  const [previewType, setPreviewType] = useState<MsgKey>("dineIn");
  const [footerText, setFooterText] = useState("");
  const [kitchenHeader, setKitchenHeader] = useState("");
  const [kitchenFooter, setKitchenFooter] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  const snapshot = useMemo(
    () => JSON.stringify({ receiptLogoUrl, taxNumber, thankYouMessage, messages, footerText, kitchenHeader, kitchenFooter }),
    [receiptLogoUrl, taxNumber, thankYouMessage, messages, footerText, kitchenHeader, kitchenFooter],
  );
  const dirty = saved !== "" && snapshot !== saved;
  const customerDirty = useMemo(() => {
    if (!saved) return false;
    const s = JSON.parse(saved);
    return s.receiptLogoUrl !== receiptLogoUrl || s.taxNumber !== taxNumber || s.thankYouMessage !== thankYouMessage || JSON.stringify(s.messages) !== JSON.stringify(messages) || s.footerText !== footerText;
  }, [saved, receiptLogoUrl, taxNumber, thankYouMessage, messages, footerText]);
  const kitchenDirty = dirty && (() => { const s = JSON.parse(saved); return s.kitchenHeader !== kitchenHeader || s.kitchenFooter !== kitchenFooter; })();

  useEffect(() => {
    if (!restaurant) return;
    const next = {
      receiptLogoUrl: restaurant.receiptLogoUrl ?? "",
      taxNumber: restaurant.receiptTaxNumber ?? "",
      thankYouMessage: restaurant.receiptThankYouMessage ?? "",
      messages: { ...EMPTY_MESSAGES, ...(restaurant.receiptMessages ?? {}) },
      footerText: restaurant.receiptFooterText ?? "",
      kitchenHeader: restaurant.kitchenReceiptHeaderText ?? "",
      kitchenFooter: restaurant.kitchenReceiptFooterText ?? "",
    };
    setReceiptLogoUrl(next.receiptLogoUrl);
    setTaxNumber(next.taxNumber);
    setThankYouMessage(next.thankYouMessage);
    setMessages(next.messages);
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
    setMessages(s.messages);
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
        receiptMessages: Object.fromEntries(MESSAGE_TYPES.map((t) => [t.key, messages[t.key].trim()])),
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
                          <p className="text-xs font-medium text-neutral-500">Tax / registration line</p>
                          <Counter value={taxNumber} max={LIMITS.tax} />
                        </div>
                        <input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value.slice(0, LIMITS.tax))} placeholder="e.g. SNTN# 1234567-8" className="input w-full" />
                        <p className="mt-1 text-xs text-neutral-400">Printed on the bill exactly as you type it, so include the prefix: SNTN# 1234567-8 or NTN# 1234567-8. Leave empty to hide.</p>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard n={2} title="Thank-you messages" description="Each receipt type can say something different. Leave one empty to use the general message.">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-medium text-neutral-500">General message (used when a type below is empty)</p>
                      <Counter value={thankYouMessage} max={LIMITS.thanks} />
                    </div>
                    <input value={thankYouMessage} onChange={(e) => setThankYouMessage(e.target.value.slice(0, LIMITS.thanks))} placeholder="Thank you for dining with us!" className="input w-full" />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {THANK_YOU_IDEAS.map((idea) => (
                        <button key={idea} type="button" onClick={() => setThankYouMessage(idea)} className="rounded-lg border border-neutral-300 px-2.5 py-1 text-[11px] text-neutral-600 hover:border-brand-red hover:text-brand-red">
                          {idea}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-neutral-100 pt-3">
                    {MESSAGE_TYPES.map((t) => (
                      <div key={t.key}>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-medium text-neutral-500">{t.label} <span className="font-normal text-neutral-400">· {t.hint}</span></p>
                          <Counter value={messages[t.key]} max={LIMITS.thanks} />
                        </div>
                        <input
                          value={messages[t.key]}
                          onChange={(e) => setMessages((m) => ({ ...m, [t.key]: e.target.value.slice(0, LIMITS.thanks) }))}
                          onFocus={() => setPreviewType(t.key)}
                          placeholder={thankYouMessage.trim() ? `Uses the general message` : t.placeholder}
                          className="input w-full"
                        />
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard n={3} title="Footer text" description="Small print under the thank-you message on every customer receipt, e.g. your website.">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-medium text-neutral-500">Footer text</p>
                      <Counter value={footerText} max={LIMITS.footer} />
                    </div>
                    <textarea value={footerText} onChange={(e) => setFooterText(e.target.value.slice(0, LIMITS.footer))} placeholder="www.yourrestaurant.com" className="input w-full" rows={3} />
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
              {tab === "customer" && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {MESSAGE_TYPES.map((t) => (
                    <button key={t.key} type="button" onClick={() => setPreviewType(t.key)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${previewType === t.key ? "border-brand-red bg-red-50 text-brand-red" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>
                      {t.label.replace(" receipt", "").replace("Pre-payment bill", "Pre-bill")}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 rounded-lg bg-neutral-100 px-3 py-5">
                <div className={`mx-auto bg-white p-4 shadow-md ${paper === "58" ? "max-w-[250px]" : "max-w-[340px]"}`} style={{ borderRadius: 2 }}>
                  {tab === "customer" ? (
                    <div className="receipt-preview -m-4">
                      <CustomerReceiptBody
                        isPre={previewType === "preBill"}
                        data={sampleReceipt(previewType, { name: restaurant?.name ?? "", logoUrl: previewLogo, taxNumber, phone: restaurant?.contactPhone ?? "", thankYouMessage, footerText, messages })}
                      />
                    </div>
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
