import type { LedgerEntry } from "./db";
import { addMonths, manilaDate } from "./maceda";
import type { Plan, Subscription, Transaction } from "./paypal";

// Made-up buyers for demos, because a sandbox plan can't be years old or at every stage at once.
// There's no PayPal behind them: lib/paypal.ts and lib/db.ts answer from here, only in DEMO_MODE,
// and the pages label them. Their rights still come from the real engine. Dates move with today.

type Sample = {
  id: string;
  given: string;
  surname: string;
  unit: string;
  price: string;
  currency: string;
  paid: number;
  total: number;
  dueInDays: number; // the next installment's due date, from today; negative means it was missed
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
};

const SAMPLES: Sample[] = [
  { id: "I-SAMPLEMARIA", given: "Maria", surname: "Santos", unit: "Unit 5A, Cebu Bay Residences", price: "18500.00", currency: "PHP", paid: 8, total: 60, dueInDays: 12, status: "ACTIVE" },
  { id: "I-SAMPLERAMON", given: "Ramon", surname: "Reyes", unit: "Lot 14, Lipa Hillside Homes", price: "12000.00", currency: "PHP", paid: 14, total: 48, dueInDays: -12, status: "ACTIVE" },
  { id: "I-SAMPLELIZA", given: "Liza", surname: "Cruz", unit: "Unit 3F, Davao Palm Village", price: "22000.00", currency: "PHP", paid: 38, total: 60, dueInDays: -5, status: "ACTIVE" },
  { id: "I-SAMPLEJUN", given: "Jun", surname: "Bautista", unit: "Lot 7, Iloilo Riverside", price: "9500.00", currency: "PHP", paid: 9, total: 36, dueInDays: -75, status: "SUSPENDED" },
  { id: "I-SAMPLEANA", given: "Ana", surname: "Villanueva", unit: "Unit 9D, Baguio Pine Court", price: "420.00", currency: "USD", paid: 86, total: 120, dueInDays: 20, status: "ACTIVE" },
  { id: "I-SAMPLECARLO", given: "Carlo", surname: "Mendoza", unit: "House 2, Tagaytay Ridge", price: "15000.00", currency: "PHP", paid: 36, total: 36, dueInDays: -20, status: "EXPIRED" },
];

const PLAN_PREFIX = "P-SAMPLE-";
const SHOWN_SALES = 6; // installmentNumbers() treats earlier sales as simply missing from the ledger

const demoOn = () => process.env.DEMO_MODE === "true";
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

const byId = (id: string) => (demoOn() ? SAMPLES.find((s) => s.id === id) : undefined);
const behind = (s: Sample) => s.status !== "EXPIRED" && s.dueInDays < 0;
const dueDate = (s: Sample, now: Date) => addDays(manilaDate(now), s.dueInDays);
// Monthly charges up to the installment before the one due.
const charge = (s: Sample, n: number, now: Date) => addMonths(dueDate(s, now), n - s.paid - 1);

export const isSampleId = (id: string) => byId(id) !== undefined;
export const sampleIds = () => (demoOn() ? SAMPLES.map((s) => s.id) : []);

export function sampleSubscription(id: string, now = new Date()): Subscription | undefined {
  const s = byId(id);
  if (!s) return undefined;
  return {
    id: s.id,
    status: s.status,
    plan_id: `${PLAN_PREFIX}${s.id}`,
    start_time: iso(charge(s, 1, now)),
    subscriber: { name: { given_name: s.given, surname: s.surname } },
    billing_info: {
      ...(s.status === "ACTIVE" && !behind(s) ? { next_billing_time: iso(dueDate(s, now)) } : {}),
      cycle_executions: [{ tenure_type: "REGULAR", cycles_completed: s.paid, total_cycles: s.total }],
      outstanding_balance: { value: behind(s) ? s.price : "0.00", currency_code: s.currency },
      last_payment: { amount: { value: s.price, currency_code: s.currency }, time: iso(charge(s, s.paid, now)) },
    },
  };
}

export function samplePlan(id: string): Plan | undefined {
  const s = id.startsWith(PLAN_PREFIX) ? byId(id.slice(PLAN_PREFIX.length)) : undefined;
  if (!s) return undefined;
  return {
    id,
    name: s.unit,
    status: "ACTIVE",
    create_time: "2020-01-01T00:00:00Z",
    billing_cycles: [
      {
        tenure_type: "REGULAR",
        frequency: { interval_unit: "MONTH" },
        total_cycles: s.total,
        pricing_scheme: { fixed_price: { value: s.price, currency_code: s.currency } },
      },
    ],
  };
}

// Newest first, like the real ledger.
export function sampleEvents(id: string, now = new Date()): LedgerEntry[] | undefined {
  const s = byId(id);
  if (!s) return undefined;
  const event = (name: string, event_type: string, at: Date, charged = true): LedgerEntry => ({
    event_id: `SAMPLE-${s.id}-${name}`,
    event_type,
    subscription_id: s.id,
    amount: charged ? s.price : null,
    currency: charged ? s.currency : null,
    occurred_at: iso(at),
  });
  const sales = Array.from({ length: Math.min(s.paid, SHOWN_SALES) }, (_, i) =>
    event(`sale-${s.paid - i}`, "PAYMENT.SALE.COMPLETED", charge(s, s.paid - i, now)),
  );
  const due = dueDate(s, now);
  return [
    ...(s.status === "SUSPENDED" ? [event("suspended", "BILLING.SUBSCRIPTION.SUSPENDED", addDays(due, 15), false)] : []),
    ...(behind(s) ? [event("failed", "BILLING.SUBSCRIPTION.PAYMENT.FAILED", due)] : []),
    ...sales,
  ];
}

// Every charge, newest first, so totals match the installments paid.
export function sampleTransactions(id: string, now = new Date()): Transaction[] | undefined {
  const s = byId(id);
  if (!s) return undefined;
  const txn = (name: string, status: string, at: Date): Transaction => ({
    id: `SAMPLE-${s.id}-${name}`,
    status,
    time: iso(at),
    amount_with_breakdown: { gross_amount: { value: s.price, currency_code: s.currency } },
  });
  return [
    ...(behind(s) ? [txn("failed", "DECLINED", dueDate(s, now))] : []),
    ...Array.from({ length: s.paid }, (_, i) => txn(`sale-${s.paid - i}`, "COMPLETED", charge(s, s.paid - i, now))),
  ];
}
