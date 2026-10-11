const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

const ACCESS_TOKEN_KEY = "restaurant_staff_access_token";
const REFRESH_TOKEN_KEY = "restaurant_staff_refresh_token";

// The login lives in sessionStorage, not localStorage: it ends when the browser (or tab) is closed, so coming back
// hours later always starts at the login page instead of a half-working dashboard. Anything left in localStorage from
// before is removed.
function store(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}
function forgetLegacyLogin() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem("restaurant_staff_auth");
  } catch {
    // storage blocked: nothing to clean
  }
}
forgetLegacyLogin();

export function getAccessToken(): string | null {
  return store()?.getItem(ACCESS_TOKEN_KEY) ?? null;
}
export function getRefreshToken(): string | null {
  return store()?.getItem(REFRESH_TOKEN_KEY) ?? null;
}
export function setTokens(accessToken: string, refreshToken: string) {
  store()?.setItem(ACCESS_TOKEN_KEY, accessToken);
  store()?.setItem(REFRESH_TOKEN_KEY, refreshToken);
}
export function clearTokens() {
  store()?.removeItem(ACCESS_TOKEN_KEY);
  store()?.removeItem(REFRESH_TOKEN_KEY);
}

/** Fired when the saved login is no longer accepted (expired / signed out elsewhere), so the app can go to the login page. */
export const SESSION_EXPIRED_EVENT = "staff-session-expired";

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

type RequestOptions = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; auth?: boolean; skipRefreshRetry?: boolean };

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

  if (res.status === 401 && !opts.skipRefreshRetry && getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...opts, skipRefreshRetry: true });
    clearTokens();
  }
  // Still unauthorised on a signed-in request: the session is over. Tell the app so it can show the login page.
  if (res.status === 401 && opts.auth !== false && typeof window !== "undefined") {
    clearTokens();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const err = json?.error ?? { code: "UNKNOWN_ERROR", message: "Something went wrong" };
    throw new ApiError(err.message, err.code, res.status, err.details);
  }
  return json.data as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/staff/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) return false;
    setTokens(json.data.accessToken, json.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  public: {
    get: <T>(path: string) => request<T>(path, { auth: false }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body, auth: false }),
  },
};
