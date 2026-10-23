-- Every verified PayPal webhook event. event_id is PayPal's ID, so a retried delivery is stored once.
create table if not exists payment_events (
  event_id        text primary key,
  event_type      text not null,
  subscription_id text,
  amount          numeric(12, 2),
  currency        text,
  occurred_at     timestamptz not null,
  received_at     timestamptz not null default now(),
  raw             jsonb not null
);

create index if not exists payment_events_subscription
  on payment_events (subscription_id, occurred_at desc);
