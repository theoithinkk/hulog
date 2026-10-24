import { manilaDate } from "./maceda";

// One strand per installment, in one of four states. The woven strip on every page draws these;
// a fifth state is never improvised.
export type Strand = "paid" | "grace" | "missed" | "upcoming";

// `behind` is set when the buyer has missed the next installment. Its strand is "grace" while the
// Maceda grace period runs (its last day included, on the Manila calendar) and "missed" after,
// or when no grace period is available.
export function strands(
  total: number,
  paid: number,
  behind: { graceEnds: Date | null } | null,
  today = new Date(),
): Strand[] {
  const done = Math.min(Math.max(paid, 0), total);
  return Array.from({ length: total }, (_, i): Strand => {
    if (i < done) return "paid";
    if (i === done && behind) {
      return behind.graceEnds && manilaDate(today) <= behind.graceEnds ? "grace" : "missed";
    }
    return "upcoming";
  });
}

// Which installment each payment row in the ledger is about, so every payment carries its number.
// `paid` is PayPal's count of completed installments; the ledger can lack sales PayPal never sent
// (the first charge at signup often has no webhook), so those are assumed to come first.
// ponytail: assumes missing sales are the earliest ones; contract records would make this exact.
export function installmentNumbers(
  events: { event_id: string; event_type: string; occurred_at: string | Date }[],
  paid: number,
): Map<string, number> {
  const asc = [...events].sort((a, b) => +new Date(a.occurred_at) - +new Date(b.occurred_at));
  const sales = asc.filter((e) => e.event_type === "PAYMENT.SALE.COMPLETED").length;
  let count = Math.max(0, paid - sales);
  const numbers = new Map<string, number>();
  for (const e of asc) {
    if (e.event_type === "PAYMENT.SALE.COMPLETED") numbers.set(e.event_id, ++count);
    else if (e.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") numbers.set(e.event_id, count + 1);
  }
  return numbers;
}

// The swatch for a numbered ledger row. A sale is paid; a failure shows its installment's live state
// (grace or missed) and stays "missed" in history once caught up, never green.
export function rowStrand(eventType: string, n: number, weave: Strand[]): Strand {
  if (eventType === "PAYMENT.SALE.COMPLETED") return "paid";
  const live = weave[n - 1];
  return live === "grace" ? "grace" : "missed";
}

export function strandCounts(s: Strand[]) {
  const counts = { paid: 0, grace: 0, missed: 0, upcoming: 0 };
  for (const x of s) counts[x]++;
  return counts;
}
