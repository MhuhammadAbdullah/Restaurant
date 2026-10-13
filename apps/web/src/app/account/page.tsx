"use client";

import { LoadingDots } from "../../components/LoadingDots";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaTriangleExclamation } from "react-icons/fa6";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { toast } from "../../store/useToastStore";
import { SelectField } from "../../components/SelectField";
import { SkeletonFieldRow } from "../../components/skeletons";

type Me = {
  name: string;
  phone: string;
  email: string;
  gender: string | null;
  dob: string | null;
};

const GENDERS = [
  { value: "", label: "Prefer not to say" },
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

/** "03XXXXXXXXX" -> "3XXXXXXXXX" (the +92 prefix is shown next to the field, so the leading 0 is dropped for display). */
function toLocalDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? digits.slice(1) : digits.startsWith("92") ? digits.slice(2) : digits;
}
const toBackendPhone = (local: string) => `0${local.replace(/\D/g, "")}`;

const today = () => new Date().toISOString().slice(0, 10);

function Field({ label, optional, error, hint, children }: { label: string; optional?: boolean; error?: string | null; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink">
        {label} {optional && <span className="text-xs font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const updateStoredCustomer = useAuthStore((s) => s.updateCustomer);
  const { data, isLoading } = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/customer/me") });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [localPhone, setLocalPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setEmail(data.email);
    setGender(data.gender ?? "");
    setDob(data.dob ? data.dob.slice(0, 10) : "");
    setLocalPhone(toLocalDisplay(data.phone));
  }, [data]);

  const saved = useMemo(
    () => (data ? { name: data.name, email: data.email, gender: data.gender ?? "", dob: data.dob ? data.dob.slice(0, 10) : "", phone: toLocalDisplay(data.phone) } : null),
    [data],
  );
  const dirty = !!saved && (name !== saved.name || email !== saved.email || gender !== saved.gender || dob !== saved.dob || localPhone !== saved.phone);

  const errors = {
    name: name.trim().length < 2 ? "Please enter your full name." : null,
    email: !/^\S+@\S+\.\S+$/.test(email.trim()) ? "Enter a valid email address." : null,
    phone: !/^3\d{9}$/.test(localPhone) ? "Enter 10 digits starting with 3, e.g. 3001234567." : null,
    dob: dob && dob > today() ? "Date of birth cannot be in the future." : null,
  };
  const valid = !errors.name && !errors.email && !errors.phone && !errors.dob;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!valid) {
      setError("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const phone = toBackendPhone(localPhone);
      await api.patch("/customers/me/profile", {
        name: name.trim(),
        email: email.trim(),
        phone,
        gender: gender || undefined,
        dob: dob || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      updateStoredCustomer({ name: name.trim(), email: email.trim(), phone });
      toast.success("Your profile has been updated");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (!saved) return;
    setName(saved.name);
    setEmail(saved.email);
    setGender(saved.gender);
    setDob(saved.dob);
    setLocalPhone(saved.phone);
    setError(null);
  }

  async function requestAccountDeletion() {
    setDeleting(true);
    try {
      await api.post("/complaints", {
        category: "OTHER",
        contactName: name,
        contactPhone: toBackendPhone(localPhone),
        contactEmail: email,
        subject: "Account Deletion Request",
        description: "The customer has requested their account and associated data be deleted.",
        attachmentUrls: [],
      });
      setDeleteRequested(true);
      setConfirmingDelete(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send the request. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonFieldRow />
        <SkeletonFieldRow />
        <SkeletonFieldRow />
        <SkeletonFieldRow />
      </div>
    );
  }
  if (!data) return null;

  const invalidClass = (msg: string | null) => (msg ? "!border-red-400" : "");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">My Profile</h1>
        <p className="mt-0.5 text-sm text-muted">Keep your details up to date so we can reach you about your orders.</p>
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-base font-semibold text-ink">Personal details</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Full name" error={errors.name}>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={`input ${invalidClass(errors.name)}`} />
            </Field>
          </div>
          <Field label="Gender" optional>
            <SelectField value={gender} onChange={setGender} options={GENDERS} placeholder="Prefer not to say" ariaLabel="Gender" />
          </Field>
          <Field label="Date of birth" optional error={errors.dob}>
            <input type="date" value={dob} max={today()} onChange={(e) => setDob(e.target.value)} className={`input ${invalidClass(errors.dob)}`} />
          </Field>
        </div>

        <p className="mt-7 text-base font-semibold text-ink">Contact details</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number" error={errors.phone}>
            <div className={`flex items-center rounded-xl border bg-surface transition focus-within:border-brand-red ${errors.phone ? "border-red-400" : "border-line"}`}>
              <span className="select-none border-r border-line px-4 py-3.5 text-sm font-medium text-muted">+92</span>
              <input
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="3XX XXXXXXX"
                className="w-full bg-transparent px-4 py-3.5 text-sm text-ink placeholder:text-muted placeholder:opacity-70 focus:outline-none"
              />
            </div>
          </Field>
          <Field label="Email" error={errors.email}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={`input ${invalidClass(errors.email)}`} />
          </Field>
        </div>

        {error && <p className="mt-5 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {dirty && (
            <button type="button" onClick={reset} disabled={saving} className="rounded-xl border border-line px-6 py-3 text-sm font-medium text-ink transition hover:bg-surface-alt disabled:opacity-50">
              Discard changes
            </button>
          )}
          <button type="submit" disabled={saving || !dirty} className="rounded-xl bg-brand-red px-8 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? <LoadingDots>Saving</LoadingDots> : "Save changes"}
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-red-200 bg-surface p-5 dark:border-red-500/30 sm:p-6">
        <p className="flex items-center gap-2 text-base font-semibold text-ink">
          <FaTriangleExclamation size={14} className="text-red-600" /> Delete account
        </p>
        {deleteRequested ? (
          <p className="mt-2 text-sm text-muted">Your deletion request has been sent. Our team will follow up with you by email.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">Ask us to permanently delete your account and personal data. Your order history and loyalty points will be lost.</p>
            <button onClick={() => setConfirmingDelete(true)} className="mt-4 rounded-xl border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10">
              Request account deletion
            </button>
          </>
        )}
      </div>

      {confirmingDelete &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => !deleting && setConfirmingDelete(false)}>
            <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10">
                <FaTriangleExclamation size={18} />
              </span>
              <h3 className="mt-3 text-lg font-semibold">Delete your account?</h3>
              <p className="mt-1.5 text-sm text-muted">This sends a request to permanently delete your account and data. Our team will confirm with you by email before anything is removed.</p>
              <div className="mt-5 flex gap-3">
                <button onClick={() => setConfirmingDelete(false)} disabled={deleting} className="flex-1 rounded-xl border border-line py-2.5 text-sm font-medium transition hover:bg-surface-alt">
                  Keep my account
                </button>
                <button onClick={requestAccountDeletion} disabled={deleting} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60">
                  {deleting ? <LoadingDots>Sending</LoadingDots> : "Yes, request deletion"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
