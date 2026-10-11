"use client";

import { useEffect, useMemo, useState } from "react";
import { FaArrowRight, FaTrash, FaTriangleExclamation } from "react-icons/fa6";
import { ApiError } from "../../../../lib/api";
import { toast } from "../../../../store/useToastStore";
import { Switch } from "../../../../components/ui/switch";
import { Card, SaveBar, SeoHeader, useCanManageSeo } from "../../../../components/seo/SeoUi";
import { saveSeo, useQueryClient, useSeo } from "../../../../lib/seo";

type Rule = { from: string; to: string; permanent: boolean };

const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p).toLowerCase();

export default function RedirectsPage() {
  const queryClient = useQueryClient();
  const canManage = useCanManageSeo();
  const { site, seo } = useSeo();
  const [rules, setRules] = useState<Rule[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (site) setRules(seo.redirects ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  const dirty = JSON.stringify(rules) !== JSON.stringify(seo.redirects ?? []);

  /** Problems that hurt SEO: chains (A->B->C), loops and duplicates. */
  const problems = useMemo(() => {
    const byFrom = new Map(rules.map((r) => [norm(r.from), r]));
    return rules.map((r) => {
      const next = byFrom.get(norm(r.to));
      if (norm(r.from) === norm(r.to)) return "Redirects to itself";
      if (next) return next.to && norm(next.to) === norm(r.from) ? "Loop: these two redirect to each other" : `Chain: the target also redirects to ${next.to}. Point this straight to ${next.to}`;
      return null;
    });
  }, [rules]);

  function add() {
    setError(null);
    const f = from.trim();
    const t = to.trim();
    if (!f.startsWith("/")) return setError("The old address must start with /, for example /old-menu");
    if (!t || !(t.startsWith("/") || /^https?:\/\//.test(t))) return setError("The new address must be /path or a full https:// address");
    if (norm(f) === norm(t)) return setError("Old and new address are the same");
    if (rules.some((r) => norm(r.from) === norm(f))) return setError("A redirect for this old address already exists");
    setRules((r) => [...r, { from: f, to: t, permanent }]);
    setFrom("");
    setTo("");
  }

  async function save() {
    setSaving(true);
    try {
      await saveSeo(queryClient, { redirects: rules });
      toast.success("Redirects saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SeoHeader title="Redirects" description="When a page address changes or is removed, send visitors and Google to the right place so you keep your rankings and never show a broken link." />

      <fieldset disabled={!canManage} className="mt-5 space-y-4 disabled:opacity-70">
        <Card title="Add a redirect" description="Example: /old-menu to /category/burgers">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
            <label className="block">
              <span className="text-xs font-medium text-neutral-700">Old address</span>
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="/old-page" className="input mt-1 w-full font-mono text-[13px]" />
            </label>
            <FaArrowRight className="hidden pb-3 text-neutral-300 md:block" size={28} />
            <label className="block">
              <span className="text-xs font-medium text-neutral-700">New address</span>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="/new-page"
                className="input mt-1 w-full font-mono text-[13px]"
              />
            </label>
            <button type="button" onClick={add} className="rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
              Add redirect
            </button>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 p-3">
            <div>
              <p className="text-sm font-medium text-neutral-800">{permanent ? "Permanent (recommended)" : "Temporary"}</p>
              <p className="text-xs text-neutral-500">{permanent ? "The page moved for good. Google transfers its ranking to the new address." : "Only for a short time, such as a seasonal page. Google keeps the old address."}</p>
            </div>
            <Switch checked={permanent} onCheckedChange={setPermanent} aria-label="Permanent redirect" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </Card>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {rules.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">No redirects yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {rules.map((r, i) => (
                <li key={r.from} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[13px] text-neutral-800">{r.from}</span>
                    <FaArrowRight size={11} className="text-neutral-300" />
                    <span className="min-w-0 truncate font-mono text-[13px] text-neutral-800">{r.to}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.permanent ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{r.permanent ? "Permanent" : "Temporary"}</span>
                    <button type="button" onClick={() => setRules((all) => all.filter((_, x) => x !== i))} aria-label="Remove redirect" className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600">
                      <FaTrash size={12} />
                    </button>
                  </div>
                  {problems[i] && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
                      <FaTriangleExclamation size={11} /> {problems[i]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </fieldset>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setRules(seo.redirects ?? [])} canManage={canManage} />
    </div>
  );
}
