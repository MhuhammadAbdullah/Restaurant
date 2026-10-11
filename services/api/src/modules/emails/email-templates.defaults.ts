/**
 * The built-in system emails. A restaurant can override the subject / body / on-off of each one (EmailTemplate rows);
 * until it does, these defaults are what customers receive.
 *
 * Bodies are simple HTML (what the admin editor produces). Variables are written {{like_this}}:
 *  - plain variables are HTML-escaped when filled in,
 *  - "raw" variables are blocks the server builds itself (tables, buttons) and are inserted as-is.
 */

export type TemplateKey = "OTP" | "ORDER_CONFIRMATION" | "ORDER_REVIEW" | "COMPLAINT_REPLY";

export type TemplateVariable = { name: string; description: string; raw?: boolean };

export type TemplateDefinition = {
  key: TemplateKey;
  label: string;
  description: string;
  /** When it is sent, in plain words, shown in the admin. */
  trigger: string;
  subject: string;
  body: string;
  variables: TemplateVariable[];
  sample: Record<string, string>;
};

const COMMON_VARS: TemplateVariable[] = [
  { name: "restaurant_name", description: "Your restaurant's name" },
  { name: "support_phone", description: "Your contact phone number" },
];

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    key: "OTP",
    label: "Login / registration code",
    description: "The 6-digit code a customer types to log in or create an account.",
    trigger: "Instantly, when a customer asks for a code.",
    subject: "{{otp_code}} is your verification code",
    body: `<h2>{{otp_heading}}</h2><p>Enter this code to continue:</p><p>{{otp_code_box}}</p><p>This code expires in {{expires_minutes}} minutes. If you did not request it, you can ignore this email.</p>`,
    variables: [
      { name: "otp_code", description: "The 6-digit code" },
      { name: "otp_code_box", description: "The code shown large in a highlighted box", raw: true },
      { name: "otp_heading", description: "\"Your login code\" or \"Verify your email...\"" },
      { name: "expires_minutes", description: "Minutes before the code expires" },
      ...COMMON_VARS,
    ],
    sample: { otp_code: "482915", otp_code_box: "OTP_BOX_SAMPLE", otp_heading: "Your login code", expires_minutes: "5", restaurant_name: "Your Restaurant", support_phone: "+92 300 0000000" },
  },
  {
    key: "ORDER_CONFIRMATION",
    label: "Order confirmation",
    description: "Sent to the customer when you accept their order, with the full order details.",
    trigger: "When staff accept an online order.",
    subject: "Order {{order_id}} confirmed - {{restaurant_name}}",
    body: `<h2>Thank you for your order!</h2><p>Hi {{customer_name}},</p><p>Your order <strong>{{order_id}}</strong> from {{restaurant_name}} has been accepted. Here are the details:</p><p>{{order_details_html}}</p><p>{{order_button}}</p><p>Need help? Call us on {{support_phone}}.</p>`,
    variables: [
      { name: "customer_name", description: "Customer's name" },
      { name: "order_id", description: "Short Order ID, e.g. NWBNND" },
      { name: "invoice_no", description: "Invoice number, e.g. 202610110090" },
      { name: "order_type", description: "Delivery, Pickup, ..." },
      { name: "order_date", description: "When the order was placed" },
      { name: "branch_name", description: "Branch that will prepare the order" },
      { name: "order_total", description: "Grand total, e.g. Rs. 2,450.00" },
      { name: "order_details_html", description: "Full order block: info, items and payment details", raw: true },
      { name: "order_button", description: "\"Check Order Status\" button", raw: true },
      { name: "order_link", description: "Plain link to the order status page" },
      ...COMMON_VARS,
    ],
    sample: {
      customer_name: "Ali Khan",
      order_id: "NWBNND",
      invoice_no: "202610110090",
      order_type: "DELIVERY",
      order_date: "11 Oct 2026, 7:15 PM",
      branch_name: "DHA Branch",
      order_total: "Rs. 2,450.00",
      order_link: "https://example.com/order",
      restaurant_name: "Your Restaurant",
      support_phone: "+92 300 0000000",
    },
  },
  {
    key: "ORDER_REVIEW",
    label: "Thank you & Google review",
    description: "A thank-you note with a button to leave a Google review, sent a while after the order is delivered.",
    trigger: "After an order is delivered or completed (default: 30 minutes later). Once per order.",
    subject: "Thank you for ordering from {{restaurant_name}}",
    body: `<h2>Thank you, {{customer_name}}!</h2><p>Your order <strong>{{order_id}}</strong> from {{branch_name}} has been delivered. We hope you enjoyed every bite.</p><p>Your feedback means a lot to us. If you have a minute, please share your experience on Google:</p><p>{{review_button}}</p><p>Something not right? <a href="{{complaint_link}}">Tell us here</a> and we will make it right.</p><p>See you again soon,<br/>{{restaurant_name}}</p>`,
    variables: [
      { name: "customer_name", description: "Customer's name" },
      { name: "order_id", description: "Short Order ID, e.g. NWBNND" },
      { name: "invoice_no", description: "Invoice number" },
      { name: "branch_name", description: "Branch the order came from" },
      { name: "order_total", description: "Grand total" },
      { name: "order_items_html", description: "List of the items they ordered", raw: true },
      { name: "review_button", description: "\"Rate us on Google\" button (empty if no review link is set)", raw: true },
      { name: "review_url", description: "Plain Google review link" },
      { name: "complaint_link", description: "Link to the complaint form" },
      ...COMMON_VARS,
    ],
    sample: {
      customer_name: "Ali Khan",
      order_id: "NWBNND",
      invoice_no: "202610110090",
      branch_name: "DHA Branch",
      order_total: "Rs. 2,450.00",
      review_url: "https://search.google.com/local/writereview?placeid=EXAMPLE",
      complaint_link: "https://example.com/complaints",
      restaurant_name: "Your Restaurant",
      support_phone: "+92 300 0000000",
    },
  },
  {
    key: "COMPLAINT_REPLY",
    label: "Complaint reply",
    description: "Sent to the customer when staff reply to their complaint (and tick \"Email this reply\").",
    trigger: "When staff post a reply on a complaint.",
    subject: "Re: {{complaint_subject}} ({{complaint_id}})",
    body: `<p>Hi {{customer_name}},</p><p>Thank you for contacting {{restaurant_name}}. Here is our reply to your complaint <strong>{{complaint_id}}</strong>:</p><blockquote>{{reply_message}}</blockquote><p>Current status: <strong>{{complaint_status}}</strong></p><p>If you need anything else, just reply to this message or call {{support_phone}}.</p><p>Regards,<br/>{{staff_name}}<br/>{{restaurant_name}}</p>`,
    variables: [
      { name: "customer_name", description: "Customer's name" },
      { name: "complaint_id", description: "Complaint ID, e.g. CMP-00012" },
      { name: "complaint_subject", description: "The subject they wrote" },
      { name: "complaint_status", description: "Open, In progress, Resolved..." },
      { name: "reply_message", description: "The reply the staff member typed" },
      { name: "staff_name", description: "Name of the staff member replying" },
      ...COMMON_VARS,
    ],
    sample: {
      customer_name: "Ali Khan",
      complaint_id: "CMP-00012",
      complaint_subject: "Burger was cold",
      complaint_status: "In progress",
      reply_message: "We are very sorry about this. We have spoken to the branch and will send a replacement.",
      staff_name: "Support Team",
      restaurant_name: "Your Restaurant",
      support_phone: "+92 300 0000000",
    },
  },
];

export const TEMPLATE_BY_KEY = new Map(TEMPLATE_DEFINITIONS.map((t) => [t.key, t]));
