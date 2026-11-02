import { neon } from "@neondatabase/serverless";

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set");
  return neon(url);
}

export type LedgerRow = {
  eventId: string;
  eventType: string;
  subscriptionId: string | null;
  amount: string | null;
  currency: string | null;
  occurredAt: string;
  raw: string;
};

// Returns false when the event was already stored (a retry or resend).
export async function insertEvent(r: LedgerRow) {
  const rows = await db()`
    insert into payment_events (event_id, event_type, subscription_id, amount, currency, occurred_at, raw)
    values (${r.eventId}, ${r.eventType}, ${r.subscriptionId}, ${r.amount}, ${r.currency}, ${r.occurredAt}, ${r.raw})
    on conflict (event_id) do nothing
    returning event_id`;
  return rows.length > 0;
}

// Demo reset. Only simulated rows go; real events stay append-only.
export async function deleteDemoEvents(subscriptionId: string) {
  await db()`delete from payment_events where subscription_id = ${subscriptionId} and event_id like 'DEMO-%'`;
}

export type LedgerEntry = {
  event_id: string;
  event_type: string;
  subscription_id: string | null;
  amount: string | null;
  currency: string | null;
  occurred_at: string | Date;
  due_at?: string | null; // a simulated failure's backdated due date (see demoFailure)
};

export async function eventsFor(subscriptionId: string) {
  return (await db()`
    select event_id, event_type, subscription_id, amount, currency, occurred_at, raw->>'dueAt' as due_at
    from payment_events where subscription_id = ${subscriptionId}
    order by occurred_at desc limit 100`) as LedgerEntry[];
}

// Every buyer the ledger has heard from, most recent first. Separate from recentEvents: a paused plan
// gets no new events, and it still has to stay on the board.
// ponytail: capped at 20 because each buyer costs a PayPal call; add paging when a broker has more.
export async function recentBuyerIds() {
  const rows = (await db()`
    select subscription_id from payment_events where subscription_id is not null
    group by subscription_id order by max(occurred_at) desc limit 20`) as { subscription_id: string }[];
  return rows.map((r) => r.subscription_id);
}

export async function recentEvents() {
  return (await db()`
    select event_id, event_type, subscription_id, amount, currency, occurred_at
    from payment_events where subscription_id is not null
    order by occurred_at desc limit 20`) as LedgerEntry[];
}
