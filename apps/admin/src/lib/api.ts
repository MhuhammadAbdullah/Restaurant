const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

const ACCESS_TOKEN_KEY = "restaurant_staff_access_token";
const REFRESH_TOKEN_KEY = "restaurant_staff_refresh_token";

// The login stays on the device until the person signs out themselves (or an admin removes the account / the password is
// changed), so a restaurant screen is never logged out in the middle of service. It lives in localStorage so it also
// survives closing the browser and is shared by every tab.
function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// Logins made while sign-in was tab-only are moved over once, so nobody is signed out by this change.
function migrateTabOnlyLogin() {
  if (typeof window === "undefined") return;
  try {
    for (const key of [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, "restaurant_staff_auth"]) {
      const value = window.sessionStorage.getItem(key);
      if (value !== null && window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // storage blocked: nothing to move
  }
}
migrateTabOnlyLogin();

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

  if (res.status === 401 && opts.auth !== false && !opts.skipRefreshRetry && getRefreshToken()) {
    const outcome = await refreshSession();
    if (outcome === "ok") return request<T>(path, { ...opts, skipRefreshRetry: true });
    // The server could not be reached (slow start, bad connection): that is not a reason to sign anyone out.
    if (outcome === "unreachable") throw new ApiError("Could not reach the server. Please try again in a moment.", "NETWORK_ERROR", 0);
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

type RefreshOutcome = "ok" | "expired" | "unreachable";
let refreshing: Promise<RefreshOutcome> | null = null;

/** One refresh at a time: requests that fail together share the same attempt instead of each using up the token. */
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
    const res = await fetch(`${API_URL}/auth/staff/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: sent }),
    });
    if (res.status === 401 || res.status === 403) {
      // Another tab may have refreshed a moment ago and already stored a newer login.
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

function tokenExpiresAtMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

let keepAliveStarted = false;

/**
 * Renews the login quietly in the background while the dashboard is open, so the short-lived access token never
 * runs out in the middle of work, and again when the screen wakes up or the connection comes back.
 */
export function startSessionKeepAlive() {
  if (typeof window === "undefined" || keepAliveStarted) return;
  keepAliveStarted = true;
  const tick = () => {
    const access = getAccessToken();
    if (!access || !getRefreshToken()) return;
    const expires = tokenExpiresAtMs(access);
    if (expires !== null && expires - Date.now() > 5 * 60_000) return;
    void refreshSession().then((outcome) => {
      if (outcome === "expired") {
        clearTokens();
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
    });
  };
  window.setInterval(tick, 60_000);
  window.addEventListener("focus", tick);
  window.addEventListener("online", tick);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && tick());
  tick();
}

/** Tells the server to forget this device. Best effort: the person is signed out here either way. */
export function serverLogout() {
  const access = getAccessToken();
  const refresh = getRefreshToken();
  if (!access || !refresh) return;
  void fetch(`${API_URL}/auth/staff/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
    body: JSON.stringify({ refreshToken: refresh }),
    keepalive: true,
  }).catch(() => undefined);
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
