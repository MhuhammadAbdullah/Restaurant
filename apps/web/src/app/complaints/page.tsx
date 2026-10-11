"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaArrowLeft, FaArrowRight, FaBoxesPacking, FaBoxOpen, FaCheck, FaCircleCheck, FaCircleQuestion, FaClock, FaCreditCard, FaReceipt, FaRepeat, FaStore, FaUserTie, FaUtensils } from "react-icons/fa6";
import type { IconType } from "react-icons";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { useLocationStore } from "../../store/useLocationStore";
import { ComplaintImageUpload } from "../../components/ComplaintImageUpload";
import { SelectField } from "../../components/SelectField";
import type { Branch } from "../../lib/types";

type Complaint = {
  id: string;
  complaintNumber: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
};

const CATEGORIES: { value: string; label: string; icon: IconType }[] = [
  { value: "FOOD_QUALITY", label: "Food Quality", icon: FaUtensils },
  { value: "WRONG_ITEM", label: "Wrong Item", icon: FaRepeat },
  { value: "MISSING_ITEM", label: "Missing Item", icon: FaBoxOpen },
  { value: "LATE_DELIVERY", label: "Late Delivery", icon: FaClock },
  { value: "BRANCH_ISSUE", label: "Branch Issue", icon: FaStore },
  { value: "STAFF_BEHAVIOUR", label: "Staff Behaviour", icon: FaUserTie },
  { value: "PAYMENT_ISSUE", label: "Payment Issue", icon: FaCreditCard },
  { value: "ORDER_ISSUE", label: "Order Issue", icon: FaReceipt },
  { value: "PACKAGING_ISSUE", label: "Packaging Issue", icon: FaBoxesPacking },
  { value: "OTHER", label: "Other", icon: FaCircleQuestion },
];

const ORDER_TYPES = [
  { value: "DELIVERY", label: "Delivery" },
  { value: "PICKUP", label: "Pickup" },
  { value: "TAKEAWAY", label: "Takeaway" },
  { value: "DINE_IN", label: "Dine-In" },
];

const DESCRIPTION_MAX = 1000;

