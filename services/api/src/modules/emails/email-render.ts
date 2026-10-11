import type { TemplateVariable } from "./email-templates.defaults";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Admin-written HTML is trusted far more than customer text, but scripts / event handlers / javascript: links never belong in an email. */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed|form|link|meta|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|form|link|meta|style)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

/**
 * Fills {{variables}} in a template. Plain values are escaped (a customer's name can never inject HTML);
 * raw variables are server-built blocks. A raw block sitting alone in its own paragraph replaces the paragraph
 * (so a table is not nested inside a <p>).
 */
export function fillTemplate(template: string, values: Record<string, string>, variables: TemplateVariable[]): string {
  const rawNames = new Set(variables.filter((v) => v.raw).map((v) => v.name));
  let out = template;
  for (const name of rawNames) {
    const alone = new RegExp(`<p[^>]*>\\s*\\{\\{\\s*${name}\\s*\\}\\}\\s*</p>`, "g");
    out = out.replace(alone, () => values[name] ?? "");
  }
  return out.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, name: string) => {
    const v = values[name] ?? "";
    return rawNames.has(name) ? v : escapeHtml(v).replace(/\n/g, "<br/>");
  });
}

/** Subject lines are plain text: fill variables without HTML-escaping, strip newlines. */
export function fillSubject(subject: string, values: Record<string, string>): string {
  return subject.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, name: string) => (values[name] ?? "").replace(/\s+/g, " ")).trim();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|li|tr|blockquote|div)>/gi, "\n")
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type LayoutInput = { restaurantName: string; logoUrl: string | null; supportPhone: string | null; supportEmail: string | null; bodyHtml: string };

/** The shared branded frame every email goes out in: logo header, content card, small footer. Table-based so Gmail/Outlook keep it intact. */
export function wrapInLayout({ restaurantName, logoUrl, supportPhone, supportEmail, bodyHtml }: LayoutInput): string {
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(restaurantName)}" height="56" style="height:56px;width:auto;display:block;margin:0 auto;" />`
    : `<span style="font-size:22px;font-weight:700;color:#ED2320;">${escapeHtml(restaurantName)}</span>`;
  const contact = [supportPhone ? escapeHtml(supportPhone) : "", supportEmail ? escapeHtml(supportEmail) : ""].filter(Boolean).join(" &nbsp;|&nbsp; ");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td align="center" style="padding:8px 0 18px;">${logo}</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:28px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#222222;">
<style>h2{font-size:21px;margin:0 0 14px;color:#111;} p{margin:0 0 14px;} blockquote{margin:0 0 14px;padding:10px 14px;background:#f7f4ef;border-left:3px solid #ED2320;color:#333;} a{color:#ED2320;}</style>
${bodyHtml}
</td></tr>
<tr><td align="center" style="padding:18px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8a8a8a;">
${escapeHtml(restaurantName)}${contact ? `<br/>${contact}` : ""}<br/>This is an automated message about your order or request.
</td></tr>
</table></td></tr></table></body></html>`;
}

export function buttonHtml(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;background:#ED2320;color:#ffffff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(label)}</a>`;
}
