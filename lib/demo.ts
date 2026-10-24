import { randomUUID } from "node:crypto";
import type { LedgerRow } from "./db";
import { eventLabel, unpaidSince } from "./webhook";

// PayPal sandbox can't fail a payment on cue, so DEMO_MODE adds fake failures to the ledger.
// They're marked by this prefix (and raw = {"demo": true}) and never come from a webhook.
export const DEMO_PREFIX = "DEMO-";
export const isDemoEvent = (eventId: string) => eventId.startsWith(DEMO_PREFIX);

export function demoFailure(
  subscriptionId: string,
  price?: { value: string; currency_code: string },
  now = new Date(),
): LedgerRow {
  return {
    eventId: `${DEMO_PREFIX}${randomUUID()}`,
    eventType: "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
    subscriptionId,
    amount: price?.value ?? null,
    currency: price?.currency_code ?? null,
    // ponytail: the simulated installment falls due "now", not on PayPal's real billing date, so the
    // grace clock in a demo starts today. Fine for a demo; a real failure uses its own date.
    occurredAt: now.toISOString(),
    raw: JSON.stringify({ demo: true }),
  };
}

export const ledgerLabel = (e: { event_id: string; event_type: string }) =>
  eventLabel(e.event_type) + (isDemoEvent(e.event_id) ? " (simulated)" : "");

// When the buyer fell behind, or null. A real failure counts only if PayPal also shows money owed;
// a simulated one can't change PayPal's balance, so in demo mode it counts on its own, dated from
// the first simulated click (not an older real failure), so every demo shows a fresh grace period.
export function behindSince(
  events: { event_id: string; event_type: string; occurred_at: string | Date }[] | null,
  owedOnPayPal: boolean,
  demoMode: boolean,
): Date | null {
  if (!events) return null;
  if (demoMode && events[0] && isDemoEvent(events[0].event_id)) {
    let first = events[0];
    for (const e of events) {
      if (!isDemoEvent(e.event_id)) break;
      first = e;
    }
    return new Date(first.occurred_at);
  }
  return owedOnPayPal ? unpaidSince(events) : null;
}
