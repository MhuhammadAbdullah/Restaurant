"use client";

import { useEffect, useMemo, useState } from "react";
import { FaArrowUpRightFromSquare, FaXmark } from "react-icons/fa6";
import { ApiError } from "../../../../lib/api";
import { toast } from "../../../../store/useToastStore";
import { Switch } from "../../../../components/ui/switch";
import { Card, SaveBar, SeoHeader, useCanManageSeo } from "../../../../components/seo/SeoUi";
import { FIXED_PAGES, saveSeo, useCategoryPages, useQueryClient, useSeo, webBaseUrl, type SeoConfig } from "../../../../lib/seo";

type Robots = NonNullable<SeoConfig["robots"]>;
type Sitemap = NonNullable<SeoConfig["sitemap"]>;

const PRIVATE_PATHS = ["/checkout", "/account", "/order-confirmation"];

function ListEditor({ items, onChange, placeholder, validate }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; validate: (v: string) => string | null }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  function add() {
    const v = draft.trim();
    if (!v) return;
    const problem = validate(v);
    if (problem) return setError(problem);
    if (!items.includes(v)) onChange([...items, v]);
    setDraft("");
    setError(null);
  }
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="input w-full"
        />
        <button type="button" onClick={add} className="shrink-0 rounded-lg border border-neutral-300 px-4 text-sm font-medium hover:border-brand-red hover:text-brand-red">
          Add
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={it} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-3 pr-1.5 font-mono text-xs text-neutral-700">
              {it}
              <button type="button" onClick={() => onChange(items.filter((x) => x !== it))} aria-label={`Remove ${it}`} className="flex h-4 w-4 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700">
                <FaXmark size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 p-3">
      <div>
        <p className="text-sm font-medium text-neutral-800">{title}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}

