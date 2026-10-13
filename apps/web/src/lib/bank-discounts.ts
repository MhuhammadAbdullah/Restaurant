const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export type BankDiscountsPage = {
  enabled: boolean;
  heading: string;
  subheading: string;
  items: { id: string; name: string; image: string; linkUrl: string | null }[];
};

/** Server-side: the Bank Discounts page content, or null when the API cannot be reached. */
export async function getBankDiscounts(): Promise<BankDiscountsPage | null> {
  try {
    const res = await fetch(`${API_URL}/bank-discounts`, { next: { revalidate: 30 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: BankDiscountsPage };
    return json.data ?? null;
  } catch {
    return null;
  }
}
