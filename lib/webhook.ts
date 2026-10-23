import { insertEvent, type LedgerRow } from "./db";
import { verifyWebhook } from "./paypal";

// PayPal events are a few KB; anything this big isn't one.
const MAX_BODY = 64 * 1024;

type Amount = { value?: string; currency_code?: string; total?: string; currency?: string };

export type PayPalEvent = {
  id: string;
  event_type: string;
  create_time: string;
  resource: {
    id?: string;
    billing_agreement_id?: string;
    amount?: Amount;
    billing_info?: { last_failed_payment?: { amount?: Amount } };
  };
};

export function toLedgerRow(e: PayPalEvent, raw = JSON.stringify(e)): LedgerRow {
  const r = e.resource ?? {};
  // A sale belongs to a subscription through billing_agreement_id; subscription events carry it as resource.id.
  const isSale = e.event_type.startsWith("PAYMENT.SALE.");
  const isSubscription = e.event_type.startsWith("BILLING.SUBSCRIPTION.");
  // last_failed_payment stays on the subscription after a failure, so only a failure event may use it.
  const amount = isSale
    ? r.amount
    : e.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED"
      ? r.billing_info?.last_failed_payment?.amount
      : undefined;
  return {
    eventId: e.id,
    eventType: e.event_type,
    subscriptionId: (isSale ? r.billing_agreement_id : isSubscription ? r.id : null) ?? null,
    amount: amount?.total ?? amount?.value ?? null,
    currency: amount?.currency ?? amount?.currency_code ?? null,
    occurredAt: e.create_time,
    raw,
  };
}

const LABELS: Record<string, string> = {
  "PAYMENT.SALE.COMPLETED": "Payment received",
  "PAYMENT.SALE.PENDING": "Payment pending",
  "PAYMENT.SALE.DENIED": "Payment denied",
  "PAYMENT.SALE.REFUNDED": "Payment refunded",
  "PAYMENT.SALE.REVERSED": "Payment reversed",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED": "Payment failed",
  "BILLING.SUBSCRIPTION.ACTIVATED": "Plan started",
  "BILLING.SUBSCRIPTION.SUSPENDED": "Plan suspended",
  "BILLING.SUBSCRIPTION.CANCELLED": "Plan cancelled",
};

export const eventLabel = (type: string) => LABELS[type] ?? type;

// Returns the HTTP status for PayPal. Throws (500) on storage errors so PayPal retries the delivery.
export async function handleWebhook(headers: Headers, body: string): Promise<number> {
  if (Buffer.byteLength(body) > MAX_BODY) return 413;

  let event: PayPalEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return 400;
  }
  if (typeof event?.id !== "string" || typeof event.event_type !== "string" || typeof event.create_time !== "string") {
    return 400;
  }

  if (!(await verifyWebhook(headers, body))) return 400;

  await insertEvent(toLedgerRow(event, body));
  return 200;
}
