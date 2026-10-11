import { QueryClient } from "@tanstack/react-query";

/**
 * One shared client, so the sign-in / sign-out code can wipe its cache. Without that, the next person to sign in on the
 * same screen briefly saw the previous person's saved data (including their permissions, so a cashier flashed the
 * owner's dashboard until their own details finished loading).
 */
let browserClient: QueryClient | undefined;
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
  return (browserClient ??= new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }));
}
