export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Every email provider (Gmail SMTP now, an "official" transactional provider later) implements
 * this. Callers in `services/api` only ever talk to this interface — never to a provider SDK
 * directly — so switching providers is a config change, not a rewrite of the OTP flow.
 */
export interface EmailProvider {
  readonly providerName: string;
  send(input: SendEmailInput): Promise<void>;
}
