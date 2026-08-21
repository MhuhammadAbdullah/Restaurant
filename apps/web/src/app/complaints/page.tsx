"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { useLocationStore } from "../../store/useLocationStore";
import { ComplaintImageUpload } from "../../components/ComplaintImageUpload";
import { SkeletonTransactionRow } from "../../components/skeletons";
import type { Branch } from "../../lib/types";

type Complaint = {
  id: string;
  complaintNumber: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
};

const CATEGORIES = [
  { value: "FOOD_QUALITY", label: "Food Quality" },
  { value: "WRONG_ITEM", label: "Wrong Item" },
  { value: "MISSING_ITEM", label: "Missing Item" },
  { value: "LATE_DELIVERY", label: "Late Delivery" },
  { value: "BRANCH_ISSUE", label: "Branch Issue" },
  { value: "STAFF_BEHAVIOUR", label: "Staff Behaviour" },
  { value: "PAYMENT_ISSUE", label: "Payment Issue" },
  { value: "ORDER_ISSUE", label: "Order Issue" },
  { value: "PACKAGING_ISSUE", label: "Packaging Issue" },
  { value: "OTHER", label: "Other" },
];

const ORDER_TYPES = [
  { value: "DELIVERY", label: "Delivery" },
  { value: "PICKUP", label: "Pickup" },
  { value: "TAKEAWAY", label: "Takeaway" },
  { value: "DINE_IN", label: "Dine-In" },
];

/** Backend expects strictly 03XXXXXXXXX — strip dashes/spaces/parens users naturally type. */
function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function describeApiError(e: ApiError): string {
  const fieldErrors = (e.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
  if (fieldErrors) {
    const first = Object.entries(fieldErrors).find(([, msgs]) => msgs.length > 0);
    if (first) return `${first[0]}: ${first[1][0]}`;
  }
  return e.message;
}

export default function ComplaintsPage() {
  const customer = useAuthStore((s) => s.customer);
  const resolvedCity = useLocationStore((s) => s.city);
  const resolvedBranch = useLocationStore((s) => s.branch);
  const queryClient = useQueryClient();

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api.public.get<Branch[]>("/branches"),
  });
  const cities = useMemo(() => Array.from(new Set((branches ?? []).map((b) => b.city))), [branches]);

  const [city, setCity] = useState(resolvedCity ?? "");
  const [branchId, setBranchId] = useState(resolvedBranch?.id ?? "");
  const [orderType, setOrderType] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [contactName, setContactName] = useState(customer?.name ?? "");
  const [contactPhone, setContactPhone] = useState(customer?.phone ?? "");
  const [contactEmail, setContactEmail] = useState(customer?.email ?? "");
  const [category, setCategory] = useState("FOOD_QUALITY");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submittedNumber, setSubmittedNumber] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const branchesInCity = useMemo(() => (branches ?? []).filter((b) => b.city === city), [branches, city]);

  const { data: complaints, isLoading: complaintsLoading } = useQuery({
    queryKey: ["my-complaints"],
    queryFn: () => api.get<Complaint[]>("/complaints/me"),
    enabled: !!customer,
  });

  function selectCity(next: string) {
    setCity(next);
    setBranchId("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmittedNumber(null);
    if (!contactPhone.trim() && !contactEmail.trim()) {
      setError("Provide at least a phone number or an email address");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        category,
        branchId: branchId || undefined,
        orderType: orderType || undefined,
        orderNumber: orderNumber || undefined,
        contactName,
        contactPhone: contactPhone ? normalizePhone(contactPhone) : undefined,
        contactEmail: contactEmail || undefined,
        subject,
        description,
        attachmentUrls,
      };
      const created = customer
        ? await api.post<Complaint>("/complaints", payload)
        : await api.public.post<Complaint>("/complaints/guest", payload);
      setSubject("");
      setDescription("");
      setOrderNumber("");
      setAttachmentUrls([]);
      setSubmittedNumber(created.complaintNumber);
      if (customer) await queryClient.invalidateQueries({ queryKey: ["my-complaints"] });
    } catch (e) {
      setError(e instanceof ApiError ? describeApiError(e) : "Could not submit complaint");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-poppins text-3xl font-bold text-brand-black">Submit a Complaint</h1>
      <p className="mt-1 text-sm text-muted">Tell us what went wrong, and we&apos;ll contact you by phone or email.</p>

      <form onSubmit={submit} className="mt-6 space-y-3 rounded-2xl border border-line bg-surface p-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">City</label>
            <select
              value={city}
              onChange={(e) => selectCity(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
              required
            >
              <option value="" disabled>Select city</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Branch</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={!city}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink disabled:opacity-50"
              required
            >
              <option value="" disabled>Select branch</option>
              {branchesInCity.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Order Type <span className="font-normal">(if applicable)</span></label>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            >
              <option value="">Not order-related</option>
              {ORDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Order ID <span className="font-normal">(if applicable)</span></label>
            <input
              placeholder="e.g. ORD-20260801-1001"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            />
          </div>
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Your Name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            required
          />
          <input
            placeholder="03XXXXXXXXX"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          />
        </div>
        <div>
          <input
            type="email"
            placeholder="Email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          />
          <p className="mt-1 text-xs text-muted">Provide at least a phone number or an email so we can reach you.</p>
        </div>

        <input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          required
        />
        <textarea
          placeholder="Describe the issue..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          required
        />

        <ComplaintImageUpload value={attachmentUrls} onChange={setAttachmentUrls} />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {submittedNumber && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            Complaint submitted. Your Complaint ID is <span className="font-semibold">{submittedNumber}</span>. We&apos;ll be in touch.
          </p>
        )}
        <button disabled={submitting} className="w-full rounded-lg bg-brand-red py-3 text-sm font-semibold text-white disabled:opacity-60">
          {submitting ? "Submitting..." : "Submit Complaint"}
        </button>
      </form>

      {customer && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-ink">Your Complaints</h2>
          <div className="mt-3 space-y-2">
            {complaintsLoading && Array.from({ length: 2 }).map((_, i) => <SkeletonTransactionRow key={i} />)}
            {!complaintsLoading &&
              complaints?.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border border-line p-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{c.complaintNumber} · {c.subject}</p>
                  <p className="text-xs text-muted">{CATEGORIES.find((x) => x.value === c.category)?.label ?? c.category} • {new Date(c.createdAt).toLocaleDateString()}</p>
                </div>
                <span className="rounded-full bg-surface-alt px-2.5 py-1 text-xs font-medium text-muted">{c.status.replace(/_/g, " ")}</span>
              </div>
            ))}
            {complaints?.length === 0 && <p className="text-sm text-muted">No complaints submitted yet.</p>}
          </div>
        </>
      )}
    </main>
  );
}
