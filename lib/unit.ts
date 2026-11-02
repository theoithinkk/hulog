import type { Subscription } from "./paypal";

export type Currency = "PHP" | "USD";

export type Unit = {
  name: string;
  project: string;
  tcp: number;
  monthlyAmount: number;
  months: number; // every installment in the contract
  prior?: number; // of those, paid before the buyer moved to Hulog; PayPal bills the rest
  currency: Currency;
};

type Result = { ok: true; unit: Unit } | { ok: false; error: string };

const MONEY = /^\d+(\.\d{1,2})?$/;

function money(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!MONEY.test(s)) return null;
  const n = Number(s);
  // Cap keeps toFixed() out of exponent notation, which PayPal rejects.
  return n > 0 && n <= 1e9 ? n : null;
}

const fail = (error: string): Result => ({ ok: false, error });

// Validates the broker's "New unit" form. Runs server-side, so it is the trust boundary.
export function parseUnit(raw: unknown): Result {
  if (!raw || typeof raw !== "object") return fail("Invalid form.");
  const r = raw as Record<string, unknown>;

  const name = String(r.name ?? "").trim();
  const project = String(r.project ?? "").trim();
  if (!name || name.length > 60) return fail("Unit name must be 1 to 60 characters.");
  if (!project || project.length > 60) return fail("Project must be 1 to 60 characters.");

  const tcp = money(r.tcp);
  const monthlyAmount = money(r.monthlyAmount);
  if (!tcp) return fail("Total contract price must be a positive amount (up to 2 decimals).");
  if (!monthlyAmount) return fail("Monthly amount must be a positive amount (up to 2 decimals).");
  if (monthlyAmount > tcp) return fail("Monthly amount can't be more than the total contract price.");

  const months = Number(r.months);
  if (!Number.isInteger(months) || months < 1 || months > 360) {
    return fail("Months must be a whole number from 1 to 360.");
  }

  const rawPrior = String(r.prior ?? "").trim();
  const prior = rawPrior ? Number(rawPrior) : 0;
  if (!Number.isInteger(prior) || prior < 0 || prior >= months) {
    return fail("Already paid must be a whole number, less than the total installments.");
  }

  const currency = r.currency;
  if (currency !== "PHP" && currency !== "USD") return fail("Currency must be PHP or USD.");

  return { ok: true, unit: { name, project, tcp, monthlyAmount, months, ...(prior ? { prior } : {}), currency } };
}

// IDs come from URLs and end up in PayPal API paths, so only accept PayPal's format.
export const isPlanId = (id: string) => /^P-[A-Z0-9]{8,40}$/.test(id);
export const isSubscriptionId = (id: string) => /^I-[A-Z0-9]{8,40}$/.test(id);

// Plan descriptions read "<project> - TCP <currency> <amount>" (see buildPlanBody); buyers and their
// families get "Total price" instead of the industry abbreviation.
export function totalPriceLabel(description?: string): string | null {
  const m = description?.match(/TCP ([A-Z]{3} [\d,]+(?:\.\d+)?)/);
  return m ? `Total price ${m[1]}` : null;
}

// PayPal only knows the installments it bills, so the plan description records the earlier ones.
export const priorInstallments = (description?: string) => Number(description?.match(/ - prior (\d+)$/)?.[1] ?? 0);

// The whole contract: what the broker says was paid before Hulog, plus PayPal's own count.
export function contractProgress(sub: Subscription, description?: string) {
  const cycles = sub.billing_info?.cycle_executions?.find((c) => c.tenure_type === "REGULAR");
  const prior = priorInstallments(description);
  return { prior, paid: prior + (cycles?.cycles_completed ?? 0), total: cycles ? prior + cycles.total_cycles : 0 };
}
