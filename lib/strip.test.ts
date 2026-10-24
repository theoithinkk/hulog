import { describe, expect, it } from "vitest";
import { installmentNumbers, rowStrand, strandCounts, strands } from "./strip";

const today = new Date("2026-10-24T05:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("strands", () => {
  it("weaves paid strands, then upcoming ones", () => {
    const s = strands(36, 1, null, today);
    expect(s).toHaveLength(36);
    expect(s[0]).toBe("paid");
    expect(s.slice(1).every((x) => x === "upcoming")).toBe(true);
  });

  it("marks the missed installment as in grace until the grace period ends", () => {
    expect(strands(36, 1, { graceEnds: day("2026-12-23") }, today)[1]).toBe("grace");
  });

  it("marks it missed once the grace period has ended", () => {
    expect(strands(36, 1, { graceEnds: day("2026-10-23") }, today)[1]).toBe("missed");
  });

  it("marks it missed when no grace period is available", () => {
    expect(strands(36, 30, { graceEnds: null }, today)[30]).toBe("missed");
  });

  it("counts the grace period's last day as still in grace", () => {
    expect(strands(36, 1, { graceEnds: day("2026-10-24") }, today)[1]).toBe("grace");
  });

  it("keeps a fully paid plan fully paid", () => {
    expect(strands(12, 12, { graceEnds: null }, today).every((x) => x === "paid")).toBe(true);
  });

  it("clamps impossible counts", () => {
    expect(strands(3, 5, null, today)).toEqual(["paid", "paid", "paid"]);
    expect(strands(2, -1, null, today)).toEqual(["upcoming", "upcoming"]);
  });
});

describe("strandCounts", () => {
  it("counts each state for the legend", () => {
    expect(strandCounts(strands(36, 1, { graceEnds: day("2026-12-23") }, today))).toEqual({
      paid: 1,
      grace: 1,
      missed: 0,
      upcoming: 34,
    });
  });
});

describe("installmentNumbers", () => {
  const ev = (event_id: string, event_type: string, day: string) => ({ event_id, event_type, occurred_at: `2026-${day}T02:00:00Z` });
  const SALE = "PAYMENT.SALE.COMPLETED";
  const FAILED = "BILLING.SUBSCRIPTION.PAYMENT.FAILED";

  it("numbers sales in order and a failure as the installment after them", () => {
    const n = installmentNumbers([ev("a", SALE, "10-01"), ev("b", SALE, "11-01"), ev("c", FAILED, "12-01")], 2);
    expect([n.get("a"), n.get("b"), n.get("c")]).toEqual([1, 2, 3]);
  });

  it("allows for paid installments the ledger never heard about", () => {
    // PayPal charged installment 1 at signup but sent no sale event for it.
    const n = installmentNumbers([ev("x", FAILED, "10-24")], 1);
    expect(n.get("x")).toBe(2);
  });

  it("gives PayPal's retries of one installment the same number", () => {
    const n = installmentNumbers([ev("f1", FAILED, "10-24"), ev("f2", FAILED, "10-27")], 1);
    expect([n.get("f1"), n.get("f2")]).toEqual([2, 2]);
  });

  it("leaves status events unnumbered", () => {
    expect(installmentNumbers([ev("s", "BILLING.SUBSCRIPTION.ACTIVATED", "10-23")], 0).has("s")).toBe(false);
  });
});

describe("rowStrand", () => {
  const weave = strands(36, 1, { graceEnds: day("2026-12-23") }, today); // installment 2 in grace

  it("shows a payment as paid", () => {
    expect(rowStrand("PAYMENT.SALE.COMPLETED", 1, weave)).toBe("paid");
  });

  it("shows the current failure in its live state", () => {
    expect(rowStrand("BILLING.SUBSCRIPTION.PAYMENT.FAILED", 2, weave)).toBe("grace");
  });

  it("never shows a failure as paid, even one caught up later", () => {
    expect(rowStrand("BILLING.SUBSCRIPTION.PAYMENT.FAILED", 1, weave)).toBe("missed");
  });
});
