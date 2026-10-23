import { describe, expect, it } from "vitest";
import { addMonths, macedaRights, manilaDate } from "./maceda";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const base = { contractStart: d("2026-01-15"), dueDate: d("2026-11-15"), totalPaidCents: 0 };

describe("under 2 years of installments (Sec. 4)", () => {
  it("gives a 60-day grace period from the due date and no refund", () => {
    expect(macedaRights({ ...base, installmentsPaid: 11, totalPaidCents: 16_500_000 })).toEqual({
      section: "4",
      yearsPaid: 0,
      graceDays: 60,
      graceEnds: d("2027-01-14"),
      refundPercent: 0,
      refundCents: 0,
    });
  });

  it("still applies at 23 installments", () => {
    expect(macedaRights({ ...base, installmentsPaid: 23 }).section).toBe("4");
  });
});

describe("2 years or more (Sec. 3)", () => {
  it("gives one grace month per year paid and a 50% refund at exactly 2 years", () => {
    expect(macedaRights({ ...base, installmentsPaid: 24, totalPaidCents: 36_000_000 })).toEqual({
      section: "3",
      yearsPaid: 2,
      graceMonths: 2,
      graceAvailable: true,
      graceEnds: d("2027-01-15"),
      nextGraceFrom: null,
      refundPercent: 50,
      refundCents: 18_000_000,
    });
  });

  it.each([
    [60, 50], // 5 years: still the base 50%
    [71, 50],
    [72, 55], // year 6 is the first after year 5
    [84, 60],
    [144, 85],
    [156, 90], // 13 years reaches the cap
    [200, 90], // and it stays there
  ])("refunds the right percentage after %i installments", (installmentsPaid, percent) => {
    expect(macedaRights({ ...base, installmentsPaid }).refundPercent).toBe(percent);
  });

  it("ends the grace period on the last day of a shorter month", () => {
    const r = macedaRights({ ...base, installmentsPaid: 24, dueDate: d("2026-12-31") });
    expect(r.graceEnds).toEqual(d("2027-02-28"));
  });

  it("refuses a second grace period in the same 5-year window of the contract", () => {
    const r = macedaRights({
      contractStart: d("2026-01-15"),
      dueDate: d("2029-03-01"),
      installmentsPaid: 36,
      totalPaidCents: 0,
      graceUsedAt: [d("2028-06-01")],
    });
    expect(r).toMatchObject({ graceAvailable: false, graceEnds: null, nextGraceFrom: d("2031-01-15") });
  });

  it("allows grace again in a later 5-year window", () => {
    const r = macedaRights({
      contractStart: d("2020-01-15"),
      dueDate: d("2026-03-01"),
      installmentsPaid: 72,
      totalPaidCents: 0,
      graceUsedAt: [d("2023-06-01")],
    });
    expect(r).toMatchObject({ graceAvailable: true, graceMonths: 6, graceEnds: d("2026-09-01") });
  });

  it("rounds the refund to whole centavos", () => {
    const r = macedaRights({ ...base, installmentsPaid: 24, totalPaidCents: 36_000_001 });
    expect(Number.isInteger(r.refundCents)).toBe(true);
  });
});

describe("input checks", () => {
  it.each([
    ["negative installments", { ...base, installmentsPaid: -1 }],
    ["fractional installments", { ...base, installmentsPaid: 1.5 }],
    ["negative total", { ...base, installmentsPaid: 1, totalPaidCents: -1 }],
    ["a due date before the contract", { ...base, installmentsPaid: 1, dueDate: d("2025-01-01") }],
  ])("rejects %s", (_, input) => {
    expect(() => macedaRights(input)).toThrow();
  });
});

describe("calendar edges", () => {
  it("reads an evening UTC payment as the next Manila day", () => {
    expect(manilaDate(new Date("2026-03-31T17:00:00Z"))).toEqual(d("2026-04-01"));
  });

  it("lands on Feb 29 in a leap year", () => {
    expect(addMonths(d("2027-12-31"), 2)).toEqual(d("2028-02-29"));
  });

  it("keeps a due date one day short of 5 years in the first window", () => {
    const r = macedaRights({
      contractStart: d("2026-01-15"),
      dueDate: d("2031-01-14"),
      installmentsPaid: 59,
      totalPaidCents: 0,
      graceUsedAt: [d("2028-06-01")],
    });
    expect(r).toMatchObject({ graceAvailable: false, nextGraceFrom: d("2031-01-15") });
  });
});
