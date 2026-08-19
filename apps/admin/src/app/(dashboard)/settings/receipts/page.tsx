"use client";

import { useEffect, useState } from "react";
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

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

// Sample line items so the preview looks like a real receipt without needing a real order.
const PREVIEW_ITEMS = [
  { name: "Chicken Tikka Pizza", qty: 1, price: 129000, note: "Cheese Burst Crust" },
  { name: "Coke 1.5L", qty: 2, price: 25000 },
];
const PREVIEW_SUBTOTAL = PREVIEW_ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
const PREVIEW_TAX = Math.round(PREVIEW_SUBTOTAL * 0.05);
const PREVIEW_TOTAL = PREVIEW_SUBTOTAL + PREVIEW_TAX;

function ReceiptPreview({
  logoUrl,
  name,
  taxNumber,
  phone,
  thankYouMessage,
  footerText,
}: {
  logoUrl: string;
  name: string;
  taxNumber: string;
  phone: string;
  thankYouMessage: string;
  footerText: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 font-mono text-sm shadow-sm">
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
            <div className="flex justify-between text-xs">
              <span>{item.qty}x {item.name}</span>
              <span>{formatPaisa(item.price * item.qty)}</span>
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
            {footerText && <p className="mt-1">{footerText}</p>}
          </div>
        </>
      )}
    </div>
  );
}

function KitchenTicketPreview({ headerText, restaurantName, footerText }: { headerText: string; restaurantName: string; footerText: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 font-mono text-sm shadow-sm">
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

  const [receiptLogoUrl, setReceiptLogoUrl] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [thankYouMessage, setThankYouMessage] = useState("");
  const [footerText, setFooterText] = useState("");
  const [kitchenHeader, setKitchenHeader] = useState("");
  const [kitchenFooter, setKitchenFooter] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurant) return;
    setReceiptLogoUrl(restaurant.receiptLogoUrl ?? "");
    setTaxNumber(restaurant.receiptTaxNumber ?? "");
    setThankYouMessage(restaurant.receiptThankYouMessage ?? "");
    setFooterText(restaurant.receiptFooterText ?? "");
    setKitchenHeader(restaurant.kitchenReceiptHeaderText ?? "");
    setKitchenFooter(restaurant.kitchenReceiptFooterText ?? "");
  }, [restaurant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/cms/restaurant", {
        receiptLogoUrl: receiptLogoUrl || null,
        receiptTaxNumber: taxNumber || null,
        receiptThankYouMessage: thankYouMessage || null,
        receiptFooterText: footerText || null,
        kitchenReceiptHeaderText: kitchenHeader || null,
        kitchenReceiptFooterText: kitchenFooter || null,
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
        Branding for customer and kitchen receipts printed from the POS. Restaurant name and phone are reused from{" "}
        <span className="font-medium">Website → Header &amp; Branding</span>; branch name/address/phone come from each branch automatically.
      </p>

      {!canManage && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have view-only access to settings. Ask an admin for the &quot;settings.manage&quot; permission to make changes.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={submit}>
          <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-70">
            <SettingsCard
              title="Receipt Logo"
              description="Optional; falls back to your header logo if left empty. A simplified black & white mark often prints cleanest on a thermal receipt printer."
            >
              <ImageUploadField label="Receipt Logo" folder="restaurant" value={receiptLogoUrl} onChange={setReceiptLogoUrl} />
            </SettingsCard>

            <SettingsCard title="Tax / Registration Number" description="Printed under the restaurant name on the customer receipt, if provided.">
              <input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="e.g. NTN 1234567-8" className="input w-full" />
            </SettingsCard>

            <SettingsCard title="Customer Receipt" description="Shown at the bottom of the printed customer receipt.">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Thank You Message</p>
                <input value={thankYouMessage} onChange={(e) => setThankYouMessage(e.target.value)} placeholder="Thank you for dining with us!" className="input w-full" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Footer Text</p>
                <textarea value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Terms, return policy, or any closing note" className="input w-full" rows={3} />
              </div>
            </SettingsCard>

            <SettingsCard title="Kitchen Ticket" description="Shown on the kitchen ticket, so keep this short: kitchen staff need prep info, not marketing copy.">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Header Text</p>
                <input value={kitchenHeader} onChange={(e) => setKitchenHeader(e.target.value)} placeholder="e.g. Kitchen Copy" className="input w-full" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Footer Text</p>
                <input value={kitchenFooter} onChange={(e) => setKitchenFooter(e.target.value)} className="input w-full" />
              </div>
            </SettingsCard>

            <button className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </fieldset>
        </form>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Live Preview</p>
          <div className="space-y-4">
            <ReceiptPreview
              logoUrl={previewLogo}
              name={restaurant?.name ?? ""}
              taxNumber={taxNumber}
              phone={restaurant?.contactPhone ?? ""}
              thankYouMessage={thankYouMessage}
              footerText={footerText}
            />
            <KitchenTicketPreview headerText={kitchenHeader} restaurantName={restaurant?.name ?? ""} footerText={kitchenFooter} />
          </div>
          <p className="mt-2 text-xs text-neutral-400">Preview uses sample order data; layout matches the real printed receipt.</p>
        </div>
      </div>

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
