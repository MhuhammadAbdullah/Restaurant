import nodemailer, { type Transporter } from "nodemailer";
import type { EmailProvider, SendEmailInput } from "./gateway";

export interface GmailConfig {
  /** The Gmail address to send from, e.g. "yourrestaurant@gmail.com". */
  user: string;
  /**
   * A Gmail *App Password* (Google Account → Security → 2-Step Verification → App passwords) —
   * not the account's normal login password. Gmail rejects SMTP auth with the real password once
   * 2FA is on, which it must be to generate an app password in the first place.
   */
  appPassword: string;
  /** Defaults to `user` — Gmail silently rewrites the From header to the authenticated account anyway. */
  from?: string;
}

export class GmailProvider implements EmailProvider {
  readonly providerName = "gmail";
  // Built lazily on first send, not in the constructor — the app can boot fine before Gmail
  // credentials exist in .env; only an actual send attempt fails (with a clear message) until
  // they're added.
  private transporter: Transporter | null = null;

  constructor(private readonly config: GmailConfig) {}

  private getTransporter(): Transporter {
    if (!this.config.user || !this.config.appPassword) {
      throw new Error("GmailProvider: GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env before sending email");
    }
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: this.config.user, pass: this.config.appPassword },
      });
    }
    return this.transporter;
  }

  async send(input: SendEmailInput): Promise<void> {
    await this.getTransporter().sendMail({
      from: this.config.from ?? this.config.user,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}