const STEPS = [
  { title: "Where did it happen?", short: "Location", hint: "Pick the branch you ordered from or visited." },
  { title: "What went wrong?", short: "Issue", hint: "Choose the closest match, then describe it." },
  { title: "How can we reach you?", short: "Contact", hint: "A phone number or an email is enough." },
  { title: "Add photos", short: "Photos", hint: "Optional. A photo helps us look into it faster (up to 6)." },
] as const;

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

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-red text-sm font-semibold text-white">{n}</span>
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-medium text-muted">
      {children} {optional && <span className="font-normal opacity-70">(optional)</span>}
    </label>
  );
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
  const cities = useMemo(() => Array.from(new Set((branches ?? []).map((b) => b.city))).sort(), [branches]);

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
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const enteredAt = useRef(0);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [submittedNumber, setSubmittedNumber] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const branchesInCity = useMemo(() => (branches ?? []).filter((b) => b.city === city), [branches, city]);

  function selectCity(next: string) {
    setCity(next);
    // a city with a single branch needs no second choice
    const inCity = (branches ?? []).filter((b) => b.city === next);
    setBranchId(inCity.length === 1 ? inCity[0]!.id : "");
  }

  /** Checks only the fields of one step, so people are never told about things they have not reached yet. */
  function validateStep(n: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (n === 0) {
      if (!city) e.city = "Please select a city.";
      if (!branchId) e.branch = "Please select a branch.";
    }
    if (n === 1) {
      if (subject.trim().length < 3) e.subject = "Give your complaint a short subject.";
      if (description.trim().length < 10) e.description = "Please describe what happened (at least a few words).";
    }
    if (n === 2) {
      if (contactName.trim().length < 2) e.name = "Please enter your name.";
      const digits = contactPhone.replace(/\D/g, "");
      if (!digits && !contactEmail.trim()) e.contact = "Give a phone number or an email so we can reach you.";
      else {
        if (digits && !/^03\d{9}$/.test(digits)) e.phone = "Enter a valid mobile number like 03XXXXXXXXX.";
        if (contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) e.email = "Enter a valid email address.";
      }
    }
    return e;
  }

  function goTo(next: number, dir: "forward" | "back") {
    setDirection(dir);
    enteredAt.current = Date.now();
    setStep(next);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    const errs = validateStep(step);
    setStepErrors(errs);
    if (Object.keys(errs).length > 0) return;
    goTo(Math.min(STEPS.length - 1, step + 1), "forward");
  }

  function back() {
    setStepErrors({});
    goTo(Math.max(0, step - 1), "back");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Enter inside a field moves to the next step; only the last step really submits.
    if (step < STEPS.length - 1) return next();
    // a click that only just brought us to this step must never also send the complaint
    if (Date.now() - enteredAt.current < 600) return;
    // safety net: re-check everything before sending
    for (let n = 0; n < STEPS.length - 1; n++) {
      const errs = validateStep(n);
      if (Object.keys(errs).length > 0) {
        setStepErrors(errs);
        goTo(n, "back");
        return;
      }
    }
    setError(null);
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
      setSubmittedNumber(created.complaintNumber);
      if (customer) await queryClient.invalidateQueries({ queryKey: ["my-complaints"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof ApiError ? describeApiError(e) : "Could not submit your complaint. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startAnother() {
    setStep(0);
    setStepErrors({});
    setSubmittedNumber(null);
    setSubject("");
    setDescription("");
    setOrderNumber("");
    setOrderType("");
    setAttachmentUrls([]);
    setError(null);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-poppins text-3xl font-bold text-brand-black">Submit a Complaint</h1>
      <p className="mt-1 text-sm text-muted">We are sorry something went wrong. Tell us what happened and our team will contact you by phone or email.</p>

      {submittedNumber ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-8 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600">
            <FaCircleCheck size={30} />
          </span>
          <h2 className="mt-4 text-xl font-semibold text-ink">Complaint submitted</h2>
          <p className="mt-1 text-sm text-muted">Thank you for telling us. We will get back to you soon.</p>
          <div className="mx-auto mt-5 inline-block rounded-xl bg-surface-alt px-6 py-3">
            <p className="text-xs text-muted">Your Complaint ID</p>
            <p className="text-2xl font-bold tracking-wide text-brand-red">{submittedNumber}</p>
          </div>
          <p className="mt-3 text-xs text-muted">Keep this ID to follow up with us.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {customer && (
              <Link href="/account/complaints" className="rounded-xl bg-brand-red px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                Track in My Complaints
              </Link>
            )}
            <button onClick={startAnother} className="rounded-xl border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-brand-red hover:text-brand-red">
              Submit another complaint
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 rounded-2xl border border-line bg-surface">
          {/* progress */}
          <div className="border-b border-line px-4 pb-4 pt-5 sm:px-7">
            <ol className="flex items-center">
              {STEPS.map((st, i) => {
                const done = i < step;
                const current = i === step;
                return (
                  <li key={st.short} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                    <button
                      type="button"
                      onClick={() => i < step && goTo(i, "back")}
                      disabled={i >= step}
                      aria-current={current ? "step" : undefined}
                      aria-label={`Step ${i + 1}: ${st.short}`}
                      className="flex flex-col items-center gap-1.5 disabled:cursor-default"
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300 ${
                          done ? "border-brand-red bg-brand-red text-white" : current ? "scale-110 border-brand-red bg-brand-red/10 text-brand-red" : "border-line text-muted"
                        }`}
                      >
                        {done ? <FaCheck size={12} /> : i + 1}
                      </span>
                      <span className={`hidden text-[11px] font-medium sm:block ${current ? "text-brand-red" : "text-muted"}`}>{st.short}</span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <span className="mx-2 mb-0 h-0.5 flex-1 overflow-hidden rounded-full bg-line sm:mb-5">
                        <span className={`block h-full bg-brand-red transition-all duration-500 ${done ? "w-full" : "w-0"}`} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-center text-xs text-muted sm:hidden">
              Step {step + 1} of {STEPS.length}: {STEPS[step]!.short}
            </p>
          </div>

          {/* the current step slides in from the side it was reached from. Only sideways overflow is clipped, so dropdown lists can open past the bottom of the card. */}
          <div className="overflow-x-clip">
            <div key={step} className={`p-5 sm:p-7 ${direction === "forward" ? "animate-step-forward" : "animate-step-back"}`}>
              <h2 className="text-lg font-semibold text-ink">{STEPS[step]!.title}</h2>
              <p className="mt-0.5 text-sm text-muted">{STEPS[step]!.hint}</p>

              <div className="mt-5 space-y-4">
                {step === 0 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>City</Label>
                      <SelectField value={city} onChange={(v) => { selectCity(v); setStepErrors({}); }} options={cities.map((c) => ({ value: c, label: c }))} placeholder="Select city" ariaLabel="City" />
                      {stepErrors.city && <p className="mt-1 text-xs text-red-600">{stepErrors.city}</p>}
                    </div>
                    <div>
                      <Label>Branch</Label>
                      <SelectField value={branchId} onChange={(v) => { setBranchId(v); setStepErrors({}); }} options={branchesInCity.map((b) => ({ value: b.id, label: b.name }))} placeholder={city ? "Select branch" : "Select a city first"} disabled={!city} ariaLabel="Branch" />
                      {stepErrors.branch && <p className="mt-1 text-xs text-red-600">{stepErrors.branch}</p>}
                    </div>
                    <div>
                      <Label optional>Order type</Label>
                      <SelectField value={orderType} onChange={setOrderType} options={[{ value: "", label: "Not order-related" }, ...ORDER_TYPES]} placeholder="Not order-related" ariaLabel="Order type" />
                    </div>
                    <div>
                      <Label optional>Order ID</Label>
                      <input placeholder="e.g. NWBNND" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value.toUpperCase())} maxLength={40} autoCapitalize="characters" className="input uppercase placeholder:normal-case" />
                      <p className="mt-1 text-[11px] text-muted">Order ID or Invoice No from your receipt or order confirmation.</p>
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {CATEGORIES.map((c) => {
                        const Icon = c.icon;
                        const on = category === c.value;
                        return (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setCategory(c.value)}
                            aria-pressed={on}
                            className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-medium transition ${
                              on ? "border-brand-red bg-red-50 text-brand-red dark:bg-brand-red/10" : "border-line bg-surface text-ink hover:border-brand-red/50"
                            }`}
                          >
                            <Icon size={18} />
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                    <div>
                      <Label>Subject</Label>
                      <input placeholder="A short summary, e.g. Burger was cold" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} className={`input ${stepErrors.subject ? "!border-red-400" : ""}`} />
                      {stepErrors.subject && <p className="mt-1 text-xs text-red-600">{stepErrors.subject}</p>}
                    </div>
                    <div>
                      <Label>Details</Label>
                      <textarea
                        placeholder="Tell us what happened, when, and what you expected..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={5}
                        maxLength={DESCRIPTION_MAX}
                        className={`input resize-y ${stepErrors.description ? "!border-red-400" : ""}`}
                      />
                      <div className="mt-1 flex justify-between gap-2 text-[11px]">
                        <span className="text-red-600">{stepErrors.description}</span>
                        <span className="text-muted">{description.length}/{DESCRIPTION_MAX}</span>
                      </div>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Your name</Label>
                      <input placeholder="Full name" value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="name" className={`input ${stepErrors.name ? "!border-red-400" : ""}`} />
                      {stepErrors.name && <p className="mt-1 text-xs text-red-600">{stepErrors.name}</p>}
                    </div>
                    <div>
                      <Label>Mobile number</Label>
                      <input
                        placeholder="03XXXXXXXXX"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value.replace(/[^0-9+ -]/g, ""))}
                        inputMode="tel"
                        maxLength={14}
                        className={`input ${stepErrors.phone || stepErrors.contact ? "!border-red-400" : ""}`}
                      />
                      {stepErrors.phone && <p className="mt-1 text-xs text-red-600">{stepErrors.phone}</p>}
                    </div>
                    <div>
                      <Label>Email</Label>
                      <input type="email" placeholder="you@example.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} autoComplete="email" className={`input ${stepErrors.email || stepErrors.contact ? "!border-red-400" : ""}`} />
                      {stepErrors.email && <p className="mt-1 text-xs text-red-600">{stepErrors.email}</p>}
                    </div>
                    {stepErrors.contact && <p className="text-xs text-red-600 sm:col-span-2">{stepErrors.contact}</p>}
                  </div>
                )}

                {step === 3 && (
                  <>
                    <ComplaintImageUpload value={attachmentUrls} onChange={setAttachmentUrls} />
                    <div className="rounded-xl bg-surface-alt p-4 text-sm">
                      <p className="font-semibold text-ink">Quick check before you send</p>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted">
                        <dt>Branch</dt>
                        <dd className="text-ink">{branchesInCity.find((b) => b.id === branchId)?.name ?? "-"}, {city}</dd>
                        <dt>Issue</dt>
                        <dd className="text-ink">{CATEGORIES.find((c) => c.value === category)?.label} · {subject}</dd>
                        <dt>Contact</dt>
                        <dd className="text-ink">{contactName}{contactPhone ? ` · ${contactPhone}` : ""}{contactEmail ? ` · ${contactEmail}` : ""}</dd>
                      </dl>
                    </div>
                  </>
                )}
              </div>

              {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
            </div>
          </div>

          {/* navigation */}
          <div className="flex items-center justify-between gap-3 rounded-b-2xl border-t border-line px-5 py-4 sm:px-7">
            {step > 0 ? (
              <button type="button" onClick={back} disabled={submitting} className="flex items-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-medium text-ink transition hover:border-brand-red hover:text-brand-red disabled:opacity-50">
                <FaArrowLeft size={12} /> Back
              </button>
            ) : (
              <span />
            )}
            {step < STEPS.length - 1 ? (
              <button key="next" type="button" onClick={next} className="flex items-center gap-2 rounded-xl bg-brand-red px-7 py-3 text-sm font-semibold text-white transition hover:opacity-90">
                Next <FaArrowRight size={12} />
              </button>
            ) : (
              <button key="submit" type="submit" disabled={submitting} className="rounded-xl bg-brand-red px-7 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
                {submitting ? "Submitting..." : "Submit complaint"}
              </button>
            )}
          </div>
        </form>
      )}
    </main>
  );
}
