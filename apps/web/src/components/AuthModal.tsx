"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";
import { useAuthModalStore } from "../store/useAuthModalStore";
import { CloseIcon } from "./icons";
import { AuthModalSkeleton } from "./skeletons";

type Purpose = "LOGIN" | "REGISTER";
type RegisterData = { name: string; phone: string; gender: string; dob: string };
type OtpContext = { email: string; purpose: Purpose; registerData?: RegisterData };

const RESEND_COOLDOWN_SECONDS = 60;

/** "03XXXXXXXXX" (what the backend/phoneSchema wants) from a bare "3XX-XXXXXXX"-style local part. */
function toLocalPhone(localDigits: string): string {
  return `0${localDigits.replace(/\D/g, "")}`;
}

export function AuthModal() {
  const isOpen = useAuthModalStore((s) => s.isOpen);
  const initialView = useAuthModalStore((s) => s.view);
  const redirectTo = useAuthModalStore((s) => s.redirectTo);
  const close = useAuthModalStore((s) => s.close);
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const [view, setView] = useState<"login" | "register" | "otp">("login");
  const [otpCtx, setOtpCtx] = useState<OtpContext | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setView(initialView);
      setOtpCtx(null);
      setError(null);
      setSuccess(null);
      setSubmitting(false);
    }
  }, [isOpen, initialView]);

  if (!isOpen) return null;

  function closeAndReset() {
    close();
  }

  async function requestOtp(email: string, purpose: Purpose, registerData?: RegisterData) {
    setError(null);
    setSubmitting(true);
    try {
      await api.public.post("/auth/customer/otp/request", { email, purpose });
      setOtpCtx({ email, purpose, registerData });
      setView("otp");
    } catch (e) {
      if (e instanceof ApiError && e.code === "EMAIL_NOT_REGISTERED") {
        setError("No account found with this email. Please register instead.");
      } else if (e instanceof ApiError && e.code === "EMAIL_ALREADY_REGISTERED") {
        setError("An account with this email already exists. Please log in instead.");
      } else {
        setError(e instanceof ApiError ? e.message : "Could not send the code. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(code: string) {
    if (!otpCtx) return;
    setError(null);
    setSubmitting(true);
    try {
      const path = otpCtx.purpose === "LOGIN" ? "/auth/customer/otp/verify-login" : "/auth/customer/otp/verify-register";
      const body =
        otpCtx.purpose === "LOGIN"
          ? { email: otpCtx.email, code }
          : {
              email: otpCtx.email,
              code,
              name: otpCtx.registerData!.name,
              phone: otpCtx.registerData!.phone,
              gender: otpCtx.registerData!.gender || undefined,
              dob: otpCtx.registerData!.dob || undefined,
            };
      const result = await api.public.post<{
        accessToken: string;
        refreshToken: string;
        customer: { id: string; name: string; phone: string; email: string };
      }>(path, body);

      login(result.customer, result.accessToken, result.refreshToken);
      setSuccess(otpCtx.purpose === "LOGIN" ? "Login successful! Redirecting..." : "Account created! Redirecting...");
      setTimeout(() => {
        closeAndReset();
        router.push(redirectTo);
      }, 900);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not verify the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeAndReset}>
      <div
        className="relative w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeAndReset}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-ink"
        >
          <CloseIcon size={16} />
        </button>

        {success ? (
          <div className="py-6 text-center">
            <p className="text-base font-semibold text-green-700">{success}</p>
          </div>
        ) : view === "login" ? (
          <LoginView
            submitting={submitting}
            error={error}
            onSubmit={(email) => requestOtp(email, "LOGIN")}
            onSwitchToRegister={() => {
              setError(null);
              setView("register");
            }}
          />
        ) : view === "register" ? (
          <RegisterView
            submitting={submitting}
            error={error}
            onSubmit={(data) => requestOtp(data.email, "REGISTER", { name: data.name, phone: data.phone, gender: data.gender, dob: data.dob })}
            onSwitchToLogin={() => {
              setError(null);
              setView("login");
            }}
          />
        ) : (
          <OtpView
            submitting={submitting}
            error={error}
            context={otpCtx!}
            onSubmit={verifyOtp}
            onResend={() => requestOtp(otpCtx!.email, otpCtx!.purpose, otpCtx!.registerData)}
            onBack={() => {
              setError(null);
              setView(otpCtx!.purpose === "LOGIN" ? "login" : "register");
            }}
          />
        )}
      </div>
    </div>
  );
}

function LoginView({
  submitting,
  error,
  onSubmit,
  onSwitchToRegister,
}: {
  submitting: boolean;
  error: string | null;
  onSubmit: (email: string) => void;
  onSwitchToRegister: () => void;
}) {
  const [email, setEmail] = useState("");

  return (
    <div>
      <h2 className="text-xl font-bold text-ink">Enter your email address</h2>
      <p className="mt-1 text-sm text-muted">Please enter your email address</p>

      {submitting ? (
        <div className="mt-5">
          <AuthModalSkeleton />
        </div>
      ) : (
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(email.trim());
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-sm text-ink focus:border-brand-red focus:outline-none"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Link href="/complaints" onClick={() => useAuthModalStore.getState().close()} className="inline-block text-sm text-muted hover:text-brand-red">
            › Need help?
          </Link>

          <button type="submit" className="w-full rounded-lg bg-brand-red py-3.5 text-sm font-semibold text-white">
            Login
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <button type="button" onClick={onSwitchToRegister} className="font-semibold text-brand-red">
          Register
        </button>
      </p>
    </div>
  );
}

function RegisterView({
  submitting,
  error,
  onSubmit,
  onSwitchToLogin,
}: {
  submitting: boolean;
  error: string | null;
  onSubmit: (data: { name: string; email: string; phone: string; gender: string; dob: string }) => void;
  onSwitchToLogin: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [localPhone, setLocalPhone] = useState("");

  return (
    <div>
      <h2 className="text-center text-2xl font-bold text-ink">Register</h2>

      {submitting ? (
        <div className="mt-5">
          <AuthModalSkeleton lines={3} />
        </div>
      ) : (
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ name: name.trim(), email: email.trim(), phone: toLocalPhone(localPhone), gender, dob });
          }}
        >
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Full Name</p>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-sm text-ink focus:border-brand-red focus:outline-none"
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-ink">Email Address</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-sm text-ink focus:border-brand-red focus:outline-none"
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
                className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-sm text-ink focus:border-brand-red focus:outline-none"
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
                className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-sm text-ink focus:border-brand-red focus:outline-none"
              />
            </div>
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
                className="w-full bg-transparent py-2.5 text-sm text-ink focus:outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-muted">Example: +92 3XX-XXXXXXX</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" className="w-full rounded-lg bg-brand-red py-3.5 text-sm font-semibold text-white">
            Register
          </button>
        </form>
      )}

      <p className="mt-5 text-center">
        <button type="button" onClick={onSwitchToLogin} className="text-sm font-semibold text-ink underline">
          Already have an Account?
        </button>
      </p>
    </div>
  );
}

function OtpView({
  submitting,
  error,
  context,
  onSubmit,
  onResend,
  onBack,
}: {
  submitting: boolean;
  error: string | null;
  context: OtpContext;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.email, context.purpose]);

  return (
    <div>
      <h2 className="text-xl font-bold text-ink">{context.purpose === "LOGIN" ? "Login" : "Register"}</h2>
      <p className="mt-1 text-sm text-muted">
        Enter the code received on your email address <span className="font-medium text-ink">({context.email})</span>.
      </p>

      {submitting ? (
        <div className="mt-5">
          <AuthModalSkeleton />
        </div>
      ) : (
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(code.trim());
          }}
        >
          <div className="relative">
            <input
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="Enter your code"
              className="w-full rounded-lg border border-brand-red bg-surface px-3.5 py-3 pr-16 text-sm tracking-widest text-ink focus:outline-none"
            />
            {secondsLeft > 0 && (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">({secondsLeft})</span>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" className="w-full rounded-lg bg-brand-red py-3.5 text-sm font-semibold text-white">
            {context.purpose === "LOGIN" ? "Login" : "Register"}
          </button>
        </form>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="text-muted hover:text-ink">
          ‹ Back
        </button>
        <button
          type="button"
          disabled={secondsLeft > 0 || submitting}
          onClick={onResend}
          className="font-semibold text-brand-red disabled:opacity-40"
        >
          Resend code
        </button>
      </div>
    </div>
  );
}
