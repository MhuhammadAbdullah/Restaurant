import { NextResponse, type NextRequest } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type Redirect = { from: string; to: string; permanent: boolean };

const normalize = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p).toLowerCase();

let cache: { at: number; rules: Map<string, Redirect> } = { at: 0, rules: new Map() };

/** Redirect rules from Admin > SEO & Marketing > Redirects, cached for a minute so pages never wait on the API. */
async function getRules(): Promise<Map<string, Redirect>> {
  if (Date.now() - cache.at < 60_000) return cache.rules;
  try {
    const res = await fetch(`${API_URL}/cms/restaurant`, { signal: AbortSignal.timeout(2000) });
    const json = (await res.json()) as { data?: { seo?: { redirects?: Redirect[] } } };
    const rules = new Map((json.data?.seo?.redirects ?? []).map((r) => [normalize(r.from), r] as const));
    cache = { at: Date.now(), rules };
  } catch {
    cache = { at: Date.now() - 50_000, rules: cache.rules }; // keep the old rules and retry soon
  }
  return cache.rules;
}

export async function proxy(req: NextRequest) {
  const rules = await getRules();
  if (rules.size === 0) return NextResponse.next();
  const rule = rules.get(normalize(req.nextUrl.pathname));
  if (!rule) return NextResponse.next();
  const target = /^https?:\/\//.test(rule.to) ? new URL(rule.to) : new URL(rule.to, req.url);
  if (target.pathname === req.nextUrl.pathname && target.origin === req.nextUrl.origin) return NextResponse.next(); // never loop
  return NextResponse.redirect(target, rule.permanent ? 308 : 307);
}

export const config = { matcher: ["/((?!_next/|api/|.*\\.[a-zA-Z0-9]+$).*)"] };
