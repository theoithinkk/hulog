import { randomUUID } from "node:crypto";
import type { LedgerRow } from "./db";
import { eventLabel, unpaidSince } from "./webhook";

// PayPal sandbox can't fail a payment on cue, so DEMO_MODE adds fake failures to the ledger.
// They're marked by this prefix (and raw = {"demo": true}) and never come from a webhook.
export const DEMO_PREFIX = "DEMO-";
export const isDemoEvent = (eventId: string) => eventId.startsWith(DEMO_PREFIX);

// Far enough back that a grace period has run out; needs a contract older than this.
export const LONG_MISS_DAYS = 75;
export const LONG_MISS_MIN_PRIOR = 3;

// Prepared buyers, one per contract stage. The site is public, so visitors can't change them;
// they try the controls on TRY_DEMO_BUYER or on a plan they subscribe to themselves.
const PREPARED_BUYERS = new Set([
  "I-242X6XTG64BB",
  "I-B6H6USY48STE",
  "I-Y8XJ2NR46X4C",
  "I-44AB396PNF68",
  "I-0SAJ0NDCENJA",
  "I-9E5GA6EFYD6B",
]);
export const isPreparedBuyer = (id: string) => PREPARED_BUYERS.has(id);
export const TRY_DEMO_BUYER = "I-U7BW563L9E5R";

const SUSPENDED = "BILLING.SUBSCRIPTION.SUSPENDED";

// The newest event that says anything about payment. Suspending a plan says nothing either way.
export const latestPaymentEvent = <T extends { event_type: string }>(events: T[]) =>
  events.find((e) => e.event_type !== SUSPENDED);

// `dueAt` backdates the missed installment. The row itself is still recorded now, so it stays the
// newest event: a real charge from before the simulation doesn't clear it.
export function demoFailure(
  subscriptionId: string,
  price?: { value: string; currency_code: string },
  now = new Date(),
  dueAt?: Date,
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
    raw: JSON.stringify(dueAt ? { demo: true, dueAt: dueAt.toISOString() } : { demo: true }),
  };
}

export const ledgerLabel = (e: { event_id: string; event_type: string }) =>
  eventLabel(e.event_type) + (isDemoEvent(e.event_id) ? " (simulated)" : "");

// When the buyer fell behind, or null. A real failure counts only if PayPal also shows money owed;
// a simulated one can't change PayPal's balance, so in demo mode it counts on its own, dated from
// the first simulated click (not an older real failure), so every demo shows a fresh grace period.
export function behindSince(
  events: { event_id: string; event_type: string; occurred_at: string | Date; due_at?: string | null }[] | null,
  owedOnPayPal: boolean,
  demoMode: boolean,
): Date | null {
  if (!events) return null;
  const relevant = events.filter((e) => e.event_type !== SUSPENDED);
  if (demoMode && relevant[0] && isDemoEvent(relevant[0].event_id)) {
    let first = relevant[0];
    for (const e of relevant) {
      if (!isDemoEvent(e.event_id)) break;
      first = e;
    }
    return new Date(first.due_at ?? first.occurred_at);
  }
  return owedOnPayPal ? unpaidSince(events) : null;
}
