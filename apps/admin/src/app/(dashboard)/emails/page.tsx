"use client";

import { LoadingDots } from "../../../components/LoadingDots";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FaCircleCheck, FaEnvelope, FaMobileScreen, FaDesktop, FaPaperPlane, FaRotateLeft } from "react-icons/fa6";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { toast } from "../../../store/useToastStore";
import { confirmDialog } from "../../../store/useConfirmStore";
import { Switch } from "../../../components/ui/switch";
import { EmailBodyEditor, type EmailBodyEditorHandle } from "../../../components/emails/EmailBodyEditor";

type TemplateRow = { key: string; label: string; description: string; trigger: string; enabled: boolean; customized: boolean; canDisable: boolean; updatedAt: string | null };
type Variable = { name: string; description: string; raw?: boolean };
type Template = TemplateRow & { subject: string; body: string; defaultSubject: string; defaultBody: string; variables: Variable[] };
type Settings = { reviewDelayMinutes: number };

const DELAY_OPTIONS: [number, string][] = [
  [0, "Immediately"],
  [15, "15 minutes"],
  [30, "30 minutes"],
  [60, "1 hour"],
  [120, "2 hours"],
  [240, "4 hours"],
  [1440, "1 day"],
];

export default function EmailTemplatesPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "emails.manage");

  const { data: templates } = useQuery({ queryKey: ["email-templates"], queryFn: () => api.get<TemplateRow[]>("/emails/templates") });
  const [selected, setSelected] = useState("ORDER_REVIEW");
  const { data: tpl } = useQuery({ queryKey: ["email-template", selected], queryFn: () => api.get<Template>(`/emails/templates/${selected}`) });
  const { data: settings } = useQuery({ queryKey: ["email-settings"], queryFn: () => api.get<Settings>("/emails/settings") });

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const editorRef = useRef<EmailBodyEditorHandle>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [focusTarget, setFocusTarget] = useState<"subject" | "body">("body");

  // settings card
  const [delay, setDelay] = useState(30);
  const [savingSettings, setSavingSettings] = useState(false);
  useEffect(() => {
    if (settings) {
      setDelay(settings.reviewDelayMinutes);
    }
  }, [settings]);

  useEffect(() => {
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
    setEnabled(tpl.enabled);
    setLoadedKey(tpl.key + tpl.updatedAt + tpl.customized);
  }, [tpl]);

  const dirty = !!tpl && (subject !== tpl.subject || body !== tpl.body || enabled !== tpl.enabled);

  // ---- live preview (rendered by the server so it matches what customers get) ----
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  useEffect(() => {
    if (!tpl) return;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        setPreview(await api.post<{ subject: string; html: string }>(`/emails/templates/${tpl.key}/preview`, { subject, body }));
      } catch {
        // keep the last good preview
      } finally {
        setPreviewing(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [tpl, subject, body]);

  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    if (focusTarget === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      setSubject(subject.slice(0, start) + token + subject.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      editorRef.current?.insertText(token);
    }
  }

  async function save() {
    if (!tpl) return;
    setSaving(true);
    try {
      await api.put(`/emails/templates/${tpl.key}`, { subject, body, enabled });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["email-template", tpl.key] }), queryClient.invalidateQueries({ queryKey: ["email-templates"] })]);
      toast.success("Email template saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save the template");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!tpl) return;
    if (!(await confirmDialog({ title: "Reset to the default email?", message: "Your wording for this email will be replaced by the original text. This cannot be undone.", confirmLabel: "Reset", tone: "danger" }))) return;
    try {
      await api.post(`/emails/templates/${tpl.key}/reset`);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["email-template", tpl.key] }), queryClient.invalidateQueries({ queryKey: ["email-templates"] })]);
      toast.success("Reset to the default email");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not reset the template");
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await api.put("/emails/settings", { reviewDelayMinutes: delay });
      await queryClient.invalidateQueries({ queryKey: ["email-settings"] });
      toast.success("Email settings saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save the settings");
    } finally {
      setSavingSettings(false);
    }
  }

  // ---- send a test ----
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (testOpen && !testTo) setTestTo(me?.email ?? "");
  }, [testOpen, me, testTo]);
  async function sendTest() {
    if (!tpl) return;
    setTesting(true);
    try {
      await api.post(`/emails/templates/${tpl.key}/test`, { to: testTo.trim(), subject, body });
      toast.success(`Test email sent to ${testTo.trim()}`);
      setTestOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not send the test email");
    } finally {
      setTesting(false);
    }
  }

  const settingsDirty = !!settings && delay !== settings.reviewDelayMinutes;
  const vars = useMemo(() => tpl?.variables ?? [], [tpl]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Email Templates</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-500">Write the emails your customers receive. Pick an email on the left, change the wording, check the live preview and save. Anything you do not change keeps the standard text.</p>

      {!canManage && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">You can view templates but not edit them. Ask an admin for the &quot;Edit email templates&quot; permission.</p>}

      {/* review email settings */}
      <section className="mt-5 rounded-xl border border-neutral-200 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-900">Thank-you &amp; review email settings</p>
        <p className="mt-0.5 text-xs text-neutral-500">After an order is delivered, the customer gets a thank-you email with a button to review you on Google.</p>
        <fieldset disabled={!canManage} className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr_auto] sm:items-center">
          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Send it</span>
            <select value={delay} onChange={(e) => setDelay(Number(e.target.value))} className="input mt-1 w-full">
              {DELAY_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l} after delivery</option>
              ))}
            </select>
          </label>
          <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
            The Google review link comes from the <b>branch the order was delivered from</b>. Add it when you create or edit a branch (Branches &gt; Contact &amp; location). A branch with no link sends the thank-you email without the review button.
          </p>
          <button type="button" onClick={saveSettings} disabled={!settingsDirty || savingSettings} className="rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            {savingSettings ? <LoadingDots>Saving</LoadingDots> : "Save"}
          </button>
        </fieldset>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        {/* list */}
        <div className="space-y-2 lg:self-start">
          {templates?.map((t) => {
            const active = selected === t.key;
            return (
              <button key={t.key} onClick={() => setSelected(t.key)} className={`w-full rounded-xl border p-3.5 text-left transition ${active ? "border-brand-red bg-brand-red/5" : "border-neutral-200 bg-white hover:border-neutral-300"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold ${active ? "text-brand-red" : "text-neutral-900"}`}>{t.label}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.enabled ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{t.enabled ? "On" : "Off"}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{t.trigger}</p>
                {t.customized && <p className="mt-1.5 text-[11px] font-medium text-neutral-400">Customised</p>}
              </button>
            );
          })}
        </div>

        {/* editor + preview */}
        <div className="min-w-0 space-y-5">
          {tpl && (
            <>
              <section className="rounded-xl border border-neutral-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-base font-semibold text-neutral-900">
                      <FaEnvelope size={14} className="text-brand-red" /> {tpl.label}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">{tpl.description}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-neutral-700">
                    {tpl.canDisable ? (enabled ? "Email is on" : "Email is off") : "Always on"}
                    <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canManage || !tpl.canDisable} aria-label="Turn this email on or off" />
                  </label>
                </div>

                <fieldset disabled={!canManage} className="mt-5 space-y-4" key={loadedKey}>
                  <label className="block">
                    <span className="text-xs font-medium text-neutral-700">Subject</span>
                    <input ref={subjectRef} value={subject} onChange={(e) => setSubject(e.target.value)} onFocus={() => setFocusTarget("subject")} className="input mt-1 w-full" />
                  </label>

                  <div onFocusCapture={() => setFocusTarget("body")}>
                    <span className="text-xs font-medium text-neutral-700">Message</span>
                    <div className="mt-1">
                      <EmailBodyEditor ref={editorRef} value={body} onChange={setBody} resetKey={loadedKey} disabled={!canManage} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-neutral-700">Fill-in tags</p>
                    <p className="text-[11px] text-neutral-400">Click a tag to put it where your cursor is. Each one is replaced with the real details when the email is sent.</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {vars.map((v) => (
                        <button key={v.name} type="button" onClick={() => insertVariable(v.name)} title={v.description} className="rounded-lg border border-neutral-300 bg-neutral-50 px-2.5 py-1 font-mono text-[11px] text-neutral-700 transition hover:border-brand-red hover:text-brand-red">
                          {`{{${v.name}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </fieldset>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-4">
                  <button type="button" onClick={reset} disabled={!canManage || !tpl.customized} className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">
                    <FaRotateLeft size={12} /> Reset to default
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setTestOpen(true)} disabled={!canManage} className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">
                      <FaPaperPlane size={12} /> Send test
                    </button>
                    <button type="button" onClick={save} disabled={!canManage || !dirty || saving} className="rounded-lg bg-brand-red px-6 py-2 text-sm font-semibold text-white disabled:opacity-40">
                      {saving ? <LoadingDots>Saving</LoadingDots> : dirty ? "Save changes" : "Saved"}
                    </button>
                  </div>
                </div>
              </section>

              {/* preview */}
              <section className="rounded-xl border border-neutral-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-neutral-900">Live preview {previewing && <span className="ml-2 text-xs font-normal text-neutral-400">updating...</span>}</p>
                  <div className="flex rounded-lg border border-neutral-200 p-0.5">
                    {(
                      [
                        ["desktop", FaDesktop],
                        ["mobile", FaMobileScreen],
                      ] as const
                    ).map(([d, Icon]) => (
                      <button key={d} type="button" onClick={() => setDevice(d)} aria-label={d} className={`flex h-8 w-9 items-center justify-center rounded-md ${device === d ? "bg-brand-red text-white" : "text-neutral-500 hover:bg-neutral-100"}`}>
                        <Icon size={13} />
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-3 truncate rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                  <span className="text-neutral-400">Subject: </span>
                  {preview?.subject ?? "..."}
                </p>
                <div className="mt-3 flex justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 p-3">
                  <iframe title="Email preview" sandbox="" srcDoc={preview?.html ?? ""} style={{ width: device === "mobile" ? 375 : "100%", maxWidth: "100%", height: 560 }} className="rounded-md border-0 bg-white" />
                </div>
                <p className="mt-2 text-[11px] text-neutral-400">The preview uses sample details (a made-up customer and order).</p>
              </section>
            </>
          )}
        </div>
      </div>

      {testOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !testing && setTestOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="flex items-center gap-2 text-base font-semibold text-neutral-900">
              <FaCircleCheck size={14} className="text-brand-red" /> Send a test email
            </p>
            <p className="mt-1 text-xs text-neutral-500">Sends this email, with made-up order details, so you can see how it looks in a real inbox.</p>
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" className="input mt-4 w-full" autoFocus />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setTestOpen(false)} disabled={testing} className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm">Cancel</button>
              <button onClick={sendTest} disabled={testing || !/^\S+@\S+\.\S+$/.test(testTo.trim())} className="flex-1 rounded-lg bg-brand-red py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {testing ? <LoadingDots>Sending</LoadingDots> : "Send test"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
