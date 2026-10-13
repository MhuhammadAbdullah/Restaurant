"use client";

import { LoadingDots } from "./LoadingDots";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type PublicInfo = { name: string; logoUrl: string | null };

/**
 * Full-screen loader shown right after signing in (or reopening the panel) until the person's account details are
 * known. Nothing of the dashboard is drawn before that, so no one sees a page that is not theirs.
 * If loading fails (server down, connection lost) it says so and offers a retry instead of spinning forever.
 */
export function WorkspaceLoader({ failed, onRetry, onSignOut }: { failed?: boolean; onRetry?: () => void; onSignOut?: () => void }) {
  const { data: info } = useQuery({ queryKey: ["login-info"], queryFn: () => api.public.get<PublicInfo>("/cms/restaurant"), staleTime: 60_000 });

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white px-6 text-center">
      {info?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.logoUrl} alt={info.name} className="h-24 w-auto object-contain" />
      ) : info?.name ? (
        <span className="text-2xl font-bold text-brand-red">{info.name}</span>
      ) : (
        <span className="h-24" />
      )}

      {failed ? (
        <>
          <p className="mt-8 text-base font-semibold text-neutral-900">We could not load your account</p>
          <p className="mt-1 max-w-xs text-sm text-neutral-500">Please check your internet connection and try again.</p>
          <div className="mt-5 flex gap-3">
            <button onClick={onRetry} className="rounded-lg bg-brand-red px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90">Try again</button>
            <button onClick={onSignOut} className="rounded-lg border border-neutral-300 px-6 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Sign out</button>
          </div>
        </>
      ) : (
        <>
          <span className="mt-8 h-10 w-10 animate-spin rounded-full border-4 border-brand-red/20 border-t-brand-red" />
          <p className="mt-5 text-sm font-medium text-neutral-700"><LoadingDots>Loading your workspace</LoadingDots></p>
          <p className="mt-1 text-xs text-neutral-400">Getting your branch and permissions ready</p>
        </>
      )}
    </div>
  );
}
