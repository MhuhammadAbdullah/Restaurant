"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { SkeletonFieldRow } from "../../components/skeletons";

type Me = {
  name: string;
  phone: string;
  email: string;
  gender: string | null;
  dob: string | null;
};

/** "03XXXXXXXXX" -> "3XX-XXXXXXX" (strip the leading 0 for display next to the fixed +92 prefix). */
function toLocalDisplay(phone: string): string {
  return phone.startsWith("0") ? phone.slice(1) : phone;
}
function toBackendPhone(local: string): string {
  return `0${local.replace(/\D/g, "")}`;
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
  const [saved, setSaved] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setEmail(data.email);
    setGender(data.gender ?? "");
    setDob(data.dob ? data.dob.slice(0, 10) : "");
    setLocalPhone(toLocalDisplay(data.phone));
  }, [data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const phone = toBackendPhone(localPhone);
      await api.patch("/customers/me/profile", {
        name,
        email,
        phone,
        gender: gender || undefined,
        dob: dob || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      updateStoredCustomer({ name, email, phone });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update profile");
    } finally {
      setSaving(false);
    }
  }

  async function requestAccountDeletion() {
    setConfirmingDelete(false);
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-base font-semibold text-ink">Profile</p>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Full Name</p>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-brand-red focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-sm font-medium text-ink">
                Gender <span className="text-xs font-normal text-muted">(Optional)</span>
              </p>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-brand-red focus:outline-none"
              >
                <option value="">Select</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-ink">
                Date Of Birth <span className="text-xs font-normal text-muted">(Optional)</span>
              </p>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-brand-red focus:outline-none"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-ink">Email</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-brand-red focus:outline-none"
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-ink">Mobile Number</p>
            <div className="flex items-center rounded-lg border border-line bg-surface px-3.5 py-1 focus-within:border-brand-red">
              <span className="mr-2 shrink-0 text-sm text-muted">+92</span>
              <input
                required
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value)}
                placeholder="3XX-XXXXXXX"
                className="w-full bg-transparent py-2 text-sm text-ink focus:outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-muted">Example: +92 3XX-XXXXXXX</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Profile updated.</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-brand-red py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Update Profile"}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 text-center shadow-sm">
        {deleteRequested ? (
          <p className="text-sm text-muted">Your account deletion request has been submitted. Our team will follow up by email.</p>
        ) : confirmingDelete ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              This will submit a request to permanently delete your account and data. Are you sure?
            </p>
            <div className="flex justify-center gap-3">
              <button onClick={requestAccountDeletion} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">
                Yes, Request Deletion
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="text-sm font-semibold text-red-600">
            Request Account Deletion
          </button>
        )}
      </div>
    </div>
  );
}
