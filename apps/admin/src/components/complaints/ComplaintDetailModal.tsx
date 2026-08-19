"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPaisa } from "@restaurant/utils";
import { api, ApiError } from "../../lib/api";
import { useMe, hasPermission } from "../../lib/useMe";
import { OrderDetailModal } from "../orders/OrderDetailModal";
import { CloseIcon } from "../icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "../../store/useToastStore";

export const CATEGORY_LABEL: Record<string, string> = {
  FOOD_QUALITY: "Food Quality",
  WRONG_ITEM: "Wrong Item",
  MISSING_ITEM: "Missing Item",
  LATE_DELIVERY: "Late Delivery",
  BRANCH_ISSUE: "Branch Issue",
  STAFF_BEHAVIOUR: "Staff Behaviour",
  PAYMENT_ISSUE: "Payment Issue",
  ORDER_ISSUE: "Order Issue",
  PACKAGING_ISSUE: "Packaging Issue",
  OTHER: "Other",
};
export const ORDER_TYPE_LABEL: Record<string, string> = {
  DELIVERY: "Delivery",
  PICKUP: "Pickup",
  TAKEAWAY: "Takeaway",
  DINE_IN: "Dine-In",
};
const STATUSES = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"];

type ComplaintDetail = {
  id: string;
  complaintNumber: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  orderId: string | null;
  orderNumberInput: string | null;
  orderType: string | null;
  customer: { name: string; phone: string; email: string } | null;
  branch: { name: string; city: string; area: string } | null;
  order: { orderNumber: string; type: string; status: string; grandTotal: number; createdAt: string } | null;
  attachments: Array<{ id: string; url: string }>;
};

type HistoryEntry = {
  id: string;
  action: string;
  oldValue: { status?: string } | null;
  newValue: { status?: string } | null;
  createdAt: string;
  staffUser: { name: string } | null;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ComplaintDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canResolve = hasPermission(me, "complaints.resolve");

  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: detail } = useQuery({
    queryKey: ["staff-complaint", id],
    queryFn: () => api.get<ComplaintDetail>(`/staff/complaints/${id}`),
  });
  const { data: history } = useQuery({
    queryKey: ["staff-complaint-history", id],
    queryFn: () => api.get<HistoryEntry[]>(`/staff/complaints/${id}/history`),
  });

  async function setStatus(status: string) {
    try {
      await api.patch(`/staff/complaints/${id}/status`, { status });
      await queryClient.invalidateQueries({ queryKey: ["staff-complaint", id] });
      await queryClient.invalidateQueries({ queryKey: ["staff-complaint-history", id] });
      await queryClient.invalidateQueries({ queryKey: ["staff-complaints"] });
      toast.success("Status updated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update status");
    }
  }

  const contactName = detail?.contactName ?? detail?.customer?.name ?? "Guest";
  const contactPhone = detail?.contactPhone ?? detail?.customer?.phone;
  const contactEmail = detail?.contactEmail ?? detail?.customer?.email;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
            <div>
              <p className="text-base font-semibold text-neutral-900">{detail?.complaintNumber ?? "Loading..."}</p>
              {detail && <p className="text-xs text-neutral-400">{detail.subject}</p>}
            </div>
            <div className="flex items-center gap-2">
              {detail && (
                <Select value={detail.status} onValueChange={setStatus} disabled={!canResolve}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <button onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
                <CloseIcon size={14} />
              </button>
            </div>
          </div>

          {detail && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-sm">
              <div className="rounded-lg border border-brand-red/20 bg-brand-red/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-red">Customer</p>
                <p className="mt-1 font-medium text-neutral-900">{contactName}</p>
                {contactPhone && <p><a href={`tel:${contactPhone}`} className="hover:underline">{contactPhone}</a></p>}
                {contactEmail && <p><a href={`mailto:${contactEmail}`} className="hover:underline">{contactEmail}</a></p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-neutral-200 p-3">
                  <p className="text-xs font-semibold uppercase text-neutral-500">Location</p>
                  <p className="mt-1 text-neutral-700">{detail.branch?.city ?? "—"}</p>
                  <p className="text-neutral-700">{detail.branch?.name ?? "—"}{detail.branch?.area ? ` · ${detail.branch.area}` : ""}</p>
                </div>
                <div className="rounded-lg border border-neutral-200 p-3">
                  <p className="text-xs font-semibold uppercase text-neutral-500">Order</p>
                  {detail.order ? (
                    <>
                      <button onClick={() => setDetailOrderId(detail.orderId)} className="mt-1 font-medium text-brand-red hover:underline">
                        {detail.order.orderNumber}
                      </button>
                      <p className="text-neutral-700">{detail.order.type.replace(/_/g, " ")} · {detail.order.status}</p>
                      <p className="text-neutral-700">{formatPaisa(detail.order.grandTotal)}</p>
                    </>
                  ) : detail.orderNumberInput ? (
                    <>
                      <p className="mt-1 text-neutral-700">{detail.orderNumberInput}</p>
                      <p className="text-xs text-amber-600">Not verified against an order record</p>
                    </>
                  ) : (
                    <p className="mt-1 text-neutral-400">Not order-related</p>
                  )}
                  {detail.orderType && <p className="mt-0.5 text-xs text-neutral-500">{ORDER_TYPE_LABEL[detail.orderType] ?? detail.orderType}</p>}
                </div>
              </div>

              <div className="rounded-lg border border-neutral-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-neutral-500">Complaint</p>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{CATEGORY_LABEL[detail.category] ?? detail.category}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-neutral-700">{detail.description}</p>
                <p className="mt-1.5 text-xs text-neutral-400">Submitted {formatDateTime(detail.createdAt)}</p>
              </div>

              {detail.attachments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-neutral-500">Attachments</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {detail.attachments.map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={a.id}
                        src={a.url}
                        alt="Complaint attachment"
                        onClick={() => setLightboxUrl(a.url)}
                        className="h-20 w-20 cursor-zoom-in rounded-lg border border-neutral-200 object-cover hover:opacity-80"
                      />
                    ))}
                  </div>
                </div>
              )}

              {history && history.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-neutral-500">Status History</p>
                  <div className="mt-1.5 space-y-1.5 border-l-2 border-neutral-200 pl-3">
                    {history.map((h) => (
                      <div key={h.id} className="text-xs">
                        <span className="font-medium text-neutral-700">
                          {h.oldValue?.status ? `${h.oldValue.status} → ` : ""}{h.newValue?.status ?? h.action}
                        </span>
                        <span className="text-neutral-400"> · {h.staffUser?.name ?? "System"} · {formatDateTime(h.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {detailOrderId && (
        <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} onNavigateReceipt={(orderId) => router.push(`/pos/receipt/${orderId}`)} />
      )}

      {lightboxUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setLightboxUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Complaint attachment" className="max-h-full max-w-full rounded-lg object-contain" />
          <button
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-900 hover:bg-white"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}
    </>
  );
}
