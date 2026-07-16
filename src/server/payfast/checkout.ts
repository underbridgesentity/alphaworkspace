/**
 * Builds the PayFast subscription checkout form: field list (in the exact
 * order that gets signed) + action URL. The browser POSTs this as a plain
 * form — card details never touch our servers.
 */
import { PLANS } from "@/lib/plans";
import { buildSignature } from "./signature";

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export function payfastSandbox(): boolean {
  return process.env.PAYFAST_SANDBOX !== "false";
}

export function payfastProcessUrl(): string {
  return payfastSandbox()
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";
}

export interface CheckoutInput {
  workspaceId: string;
  workspaceName: string;
  plan: "team" | "studio";
  billing: "monthly" | "annual";
  mPaymentId: string;
  userEmail: string;
  userFirstName?: string;
}

export function checkoutAmountZar(
  plan: "team" | "studio",
  billing: "monthly" | "annual",
): number {
  const config = PLANS[plan];
  return billing === "annual" ? config.priceAnnualZar : config.priceMonthlyZar;
}

export function buildCheckout(input: CheckoutInput): {
  action: string;
  fields: Array<[string, string]>;
} {
  const amount = checkoutAmountZar(input.plan, input.billing).toFixed(2);
  const planName = PLANS[input.plan].name;

  // Order matters: this exact sequence is what gets signed.
  const fields: Array<[string, string]> = [
    ["merchant_id", process.env.PAYFAST_MERCHANT_ID ?? ""],
    ["merchant_key", process.env.PAYFAST_MERCHANT_KEY ?? ""],
    ["return_url", `${APP_URL()}/billing/return?ws=${input.workspaceId}`],
    ["cancel_url", `${APP_URL()}/billing/return?ws=${input.workspaceId}&cancelled=1`],
    ["notify_url", `${APP_URL()}/api/webhooks/payfast`],
    ["name_first", input.userFirstName ?? ""],
    ["email_address", input.userEmail],
    ["m_payment_id", input.mPaymentId],
    ["amount", amount],
    ["item_name", `Alpha Workspace — ${planName} plan (${input.billing})`],
    [
      "item_description",
      `${planName} band for ${input.workspaceName}. VAT inclusive.`,
    ],
    ["custom_str1", input.workspaceId],
    ["custom_str2", input.plan],
    ["custom_str3", input.billing],
    ["subscription_type", "1"],
    ["recurring_amount", amount],
    ["frequency", input.billing === "annual" ? "6" : "3"],
    ["cycles", "0"],
  ];

  const signature = buildSignature(fields, process.env.PAYFAST_PASSPHRASE);
  fields.push(["signature", signature]);

  return { action: payfastProcessUrl(), fields };
}
