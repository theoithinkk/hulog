import { afterEach, describe, expect, it, vi } from "vitest";
import type { Situation } from "./explain";
import { daysLeft, draftFollowUp, followUpFacts, templateFollowUp, type FollowUpInput } from "./followup";
import { macedaRights } from "./maceda";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const situation: Situation = {
  rights: macedaRights({ contractStart: d("2025-11-02"), dueDate: d("2026-11-02"), installmentsPaid: 15, totalPaidCents: 18_000_000 }),
  missed: true,
  dueDate: d("2026-11-02"),
  currency: "PHP",
};
const input: FollowUpInput = {
  firstName: "Krys",
  unit: "Lot 14, Lipa Hillside Homes",
  price: { value: "12000.00", currency_code: "PHP" },
  situation,
};
// Noon in Manila on the day it's named for.
const on = (s: string) => new Date(`${s}T04:00:00Z`);

afterEach(() => vi.restoreAllMocks());

describe("daysLeft", () => {
  it("counts Manila calendar days to the end of grace", () => {
    expect(daysLeft(d("2027-01-01"), on("2026-11-02"))).toBe(60);
    expect(daysLeft(d("2027-01-01"), on("2027-01-01"))).toBe(0);
    expect(daysLeft(d("2027-01-01"), on("2027-01-03"))).toBe(-2);
  });

  it("uses the Manila date, not UTC, late in the evening UTC", () => {
    expect(daysLeft(d("2027-01-01"), new Date("2026-12-31T17:00:00Z"))).toBe(0);
  });

  it("is null without a grace period", () => {
    expect(daysLeft(null)).toBeNull();
  });
});

describe("templateFollowUp", () => {
  it("names the unit, amount, due date and grace end while time remains", () => {
    const text = templateFollowUp(input, "en", on("2026-11-02"));
    expect(text).toContain("Hi Krys.");
    expect(text).toContain("Lot 14, Lipa Hillside Homes");
    expect(text).toContain("PHP 12,000.00");
    expect(text).toContain("November 2, 2026");
    expect(text).toContain("January 1, 2027");
  });

  it("stops promising time once the grace period has passed", () => {
    const text = templateFollowUp(input, "en", on("2027-02-01"));
    expect(text).not.toContain("still have time");
    expect(text).toContain("contact me");
  });

  it("writes Filipino too, with the same numbers", () => {
    const text = templateFollowUp(input, "fil", on("2026-11-02"));
    expect(text).toContain("Kumusta, Krys.");
    expect(text).toContain("PHP 12,000.00");
    expect(text).toContain("Enero 1, 2027");
  });
});

describe("draftFollowUp", () => {
  it("returns an AI draft whose numbers all come from the facts", async () => {
    const good = "Hi Krys, your PHP 12,000.00 installment for Lot 14 due November 2, 2026 didn't go through. Your grace period runs until January 1, 2027.";
    await expect(draftFollowUp(input, "en", async () => good)).resolves.toEqual({ text: good, source: "ai" });
  });

  it("gives a rejected draft one rewrite, saying what was wrong", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const model = vi
      .fn()
      .mockResolvedValueOnce("You have one more chance.")
      .mockResolvedValueOnce("Your grace period runs until January 1, 2027.");
    const r = await draftFollowUp(input, "en", model);
    expect(r.source).toBe("ai");
    expect(model.mock.calls[1][1]).toContain('spelled-out number "one"');
  });

  it("falls back to the fixed message when both drafts invent a number", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const model = vi.fn().mockResolvedValue("You must pay within 5 days.");
    const r = await draftFollowUp(input, "en", model);
    expect(r.source).toBe("template");
    expect(r.text).toContain("Hi Krys.");
    expect(model).toHaveBeenCalledTimes(2);
  });

  it("falls back when the AI is off or errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await draftFollowUp(input, "en", async () => null)).source).toBe("template");
    expect((await draftFollowUp(input, "fil", async () => Promise.reject(new Error("down")))).source).toBe("template");
  });

  it("gives the model the engine's dates and only the numbers the message needs", () => {
    const facts = followUpFacts(input, "en", on("2026-11-02")).join("\n");
    expect(facts).toContain("Missed installment amount: PHP 12,000.00");
    expect(facts).toContain("Missed installment due: November 2, 2026");
    expect(facts).toContain("Grace period ends: January 1, 2027");
    expect(facts).not.toContain("Sec.");
    expect(facts).not.toContain("30");
  });

  it("tells the model when the grace period has passed", () => {
    const facts = followUpFacts(input, "en", on("2027-02-01")).join("\n");
    expect(facts).toContain("The grace period ended on January 1, 2027.");
    expect(facts).not.toContain("Grace period ends");
  });
});
