const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export type Branding = { name: string; logoUrl: string | null; faviconUrl: string | null };

/** Server-side: the restaurant's name, logo and favicon from the public site info. Never throws. */
export async function getBranding(): Promise<Branding> {
  try {
    const res = await fetch(`${API_URL}/cms/restaurant`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { data?: { name?: string; logoUrl?: string | null; seo?: { faviconUrl?: string } } };
    return { name: json.data?.name || "Restaurant", logoUrl: json.data?.logoUrl ?? null, faviconUrl: json.data?.seo?.faviconUrl || null };
  } catch {
    return { name: "Restaurant", logoUrl: null, faviconUrl: null };
  }
}

/**
 * Square PNG of a Cloudinary picture at the given size. The picture is first fitted into `fill` of the square (80% by default,
 * about 60% for the "maskable" icon, which phones crop to a circle or rounded square) and then padded onto white, so a wide
 * logo is never cut at the edges. Other addresses are used as they are.
 */
export function squareIcon(url: string, size: number, fill = 0.8): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) return url;
  const inner = Math.round(size * fill);
  return url.replace("/image/upload/", `/image/upload/c_fit,w_${inner},h_${inner}/c_pad,b_white,w_${size},h_${size},f_png/`);
}
