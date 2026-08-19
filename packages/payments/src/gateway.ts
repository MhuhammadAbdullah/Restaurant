export interface InitiatePaymentInput {
  orderId: string;
  orderNumber: string;
  amountPaisa: number;
  currency: string;
  customerEmail?: string;
  customerPhone?: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
}

export interface InitiatePaymentResult {
  redirectUrl: string;
  providerRef: string;
}

export interface WebhookVerifyInput {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface WebhookVerifyResult {
  valid: boolean;
  providerRef: string;
  orderId: string;
  status: "paid" | "failed";
  amountPaisa: number;
  raw: unknown;
}

export interface RefundInput {
  providerRef: string;
  amountPaisa: number;
}

export interface RefundResult {
  success: boolean;
  providerRef: string;
}

/**
 * Every payment provider (PayFast now, others later) implements this. Callers in `services/api`
 * only ever talk to this interface — never to a provider SDK directly — so adding a second
 * gateway is a new adapter, not a rewrite of the order/payment flow.
 */
export interface PaymentGateway {
  readonly providerName: string;
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyWebhook(input: WebhookVerifyInput): Promise<WebhookVerifyResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}
