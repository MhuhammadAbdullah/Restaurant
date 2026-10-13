"use client";

import { SecretInput } from "../../components/SecretInput";
import { LoadingDots } from "../../components/LoadingDots";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FaEye, FaEyeSlash, FaImage } from "react-icons/fa6";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { toast } from "../../store/useToastStore";

type PublicInfo = { name: string; logoUrl: string | null; adminLoginImageUrl: string | null };

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const staff = useAuthStore((s) => s.staff);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The picture and name come from the restaurant's settings (Admin > My Profile > Login page picture).
  const { data: info } = useQuery({ queryKey: ["login-info"], queryFn: () => api.public.get<PublicInfo>("/cms/restaurant"), staleTime: 60_000 });

  // someone who is already signed in has no business on the login screen
  useEffect(() => {
    if (hasHydrated && staff) router.replace("/");
  }, [hasHydrated, staff, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.public.post<{
        accessToken: string;
        refreshToken: string;
        staff: { id: string; name: string; email: string; role: string };
      }>("/auth/staff/login", { email: email.trim(), password });
      login(result.staff, result.accessToken, result.refreshToken);
      // keep the button busy until the dashboard's own loading screen takes over (no flash of the login form)
      // riders go straight to their own page
      router.push(result.staff.role === "Rider" ? "/rider" : "/");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Login failed. Please check your connection and try again.";
      setError(msg);
      toast.error(msg);
      setLoading(false);
    }
  }

  const name = info?.name ?? "Restaurant";

  return (
    <main className="min-h-screen bg-white lg:flex">
      {/* picture (left on large screens) */}
      <section className={`relative hidden overflow-hidden bg-neutral-100 lg:block ${info?.adminLoginImageUrl ? "shrink-0" : "lg:w-1/2"}`}>
        {info?.adminLoginImageUrl ? (
          // The panel is as wide as the picture is at full height, so it fills the panel edge to edge with nothing cropped
          // (capped at 60% of the screen so the form always keeps enough room).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.adminLoginImageUrl} alt={name} className="sticky top-0 block h-screen w-auto max-w-[60vw] object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-brand-red to-[#8f1511] p-10 text-center text-white">
            {info?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={info.logoUrl} alt={name} className="h-40 w-auto max-w-[70%] rounded-2xl bg-white/95 object-contain p-4 shadow-xl" />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/15"><FaImage size={34} /></span>
            )}
            <p className="mt-6 text-3xl font-bold">{name}</p>
            <p className="mt-1 text-sm text-white/80">Staff &amp; owner dashboard</p>
          </div>
        )}
      </section>

      {/* form (right) */}
      <section className="flex min-h-screen min-w-0 flex-1 flex-col px-6 py-8 sm:px-12">
        <div className="flex flex-1 items-center justify-center">
          <form onSubmit={handleSubmit} className="w-full max-w-sm">
            <div className="mb-6 flex justify-center">
              {info?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.logoUrl} alt={name} className="h-32 w-auto max-w-full object-contain" />
              ) : (
                <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-brand-red text-4xl font-bold text-white">{name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <h1 className="text-center text-2xl font-bold text-neutral-900">Login to your account</h1>
            <p className="mt-1.5 text-center text-sm text-neutral-500">Enter your email and password to open the dashboard.</p>

            <div className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-neutral-800">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="input w-full"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-neutral-800">Password</label>
                <div className="relative">
                  <SecretInput
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={setPassword}
                    required
                    style={{ paddingRight: "2.75rem" }}
                    className="input w-full"
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                    {show ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-400">Forgot your password? Ask an admin to reset it for you.</p>
              </div>

              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

              <button disabled={loading} className="w-full rounded-lg bg-brand-red py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
                {loading ? <LoadingDots>Logging in</LoadingDots> : "Login"}
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-neutral-400">© {new Date().getFullYear()} {name}</p>
      </section>
    </main>
  );
}
