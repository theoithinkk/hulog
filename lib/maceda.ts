// Maceda Law (RA 6552) rights for one missed, or upcoming, installment.
// Pure and deterministic: every legal number Hulog shows comes from here, never from the AI.
// Dates are calendar days at midnight UTC; convert with manilaDate() first.

export type MacedaInput = {
  installmentsPaid: number; // monthly installments paid so far
  totalPaidCents: number; // everything paid, in centavos (Sec. 3(b) counts down payments and deposits too)
  contractStart: Date;
  dueDate: Date; // the installment that was, or would be, missed
  graceUsedAt?: Date[]; // dates a Sec. 3(a) grace period was used
};

export type Rights =
  | { section: "4"; yearsPaid: number; graceDays: 60; graceEnds: Date; refundPercent: 0; refundCents: 0 }
  | {
      section: "3";
      yearsPaid: number;
      graceMonths: number;
      graceAvailable: boolean;
      graceEnds: Date | null;
      nextGraceFrom: Date | null;
      refundPercent: number;
      refundCents: number;
    };

// The Philippine calendar day of an instant, as midnight UTC. Deadlines run on Manila dates.
export const manilaDate = (d: Date) =>
  new Date(`${d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })}T00:00:00Z`);

const addDays = (d: Date, days: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));

// Jan 31 + 1 month is Feb 28 (or 29), not Mar 3.
export function addMonths(d: Date, months: number) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

const monthsBetween = (from: Date, to: Date) =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
  (to.getUTCMonth() - from.getUTCMonth()) -
  (to.getUTCDate() < from.getUTCDate() ? 1 : 0);

export function macedaRights(input: MacedaInput): Rights {
  const { installmentsPaid, totalPaidCents, contractStart, dueDate, graceUsedAt = [] } = input;
  if (!Number.isInteger(installmentsPaid) || installmentsPaid < 0) throw new Error("installmentsPaid must be a whole number >= 0");
  if (!Number.isInteger(totalPaidCents) || totalPaidCents < 0) throw new Error("totalPaidCents must be a whole number >= 0");
  if (dueDate < contractStart) throw new Error("dueDate is before contractStart");

  const yearsPaid = Math.floor(installmentsPaid / 12);

  // Sec. 4: under two years, at least 60 days' grace from the due date, and no cash surrender value.
  if (yearsPaid < 2) {
    return { section: "4", yearsPaid, graceDays: 60, graceEnds: addDays(dueDate, 60), refundPercent: 0, refundCents: 0 };
  }

  // Sec. 3(a): one month of grace per year paid, once in every five years of the life of the contract.
  // Five-year windows counted from contractStart (the literal reading), confirmed in broker review.
  const windowOf = (d: Date) => Math.floor(monthsBetween(contractStart, d) / 60);
  const window = windowOf(dueDate);
  const graceAvailable = !graceUsedAt.some((g) => windowOf(g) === window);

  // Sec. 3(b): 50% of total payments, plus 5% per year after the fifth, up to 90%.
  const refundPercent = Math.min(90, 50 + 5 * Math.max(0, yearsPaid - 5));

  return {
    section: "3",
    yearsPaid,
    graceMonths: yearsPaid,
    graceAvailable,
    graceEnds: graceAvailable ? addMonths(dueDate, yearsPaid) : null,
    nextGraceFrom: graceAvailable ? null : addMonths(contractStart, 60 * (window + 1)),
    refundPercent,
    refundCents: Math.round((totalPaidCents * refundPercent) / 100),
  };
}
