export type Currency = "PHP" | "USD";

export type Unit = {
  name: string;
  project: string;
  tcp: number;
  monthlyAmount: number;
  months: number;
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

  const currency = r.currency;
  if (currency !== "PHP" && currency !== "USD") return fail("Currency must be PHP or USD.");

  return { ok: true, unit: { name, project, tcp, monthlyAmount, months, currency } };
}

// IDs come from URLs and end up in PayPal API paths, so only accept PayPal's format.
export const isPlanId = (id: string) => /^P-[A-Z0-9]{8,40}$/.test(id);
export const isSubscriptionId = (id: string) => /^I-[A-Z0-9]{8,40}$/.test(id);
