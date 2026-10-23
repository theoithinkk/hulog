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

export type LedgerEntry = {
  event_id: string;
  event_type: string;
  subscription_id: string | null;
  amount: string | null;
  currency: string | null;
  occurred_at: string | Date;
};

export async function eventsFor(subscriptionId: string) {
  return (await db()`
    select event_id, event_type, subscription_id, amount, currency, occurred_at
    from payment_events where subscription_id = ${subscriptionId}
    order by occurred_at desc limit 100`) as LedgerEntry[];
}

export async function recentEvents() {
  return (await db()`
    select event_id, event_type, subscription_id, amount, currency, occurred_at
    from payment_events where subscription_id is not null
    order by occurred_at desc limit 20`) as LedgerEntry[];
}
