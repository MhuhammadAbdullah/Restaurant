"use client";

import { SecretInput } from "../../../components/SecretInput";
import { LoadingDots } from "../../../components/LoadingDots";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaCircleCheck, FaEye, FaEyeSlash, FaImage, FaKey, FaRegCircleUser } from "react-icons/fa6";
import { api, ApiError, setTokens } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useAuthStore } from "../../../store/useAuthStore";
import { useMe, hasPermission } from "../../../lib/useMe";
import { ImageUploadField } from "../../../components/ImageUploadField";

type Profile = { id: string; name: string; email: string; phone: string | null; role: string; lastLoginAt: string | null; createdAt: string };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

function strength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 8) return { score: Math.min(score, 1), label: "Too short", color: "bg-red-500" };
  if (score <= 2) return { score, label: "Weak", color: "bg-red-500" };
  if (score === 3) return { score, label: "Okay", color: "bg-amber-500" };
  if (score === 4) return { score, label: "Good", color: "bg-green-500" };
  return { score, label: "Strong", color: "bg-green-600" };
}

function PasswordField({ label, value, onChange, show, onToggle, autoComplete, error, hint }: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; autoComplete: string; error?: string | null; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-700">{label}</label>
      <div className="relative">
        <SecretInput
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          style={{ paddingRight: "2.75rem" }}
          className={`input w-full ${error ? "!border-red-400" : ""}`}
        />
        <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
          {show ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-[11px] text-neutral-400">{hint}</p> : null}
    </div>
  );
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const updateStaff = useAuthStore((s) => s.updateStaff);
  const { data: me } = useMe();
  const canManageLogin = hasPermission(me, "settings.manage");

  // ---- picture shown beside the login form ----
  const { data: site } = useQuery({ queryKey: ["cms-restaurant"], queryFn: () => api.get<{ adminLoginImageUrl: string | null }>("/cms/restaurant") });
  const [loginImage, setLoginImage] = useState("");
  const [savingImage, setSavingImage] = useState(false);
  useEffect(() => {
    if (site) setLoginImage(site.adminLoginImageUrl ?? "");
  }, [site]);
  const imageDirty = !!site && loginImage !== (site.adminLoginImageUrl ?? "");
  async function saveLoginImage() {
    setSavingImage(true);
    try {
      await api.patch("/cms/restaurant", { adminLoginImageUrl: loginImage || null });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["cms-restaurant"] }), queryClient.invalidateQueries({ queryKey: ["login-info"] })]);
      toast.success(loginImage ? "Login page picture updated" : "Login page picture removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the picture");
    } finally {
      setSavingImage(false);
    }
  }
  const { data: profile } = useQuery({ queryKey: ["staff-profile"], queryFn: () => api.get<Profile>("/auth/staff/profile") });

  // ---- details ----
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setPhone(profile.phone ?? "");
  }, [profile]);
  const detailsDirty = !!profile && (name.trim() !== profile.name || phone.trim() !== (profile.phone ?? ""));
  const nameError = name.trim().length < 2 ? "Please enter your name." : null;
  const phoneError = phone.trim() && !/^[0-9+\-\s()]{7,20}$/.test(phone.trim()) ? "Enter a valid phone number." : null;

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setDetailsError(null);
    if (nameError || phoneError) return;
    setSavingDetails(true);
    try {
      const updated = await api.patch<Profile>("/auth/staff/profile", { name: name.trim(), phone: phone.trim() });
      updateStaff({ name: updated.name });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["staff-profile"] }), queryClient.invalidateQueries({ queryKey: ["me"] })]);
      toast.success("Your profile has been updated");
    } catch (err) {
      setDetailsError(err instanceof ApiError ? err.message : "Could not update your profile");
    } finally {
      setSavingDetails(false);
    }
  }

  // ---- password ----
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const s = useMemo(() => strength(next), [next]);

  const errors = {
    current: touched && !current ? "Enter your current password." : null,
    next:
      touched && next.length < 8
        ? "Use at least 8 characters."
        : touched && !/[A-Za-z]/.test(next)
          ? "Include at least one letter."
          : touched && !/\d/.test(next)
            ? "Include at least one number."
            : touched && next && next === current
              ? "The new password must be different from the current one."
              : null,
    confirm: touched && confirm !== next ? "The two passwords do not match." : null,
  };

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setPwError(null);
    const bad = !current || next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next) || next === current || confirm !== next;
    if (bad) return;
    setSavingPw(true);
    try {
      const tokens = await api.post<{ accessToken: string; refreshToken: string }>("/auth/staff/change-password", { currentPassword: current, newPassword: next });
      // this device gets a fresh session; every other device is signed out
      setTokens(tokens.accessToken, tokens.refreshToken);
      setCurrent("");
      setNext("");
      setConfirm("");
      setTouched(false);
      toast.success("Password changed. Other devices have been signed out.");
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : "Could not change your password");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-neutral-900">My Profile</h1>
      <p className="mt-1 text-sm text-neutral-500">Update your own details and change your password.</p>

      <div className="mt-5 grid gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
        {/* identity card */}
        <aside className="h-fit rounded-xl border border-neutral-200 bg-white p-5 text-center">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-red text-2xl font-bold text-white">{initials(profile?.name ?? "")}</span>
          <p className="mt-3 truncate text-base font-semibold text-neutral-900">{profile?.name ?? "..."}</p>
          <span className="mt-1 inline-block rounded-full bg-neutral-100 px-3 py-0.5 text-xs font-medium text-neutral-600">{profile?.role ?? ""}</span>
          <dl className="mt-4 space-y-2 border-t border-neutral-100 pt-4 text-left text-xs">
            <div>
              <dt className="text-neutral-400">Email (your login)</dt>
              <dd className="truncate text-neutral-700">{profile?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-neutral-400">Last signed in</dt>
              <dd className="text-neutral-700">{fmt(profile?.lastLoginAt ?? null)}</dd>
            </div>
            <div>
              <dt className="text-neutral-400">Account created</dt>
              <dd className="text-neutral-700">{fmt(profile?.createdAt ?? null)}</dd>
            </div>
          </dl>
        </aside>

        <div className="space-y-5">
          {/* details */}
          <form onSubmit={saveDetails} className="rounded-xl border border-neutral-200 bg-white p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <FaRegCircleUser size={14} className="text-brand-red" /> Personal details
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-neutral-700">Full name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={`input w-full ${nameError ? "!border-red-400" : ""}`} />
                {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-700">
                  Phone <span className="font-normal text-neutral-400">(optional)</span>
                </label>
                <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9+\-\s()]/g, ""))} inputMode="tel" autoComplete="tel" placeholder="0300 1234567" className={`input w-full ${phoneError ? "!border-red-400" : ""}`} />
                {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-700">Email</label>
                <input value={profile?.email ?? ""} disabled className="input w-full" />
                <p className="mt-1 text-[11px] text-neutral-400">This is your login. To change it, ask an admin (Staff &amp; Access).</p>
              </div>
            </div>
            {detailsError && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{detailsError}</p>}
            <div className="mt-5 flex justify-end gap-2 border-t border-neutral-100 pt-4">
              {detailsDirty && (
                <button type="button" onClick={() => { setName(profile?.name ?? ""); setPhone(profile?.phone ?? ""); }} disabled={savingDetails} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                  Discard
                </button>
              )}
              <button type="submit" disabled={!detailsDirty || savingDetails || !!nameError || !!phoneError} className="rounded-lg bg-brand-red px-6 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {savingDetails ? <LoadingDots>Saving</LoadingDots> : "Save changes"}
              </button>
            </div>
          </form>

          {/* login page picture (only people who manage settings) */}
          {canManageLogin && (
            <section className="rounded-xl border border-neutral-200 bg-white p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <FaImage size={13} className="text-brand-red" /> Login page picture
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">This picture is shown beside the login form of the admin panel. Without one, your logo on a red background is used.</p>
              <div className="mt-4 sm:max-w-md">
                <ImageUploadField label="Login page picture" hideLabel folder="restaurant" value={loginImage} onChange={setLoginImage} shape="landscape" hint="A tall or square photo works best (at least 1000px high)." />
              </div>
              <div className="mt-4 flex justify-end gap-2 border-t border-neutral-100 pt-4">
                {imageDirty && (
                  <button type="button" onClick={() => setLoginImage(site?.adminLoginImageUrl ?? "")} disabled={savingImage} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Discard</button>
                )}
                <button type="button" onClick={saveLoginImage} disabled={!imageDirty || savingImage} className="rounded-lg bg-brand-red px-6 py-2 text-sm font-semibold text-white disabled:opacity-40">
                  {savingImage ? <LoadingDots>Saving</LoadingDots> : "Save picture"}
                </button>
              </div>
            </section>
          )}

          {/* password */}
          <form onSubmit={changePassword} className="rounded-xl border border-neutral-200 bg-white p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <FaKey size={13} className="text-brand-red" /> Change password
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">Enter your current password first, then choose a new one. You will stay signed in here; other devices will be signed out.</p>
            <div className="mt-4 grid gap-4 sm:max-w-md">
              <PasswordField label="Current password" value={current} onChange={setCurrent} show={showCurrent} onToggle={() => setShowCurrent((v) => !v)} autoComplete="current-password" error={errors.current} />
              <div>
                <PasswordField label="New password" value={next} onChange={setNext} show={showNext} onToggle={() => setShowNext((v) => !v)} autoComplete="new-password" error={errors.next} hint="At least 8 characters, with a letter and a number." />
                {next && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= s.score ? s.color : "bg-neutral-200"}`} />
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-500">{s.label}</p>
                  </div>
                )}
              </div>
              <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} show={showNext} onToggle={() => setShowNext((v) => !v)} autoComplete="new-password" error={errors.confirm} />
            </div>
            {pwError && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:max-w-md">{pwError}</p>}
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
              <p className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                <FaCircleCheck size={11} /> Forgot your current password? Ask an admin to reset it.
              </p>
              <button type="submit" disabled={savingPw || !current || !next || !confirm} className="rounded-lg bg-brand-red px-6 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {savingPw ? <LoadingDots>Updating</LoadingDots> : "Update password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
