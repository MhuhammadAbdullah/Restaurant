import { randomUUID } from "node:crypto";
import type { EmailProvider, SendEmailInput } from "./gateway";

export interface GmailApiConfig {
  user: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export class GmailApiProvider implements EmailProvider {
  readonly providerName = "gmail-api";
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: GmailApiConfig) {}

  private async getAccessToken(): Promise<string> {
    const { user, clientId, clientSecret, refreshToken } = this.config;
    if (!user || !clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "GmailApiProvider: GMAIL_USER, GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_OAUTH_REFRESH_TOKEN must be configured",
      );
    }

    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.value;
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const result = (await response.json()) as GoogleTokenResponse;
    if (!response.ok || !result.access_token) {
      throw new Error(`GmailApiProvider: OAuth token refresh failed: ${result.error_description ?? result.error ?? response.statusText}`);
    }

    this.cachedToken = {
      value: result.access_token,
      expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
    };
    return this.cachedToken.value;
  }

  async send(input: SendEmailInput): Promise<void> {
    const raw = buildRawMessage(this.config.user, input);
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.getAccessToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`GmailApiProvider: Gmail API send failed (${response.status}): ${detail.slice(0, 500)}`);
    }
  }
}

function buildRawMessage(from: string, input: SendEmailInput): string {
  for (const [name, value] of [["From", from], ["To", input.to], ["Subject", input.subject]] as const) {
    if (/[\r\n]/.test(value)) throw new Error(`GmailApiProvider: invalid newline in ${name} header`);
  }

  const boundary = `restaurant-${randomUUID()}`;
  const plainText = input.text ?? stripHtml(input.html);
  const subject = `=?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`;
  const message = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(plainText, "utf8").toString("base64")),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(input.html, "utf8").toString("base64")),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return Buffer.from(message, "utf8").toString("base64url");
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function stripHtml(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
