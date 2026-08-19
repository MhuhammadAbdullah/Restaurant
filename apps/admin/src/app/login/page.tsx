"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { toast } from "../../store/useToastStore";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await api.public.post<{
        accessToken: string;
        refreshToken: string;
        staff: { id: string; name: string; email: string; role: string };
      }>("/auth/staff/login", { email, password });
      login(result.staff, result.accessToken, result.refreshToken);
      router.push("/");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-center text-2xl font-semibold text-brand-dark">Demo Restaurant</h1>
      <p className="mb-6 text-center text-sm text-neutral-500">Staff &amp; Owner Login</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
          required
        />
        <button disabled={loading} className="w-full rounded-lg bg-brand-red py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </main>
  );
}
