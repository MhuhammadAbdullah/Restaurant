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

/** Query keys that hold only public branding (logo, login picture), never a person's own data, so they survive sign-in and sign-out. */
const PUBLIC_KEYS = new Set(["login-info"]);

/**
 * Forgets everything saved for whoever used this screen, except the public branding. Clearing that too made the login
 * picture and logo vanish for a moment while signing in, until they were fetched again.
 */
export function clearCachedUserData() {
  getQueryClient().removeQueries({ predicate: (query) => !PUBLIC_KEYS.has(String(query.queryKey[0])) });
}
