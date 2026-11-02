import { describe, expect, it } from "vitest";
import { contractProgress, isPlanId, isSubscriptionId, parseUnit, priorInstallments, totalPriceLabel } from "./unit";

const valid = {
  name: "Unit 12B",
  project: "Azure Residences",
  tcp: "1800000",
  monthlyAmount: "15000",
  months: "36",
  currency: "PHP",
};

describe("parseUnit", () => {
  it("accepts a valid unit and converts numbers", () => {
    expect(parseUnit(valid)).toEqual({
      ok: true,
      unit: {
        name: "Unit 12B",
        project: "Azure Residences",
        tcp: 1800000,
        monthlyAmount: 15000,
        months: 36,
        currency: "PHP",
      },
    });
  });

  it("trims text fields", () => {
    const r = parseUnit({ ...valid, name: "  Unit 12B  " });
    expect(r.ok && r.unit.name).toBe("Unit 12B");
  });

  it.each([
    ["empty name", { name: "" }],
    ["long name", { name: "x".repeat(61) }],
    ["missing project", { project: undefined }],
    ["zero tcp", { tcp: "0" }],
    ["non-numeric amount", { monthlyAmount: "abc" }],
    ["negative amount", { monthlyAmount: "-5" }],
    ["amount above tcp", { monthlyAmount: "2000000" }],
    ["fractional months", { months: "12.5" }],
    ["too many months", { months: "361" }],
    ["unsupported currency", { currency: "EUR" }],
    ["more than 2 decimals", { monthlyAmount: "15000.123" }],
    ["absurdly large tcp", { tcp: "1".padEnd(26, "0") }],
  ])("rejects %s", (_label, patch) => {
    expect(parseUnit({ ...valid, ...patch }).ok).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(parseUnit(null).ok).toBe(false);
  });
});

describe("installments already paid", () => {
  it("are recorded on the unit when there are any", () => {
    expect(parseUnit({ ...valid, prior: " 12 " })).toMatchObject({ ok: true, unit: { months: 36, prior: 12 } });
    for (const prior of ["0", "", undefined]) {
      const r = parseUnit({ ...valid, prior });
      expect(r.ok && r.unit.prior).toBeUndefined();
    }
  });

  it.each(["36", "37", "-1", "1.5", "many"])("rejects %s of 36", (prior) => {
    expect(parseUnit({ ...valid, prior })).toMatchObject({ ok: false, error: expect.stringMatching(/Already paid/) });
  });

  it("are read back from the plan description", () => {
    expect(priorInstallments("Azure - TCP PHP 1,800,000.00 - prior 36")).toBe(36);
    expect(priorInstallments("Azure - TCP PHP 1,800,000.00")).toBe(0);
    expect(priorInstallments(undefined)).toBe(0);
  });

  it("add to PayPal's count for the whole contract", () => {
    const sub = {
      id: "I-1",
      status: "ACTIVE",
      plan_id: "P-1",
      billing_info: { cycle_executions: [{ tenure_type: "REGULAR" as const, cycles_completed: 2, total_cycles: 24 }] },
    };
    expect(contractProgress(sub, "A - prior 36")).toEqual({ prior: 36, paid: 38, total: 60 });
    expect(contractProgress(sub)).toEqual({ prior: 0, paid: 2, total: 24 });
    expect(contractProgress({ ...sub, billing_info: undefined }, "A - prior 36").total).toBe(0);
  });
});

describe("PayPal ID checks", () => {
  it("accepts real-looking IDs", () => {
    expect(isPlanId("P-5ML4271244454362WXNWU5NQ")).toBe(true);
    expect(isSubscriptionId("I-BW452GLLEP1G")).toBe(true);
  });

  it.each(["", "P-", "P-../../v1/oauth2", "p-abc", "I-ABC", "P-ABC?x=1"])(
    "rejects plan id %j",
    (id) => expect(isPlanId(id)).toBe(false),
  );

  it("rejects a plan id as a subscription id", () => {
    expect(isSubscriptionId("P-5ML4271244454362WXNWU5NQ")).toBe(false);
  });
});

describe("totalPriceLabel", () => {
  it("turns the plan description into plain words", () => {
    expect(totalPriceLabel("Azure Residences - TCP PHP 1,800,000.00")).toBe("Total price PHP 1,800,000.00");
  });

  it("is null when the description carries no price", () => {
    expect(totalPriceLabel("Something else")).toBeNull();
    expect(totalPriceLabel(undefined)).toBeNull();
  });
});
