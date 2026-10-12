const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

const ACCESS_TOKEN_KEY = "restaurant_customer_access_token";
const REFRESH_TOKEN_KEY = "restaurant_customer_refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** Fired when a signed-in request is refused and the saved login cannot be renewed, so the app can sign the customer out and ask them to log in again. */
export const CUSTOMER_SESSION_EXPIRED_EVENT = "customer-session-expired";

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  skipRefreshRetry?: boolean;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && opts.auth !== false && !opts.skipRefreshRetry && getRefreshToken()) {
    const outcome = await refreshSession();
    if (outcome === "ok") return request<T>(path, { ...opts, skipRefreshRetry: true });
    // The server could not be reached: not a reason to sign the customer out.
    if (outcome === "unreachable") throw new ApiError("Could not reach the server. Please try again in a moment.", "NETWORK_ERROR", 0);
    clearTokens();
  }
  // A signed-in request that is still refused: the login is over. Say so clearly instead of "Authentication required".
  if (res.status === 401 && opts.auth !== false) {
    clearTokens();
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CUSTOMER_SESSION_EXPIRED_EVENT));
    throw new ApiError("Your session has expired. Please log in again.", "SESSION_EXPIRED", 401);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const err = json?.error ?? { code: "UNKNOWN_ERROR", message: "Something went wrong" };
    throw new ApiError(err.message, err.code, res.status, err.details);
  }
  return json.data as T;
}

type RefreshOutcome = "ok" | "expired" | "unreachable";
let refreshing: Promise<RefreshOutcome> | null = null;

/** One refresh at a time: requests that fail together share one attempt instead of each using up the refresh token. */
function refreshSession(): Promise<RefreshOutcome> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<RefreshOutcome> {
  const sent = getRefreshToken();
  if (!sent) return "expired";
  try {
    const res = await fetch(`${API_URL}/auth/customer/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: sent }),
    });
    if (res.status === 401 || res.status === 403) {
      // another tab may already have renewed the login a moment ago
      const now = getRefreshToken();
      return now && now !== sent ? "ok" : "expired";
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return "unreachable";
    setTokens(json.data.accessToken, json.data.refreshToken);
    return "ok";
  } catch {
    return "unreachable";
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  public: {
    get: <T>(path: string) => request<T>(path, { auth: false }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body, auth: false }),
  },
};
