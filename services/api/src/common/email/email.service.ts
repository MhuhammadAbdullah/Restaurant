import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GmailProvider, ResendEmailProvider, type EmailProvider } from "@restaurant/email";
import type { Env } from "../../config/env.schema";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: EmailProvider;

  constructor(private readonly config: ConfigService<Env, true>) {
    const providerName = this.config.get("EMAIL_PROVIDER", { infer: true });
    if (providerName === "resend") {
      this.provider = new ResendEmailProvider({
        apiKey: this.config.get("RESEND_API_KEY", { infer: true }) ?? "",
        from: this.config.get("RESEND_FROM_EMAIL", { infer: true }) ?? "",
      });
    } else {
      this.provider = new GmailProvider({
        user: this.config.get("GMAIL_USER", { infer: true }) ?? "",
        appPassword: this.config.get("GMAIL_APP_PASSWORD", { infer: true }) ?? "",
      });
    }
  }

  async sendOtpEmail(to: string, code: string, purpose: "LOGIN" | "REGISTER"): Promise<void> {
    const heading = purpose === "LOGIN" ? "Your login code" : "Verify your email to finish registering";
    await this.provider.send({
      to,
      subject: `${code} is your verification code`,
      html: `
        <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
          <h2>${heading}</h2>
          <p>Enter this code to continue:</p>
          <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px;">${code}</p>
          <p style="color: #666; font-size: 13px;">This code expires in 5 minutes. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
      text: `${heading}\n\nYour verification code is: ${code}\n\nThis code expires in 5 minutes.`,
    });
    this.logger.log(`OTP email sent to ${to} via ${this.provider.providerName} (${purpose})`);
  }

  async sendOrderConfirmationEmail(params: OrderConfirmationEmailParams): Promise<void> {
    const { to, orderNumber, restaurantName } = params;
    await this.provider.send({
      to,
      subject: `Order ${orderNumber} confirmed — ${restaurantName}`,
      html: renderOrderConfirmationHtml(params),
      text: renderOrderConfirmationText(params),
    });
    this.logger.log(`Order confirmation email sent to ${to} via ${this.provider.providerName} (order ${orderNumber})`);
  }
}

export type OrderConfirmationEmailParams = {
  to: string;
  customerName: string | null;
  orderNumber: string;
  restaurantName: string;
  statusUrl: string;
  createdAt: Date;
  orderType: string;
  isPickup: boolean;
  isDelivery: boolean;
  branchName: string;
  branchAddress: string | null;
  branchPhone: string | null;
  deliveryAddress: string | null;
  items: Array<{ name: string; quantity: number; lineTotalPaisa: number }>;
  paymentMethod: string;
  subtotalPaisa: number;
  taxPaisa: number;
  deliveryFeePaisa: number;
  discountPaisa: number;
  loyaltyDiscountPaisa: number;
  grandTotalPaisa: number;
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  COD: "Cash on Delivery",
  ONLINE: "Online Payment",
  CASH: "Cash",
  CARD: "Card",
  QR: "QR Payment",
};

function money(paisa: number): string {
  return `Rs. ${(paisa / 100).toLocaleString("en-PK", { minimumFractionDigits: 2 })}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderOrderConfirmationHtml(params: OrderConfirmationEmailParams): string {
  const greeting = params.customerName ? `Hi ${escapeHtml(params.customerName)},` : "Hi,";

  const itemRows = params.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;color:#444;border-bottom:1px solid #f2f2f2;">${i.quantity} x ${escapeHtml(i.name)}</td><td style="padding:8px 0;text-align:right;color:#111;border-bottom:1px solid #f2f2f2;">${money(i.lineTotalPaisa)}</td></tr>`,
    )
    .join("");

  const orderInfoRows = [
    row("Order Type", escapeHtml(params.orderType.replace(/_/g, " "))),
    row("Date", params.createdAt.toLocaleString()),
    params.isDelivery && params.deliveryAddress ? row("Delivery Address", escapeHtml(params.deliveryAddress)) : "",
  ].join("");

  const pickupBlock = params.isPickup
    ? `<p style="color:#666;font-size:13px;margin:14px 0 4px;">You have to collect your order from:</p>
       <p style="margin:0 0 4px;font-weight:700;">${escapeHtml(params.branchName)}</p>
       ${params.branchAddress ? `<p style="color:#666;font-size:13px;margin:0 0 4px;">${escapeHtml(params.branchAddress)}</p>` : ""}
       ${params.branchPhone ? `<p style="color:#666;font-size:13px;margin:0;">Phone: ${escapeHtml(params.branchPhone)}</p>` : ""}`
    : "";

  const paymentRows = [
    row("Payment Method", PAYMENT_METHOD_LABEL[params.paymentMethod] ?? params.paymentMethod),
    row("Subtotal", money(params.subtotalPaisa)),
    params.deliveryFeePaisa > 0 ? row("Delivery Fee", money(params.deliveryFeePaisa)) : "",
    row("Tax", money(params.taxPaisa)),
    params.discountPaisa > 0 ? row("Discount", `-${money(params.discountPaisa)}`) : "",
    params.loyaltyDiscountPaisa > 0 ? row("Loyalty Discount", `-${money(params.loyaltyDiscountPaisa)}`) : "",
    row("Grand Total", money(params.grandTotalPaisa), { bold: true, borderTop: true }),
  ].join("");

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Thank you for your order!</h2>
      <p style="margin: 0 0 10px;">${greeting}</p>
      <p style="margin: 0 0 20px;">Your order <strong>${escapeHtml(params.orderNumber)}</strong> from ${escapeHtml(params.restaurantName)} has been received.</p>

      <div style="border:1px solid #eee;border-radius:12px;padding:20px;margin-top:16px;">
        <p style="font-size:17px;font-weight:700;margin:0 0 14px;">Order Information</p>
        <table style="width:100%;border-collapse:collapse;">${orderInfoRows}</table>
        ${pickupBlock}
      </div>

      <div style="border:1px solid #eee;border-radius:12px;padding:20px;margin-top:16px;">
        <p style="font-size:17px;font-weight:700;margin:0 0 14px;">Items</p>
        <table style="width:100%;border-collapse:collapse;">${itemRows}</table>
      </div>

      <div style="border:1px solid #eee;border-radius:12px;padding:20px;margin-top:16px;">
        <p style="font-size:17px;font-weight:700;margin:0 0 14px;">Payment Details</p>
        <table style="width:100%;border-collapse:collapse;">${paymentRows}</table>
      </div>

      <p style="margin: 28px 0 10px;">
        <a href="${params.statusUrl}" style="background: #d4342c; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          Check Order Status
        </a>
      </p>
      <p style="color: #666; font-size: 13px; margin: 0;">Or copy this link into your browser: ${params.statusUrl}</p>
    </div>
  `;
}

/** Table-based label/value row — flex/inline-block layout gets silently stripped by several
 * email clients (notably Gmail), which collapses label and value together with no gap. A
 * two-cell table row is the one layout technique that reliably survives across email clients. */
function row(label: string, value: string, opts?: { bold?: boolean; borderTop?: boolean }): string {
  const weight = opts?.bold ? "font-weight:700;" : "";
  const border = opts?.borderTop ? "border-top:1px solid #eee;padding-top:10px;" : "";
  const labelColor = opts?.bold ? "#111" : "#666";
  return `<tr>
    <td style="padding:5px 0;${border}${weight}color:${labelColor};">${label}</td>
    <td style="padding:5px 0;${border}${weight}text-align:right;color:#111;">${value}</td>
  </tr>`;
}

function renderOrderConfirmationText(params: OrderConfirmationEmailParams): string {
  const greeting = params.customerName ? `Hi ${params.customerName},` : "Hi,";
  const lines = [
    "Thank you for your order!",
    "",
    greeting,
    "",
    `Your order ${params.orderNumber} from ${params.restaurantName} has been received.`,
    "",
    `Order Type: ${params.orderType.replace(/_/g, " ")}`,
    `Date: ${params.createdAt.toLocaleString()}`,
  ];
  if (params.isDelivery && params.deliveryAddress) lines.push(`Delivery Address: ${params.deliveryAddress}`);
  if (params.isPickup) {
    lines.push("", `Collect your order from: ${params.branchName}`);
    if (params.branchAddress) lines.push(params.branchAddress);
    if (params.branchPhone) lines.push(`Phone: ${params.branchPhone}`);
  }

  lines.push("", "Items:");
  for (const item of params.items) lines.push(`  ${item.quantity} x ${item.name} — ${money(item.lineTotalPaisa)}`);

  lines.push(
    "",
    "Payment Details:",
    `  Payment Method: ${PAYMENT_METHOD_LABEL[params.paymentMethod] ?? params.paymentMethod}`,
    `  Subtotal: ${money(params.subtotalPaisa)}`,
  );
  if (params.deliveryFeePaisa > 0) lines.push(`  Delivery Fee: ${money(params.deliveryFeePaisa)}`);
  lines.push(`  Tax: ${money(params.taxPaisa)}`);
  if (params.discountPaisa > 0) lines.push(`  Discount: -${money(params.discountPaisa)}`);
  if (params.loyaltyDiscountPaisa > 0) lines.push(`  Loyalty Discount: -${money(params.loyaltyDiscountPaisa)}`);
  lines.push(`  Grand Total: ${money(params.grandTotalPaisa)}`, "", `Check your order status here: ${params.statusUrl}`);

  return lines.join("\n");
}
