import { getSite, siteUrlOf, PRIVATE_PATHS } from "../../lib/seo";

export const revalidate = 60;

/** robots.txt is generated from Admin > SEO & Marketing > Robots & Sitemap. */
export async function GET() {
  const { seo } = await getSite();
  const r = seo.robots ?? {};
  const lines: string[] = [];

  if (seo.noindexSite) {
    lines.push("User-agent: *", "Disallow: /");
  } else {
    const disallow = [...PRIVATE_PATHS, ...(r.disallow ?? [])];
    // Search engines and search-grounded AI crawlers get an explicit, unambiguous allow.
    const allowed = ["Googlebot", "Bingbot", ...(r.allowAiSearch !== false ? ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot"] : [])];
    for (const bot of allowed) lines.push(`User-agent: ${bot}`, "Allow: /", ...disallow.map((p) => `Disallow: ${p}`), "");
    if (r.blockAiTraining) for (const bot of ["GPTBot", "CCBot", "Google-Extended", "anthropic-ai"]) lines.push(`User-agent: ${bot}`, "Disallow: /", "");
    lines.push("User-agent: *", "Allow: /", ...disallow.map((p) => `Disallow: ${p}`));
  }

  if (r.customRules?.trim()) lines.push("", r.customRules.trim());
  if (seo.sitemap?.enabled !== false && !seo.noindexSite) lines.push("", `Sitemap: ${siteUrlOf(seo)}/sitemap.xml`);

  return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
