import { Resend } from "resend";
import type { EmailProvider, SendEmailInput } from "./gateway";

export interface ResendConfig {
  apiKey: string;
  /** Must be a verified sending domain in the Resend dashboard, e.g. "orders@yourdomain.com". */
  from: string;
}

/** The "official" provider to switch to once a verified sending domain is ready — see GmailProvider for the interim one. */
export class ResendEmailProvider implements EmailProvider {
  readonly providerName = "resend";
  private client: Resend | null = null;

  constructor(private readonly config: ResendConfig) {}

  private getClient(): Resend {
    if (!this.config.apiKey) {
      throw new Error("ResendEmailProvider: RESEND_API_KEY must be set in .env before sending email");
    }
    if (!this.client) this.client = new Resend(this.config.apiKey);
    return this.client;
  }

  async send(input: SendEmailInput): Promise<void> {
    const result = await this.getClient().emails.send({
      from: this.config.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (result.error) {
      throw new Error(`ResendEmailProvider: ${result.error.message}`);
    }
  }
}
