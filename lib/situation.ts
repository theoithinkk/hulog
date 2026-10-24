import { unstable_cache } from "next/cache";
import type { LedgerEntry } from "./db";
import { behindSince } from "./demo";
import type { Situation } from "./explain";
import { macedaRights, manilaDate } from "./maceda";
import { getPlan, type Subscription } from "./paypal";

// Plans don't change after creation, so one PayPal lookup an hour per plan is plenty.
export const cachedPlan = (id: string) => unstable_cache(() => getPlan(id), ["plan", id], { revalidate: 3600 })();

// What the Maceda engine needs: payments made (PayPal) and the installment the buyer is behind on (ledger).
export async function situationFor(
  sub: Subscription,
  events: LedgerEntry[] | null,
  demoMode: boolean,
): Promise<Situation | null> {
  const cycles = sub.billing_info?.cycle_executions?.find((c) => c.tenure_type === "REGULAR");
  if (!cycles || !sub.start_time || !["ACTIVE", "SUSPENDED"].includes(sub.status)) return null;

  // Behind only if the ledger shows an unpaid failure and PayPal agrees money is owed;
  // either source alone can be stale (a lost webhook, or a balance PayPal hasn't updated yet).
  // In demo mode a simulated failure counts without PayPal's balance (see lib/demo.ts).
  const owed = Number(sub.billing_info?.outstanding_balance?.value ?? 0) > 0;
  const unpaid = behindSince(events, owed, demoMode);
  const missed = unpaid !== null;
  const due = unpaid ?? sub.billing_info?.next_billing_time;
  const price = (await cachedPlan(sub.plan_id)).billing_cycles.find((c) => c.tenure_type === "REGULAR")?.pricing_scheme
    .fixed_price;
  // The currency code ends up in text sent to the model; accept only an ISO code.
  if (!due || !price || !/^[A-Z]{3}$/.test(price.currency_code)) return null;

  const dueDate = manilaDate(new Date(due));
  return {
    rights: macedaRights({
      installmentsPaid: cycles.cycles_completed,
      totalPaidCents: cycles.cycles_completed * Math.round(Number(price.value) * 100),
      contractStart: manilaDate(new Date(sub.start_time)),
      dueDate,
      // ponytail: grace already used isn't tracked yet; it only matters after 2+ years. Add with contract records.
    }),
    missed,
    dueDate,
    currency: price.currency_code,
  };
}