export default function RobotsSitemapPage() {
  const queryClient = useQueryClient();
  const canManage = useCanManageSeo();
  const { site, seo } = useSeo();
  const categories = useCategoryPages();
  const [robots, setRobots] = useState<Robots>({});
  const [sitemap, setSitemap] = useState<Sitemap>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!site) return;
    setRobots({ allowAiSearch: seo.robots?.allowAiSearch !== false, blockAiTraining: !!seo.robots?.blockAiTraining, disallow: seo.robots?.disallow ?? [], customRules: seo.robots?.customRules ?? "" });
    setSitemap({ enabled: seo.sitemap?.enabled !== false, extraUrls: seo.sitemap?.extraUrls ?? [], excluded: seo.sitemap?.excluded ?? [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  const base = webBaseUrl(seo) || "https://your-website.com";
  const blocked = !!seo.noindexSite;

  const savedRobots = JSON.stringify({ allowAiSearch: seo.robots?.allowAiSearch !== false, blockAiTraining: !!seo.robots?.blockAiTraining, disallow: seo.robots?.disallow ?? [], customRules: seo.robots?.customRules ?? "" });
  const savedSitemap = JSON.stringify({ enabled: seo.sitemap?.enabled !== false, extraUrls: seo.sitemap?.extraUrls ?? [], excluded: seo.sitemap?.excluded ?? [] });
  const dirty = JSON.stringify(robots) !== savedRobots || JSON.stringify(sitemap) !== savedSitemap;

  // Mirrors the storefront's robots.txt generator so what you see is what Google gets.
  const preview = useMemo(() => {
    if (blocked) return "User-agent: *\nDisallow: /";
    const disallow = [...PRIVATE_PATHS, ...(robots.disallow ?? [])].map((p) => `Disallow: ${p}`);
    const lines: string[] = [];
    for (const bot of ["Googlebot", "Bingbot", ...(robots.allowAiSearch !== false ? ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot"] : [])]) lines.push(`User-agent: ${bot}`, "Allow: /", ...disallow, "");
    if (robots.blockAiTraining) for (const bot of ["GPTBot", "CCBot", "Google-Extended", "anthropic-ai"]) lines.push(`User-agent: ${bot}`, "Disallow: /", "");
    lines.push("User-agent: *", "Allow: /", ...disallow);
    if (robots.customRules?.trim()) lines.push("", robots.customRules.trim());
    if (sitemap.enabled !== false) lines.push("", `Sitemap: ${base}/sitemap.xml`);
    return lines.join("\n");
  }, [robots, sitemap.enabled, base, blocked]);

  const pageChoices = [...FIXED_PAGES.map((p) => ({ path: p.path, label: p.label })), ...categories.map((c) => ({ path: c.path, label: c.label }))];

  async function save() {
    setSaving(true);
    try {
      await saveSeo(queryClient, { robots, sitemap });
      toast.success("Robots and sitemap saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SeoHeader title="Robots & Sitemap" description="Tell search engines and AI crawlers what they may visit, and manage the sitemap Google uses to discover your pages." />

      {blocked && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">The whole website is currently hidden from Google (SEO & Meta Tags &gt; Site-wide defaults), so robots.txt blocks everything and the sitemap is empty.</p>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-70">
          <Card title="Who can visit" description="Googlebot and Bingbot are always allowed. Private pages (checkout, account, order confirmation) are always kept out.">
            <Toggle title="Allow AI search crawlers" hint="Lets OAI-SearchBot (ChatGPT search), ChatGPT-User and PerplexityBot show your restaurant in AI answers. Recommended." checked={robots.allowAiSearch !== false} onChange={(v) => setRobots((r) => ({ ...r, allowAiSearch: v }))} />
            <Toggle title="Block AI training crawlers" hint="Blocks GPTBot, CCBot, Google-Extended and anthropic-ai from using your content to train models. Does not affect Google Search." checked={!!robots.blockAiTraining} onChange={(v) => setRobots((r) => ({ ...r, blockAiTraining: v }))} />
          </Card>

          <Card title="Extra blocked paths" description="Anything you add here is hidden from all crawlers. Example: /staff-menu">
            <ListEditor items={robots.disallow ?? []} onChange={(v) => setRobots((r) => ({ ...r, disallow: v }))} placeholder="/path-to-block" validate={(v) => (v.startsWith("/") ? null : "Paths must start with /")} />
          </Card>

          <Card title="Advanced: custom rules" description="Raw robots.txt lines added at the end. Only for experts; wrong rules can hide your site.">
            <textarea value={robots.customRules ?? ""} onChange={(e) => setRobots((r) => ({ ...r, customRules: e.target.value }))} rows={4} spellCheck={false} placeholder={"User-agent: AhrefsBot\nDisallow: /"} className="input w-full font-mono text-[13px]" />
          </Card>

          <Card title="Sitemap" description="A list of all your public pages that Google reads to find new and changed content.">
            <Toggle title="Generate sitemap.xml" hint="Includes the home page, info pages and every active category automatically." checked={sitemap.enabled !== false} onChange={(v) => setSitemap((s) => ({ ...s, enabled: v }))} />
            <div>
              <p className="text-xs font-medium text-neutral-700">Leave these pages out of the sitemap</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pageChoices.map((p) => {
                  const off = (sitemap.excluded ?? []).includes(p.path);
                  return (
                    <button
                      key={p.path}
                      type="button"
                      onClick={() => setSitemap((s) => ({ ...s, excluded: off ? (s.excluded ?? []).filter((x) => x !== p.path) : [...(s.excluded ?? []), p.path] }))}
                      className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${off ? "border-red-300 bg-red-50 text-red-700 line-through" : "border-neutral-300 bg-white text-neutral-600 hover:border-brand-red hover:text-brand-red"}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-700">Extra addresses to include (optional)</p>
              <ListEditor items={sitemap.extraUrls ?? []} onChange={(v) => setSitemap((s) => ({ ...s, extraUrls: v }))} placeholder="/blog or https://..." validate={(v) => (v.startsWith("/") || /^https?:\/\//.test(v) ? null : "Use /path or a full https:// address")} />
            </div>
          </Card>
        </fieldset>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-xl border border-neutral-200 bg-neutral-900 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">robots.txt preview</p>
              <a href={`${base}/robots.txt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white">
                Open live <FaArrowUpRightFromSquare size={9} />
              </a>
            </div>
            <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-green-300">{preview}</pre>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
            <p className="font-semibold text-neutral-900">Submit your sitemap to Google</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-neutral-600">
              <li>Connect Search Console in Tracking &amp; Pixels.</li>
              <li>Open Search Console &gt; Sitemaps.</li>
              <li>
                Enter <span className="font-mono">sitemap.xml</span> and press Submit.
              </li>
            </ol>
            <a href={`${base}/sitemap.xml`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-red hover:underline">
              View live sitemap.xml <FaArrowUpRightFromSquare size={10} />
            </a>
          </div>
        </div>
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={save}
        onReset={() => {
          setRobots(JSON.parse(savedRobots));
          setSitemap(JSON.parse(savedSitemap));
        }}
        canManage={canManage}
      />
    </div>
  );
}
