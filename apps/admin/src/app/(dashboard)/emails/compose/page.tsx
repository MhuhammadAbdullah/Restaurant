"use client";

import { LoadingDots } from "../../../../components/LoadingDots";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FaPaperPlane } from "react-icons/fa6";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { confirmDialog } from "../../../../store/useConfirmStore";
import { EmailBodyEditor, type EmailBodyEditorHandle } from "../../../../components/emails/EmailBodyEditor";

const hasText = (html: string) => html.replace(/<[^>]+>/g, "").trim().length > 0;

export default function ComposeEmailPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canSend = hasPermission(me, "emails.send");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [resetKey, setResetKey] = useState("0");
  const editorRef = useRef<EmailBodyEditorHandle>(null);

  const valid = /^\S+@\S+\.\S+$/.test(to.trim()) && subject.trim().length > 0 && hasText(body);

  async function send() {
    if (!(await confirmDialog({ title: "Send this email?", message: `It will be sent to ${to.trim()} with your restaurant's logo and footer.`, confirmLabel: "Send email", tone: "info" }))) return;
    setSending(true);
    try {
      await api.post("/emails/send", { to: to.trim(), subject: subject.trim(), body });
      toast.success(`Email sent to ${to.trim()}`);
      await queryClient.invalidateQueries({ queryKey: ["email-logs"] });
      setTo("");
      setSubject("");
      setBody("");
      setResetKey(String(Date.now()));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not send the email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-neutral-900">Write an Email</h1>
      <p className="mt-1 text-sm text-neutral-500">Send a one-off email to a customer or anyone else. It goes out with your logo and footer, and is saved in the Email Log.</p>

      {!canSend && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">You do not have permission to send emails. Ask an admin for the &quot;Send emails&quot; permission.</p>}

      <fieldset disabled={!canSend} className="mt-5 space-y-4 rounded-xl border border-neutral-200 bg-white p-5 disabled:opacity-70">
        <label className="block">
          <span className="text-xs font-medium text-neutral-700">To</span>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" className="input mt-1 w-full" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-neutral-700">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} placeholder="e.g. About your recent order" className="input mt-1 w-full" />
        </label>
        <div>
          <span className="text-xs font-medium text-neutral-700">Message</span>
          <div className="mt-1">
            <EmailBodyEditor ref={editorRef} value={body} onChange={setBody} resetKey={resetKey} minHeight={280} />
          </div>
        </div>
        <div className="flex justify-end border-t border-neutral-100 pt-4">
          <button type="button" onClick={send} disabled={!valid || sending} className="flex items-center gap-2 rounded-lg bg-brand-red px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            <FaPaperPlane size={12} /> {sending ? <LoadingDots>Sending</LoadingDots> : "Send email"}
          </button>
        </div>
      </fieldset>
    </div>
  );
}
