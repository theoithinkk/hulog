import { beforeEach, describe, expect, it, vi } from "vitest";
import { explainRights, onlyKnownNumbers, rightsFacts, safeParagraph, templateMessage, type Situation } from "./explain";
import { macedaRights } from "./maceda";
import { complete } from "./ai";

vi.mock("./ai", () => ({ complete: vi.fn() }));

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const under2: Situation = {
  rights: macedaRights({ contractStart: d("2026-01-15"), dueDate: d("2026-11-15"), installmentsPaid: 11, totalPaidCents: 16_500_000 }),
  missed: true,
  dueDate: d("2026-11-15"),
  currency: "PHP",
};
const over2: Situation = {
  rights: macedaRights({ contractStart: d("2020-01-15"), dueDate: d("2026-03-01"), installmentsPaid: 72, totalPaidCents: 108_000_000 }),
  missed: true,
  dueDate: d("2026-03-01"),
  currency: "PHP",
};

describe("rightsFacts", () => {
  it("states the Sec. 4 grace end date and no refund, in English", () => {
    const facts = rightsFacts(under2, "en").join("\n");
    expect(facts).toContain("60 days, until January 14, 2027");
    expect(facts).toContain("none");
    expect(facts).toContain("30 days after you receive a notarial notice");
  });

  it("states the same facts in Filipino", () => {
    const facts = rightsFacts(under2, "fil").join("\n");
    expect(facts).toContain("60 araw, hanggang Enero 14, 2027");
    expect(facts).toContain("wala");
  });

  it("states the Sec. 3 grace months, refund amount and percentage", () => {
    const facts = rightsFacts(over2, "en").join("\n");
    expect(facts).toContain("6 months, interest-free, until September 1, 2026");
    expect(facts).toContain("PHP 594,000.00 (55% of what you've paid through Hulog)");
  });

  it("says when grace is available again if it was already used", () => {
    const used: Situation = {
      ...over2,
      rights: macedaRights({
        contractStart: d("2020-01-15"),
        dueDate: d("2026-03-01"),
        installmentsPaid: 72,
        totalPaidCents: 108_000_000,
        graceUsedAt: [d("2025-06-01")],
      }),
    };
    expect(rightsFacts(used, "en").join("\n")).toContain("available again from January 15, 2030");
  });
});

describe("templateMessage", () => {
  it("doesn't promise time when the grace period is already used", () => {
    const used: Situation = {
      ...over2,
      rights: { ...over2.rights, graceAvailable: false, graceEnds: null, nextGraceFrom: d("2030-01-15") } as Situation["rights"],
    };
    expect(templateMessage(used, "en")).not.toMatch(/you have time/i);
    expect(templateMessage(under2, "en")).toMatch(/you have time/i);
  });
});

describe("onlyKnownNumbers", () => {
  const facts = "Grace period: 60 days, until January 14, 2027\nRefund: PHP 180,000.00 (50%)";

  it("accepts text whose numbers all appear in the facts", () => {
    expect(onlyKnownNumbers("You have 60 days, until January 14, 2027. Refund: PHP 180,000.00.", facts)).toBe(true);
  });

  it("rejects a number the facts don't contain", () => {
    expect(onlyKnownNumbers("You have 90 days to pay.", facts)).toBe(false);
  });

  it("treats 180000.00 and 180,000.00 as the same number", () => {
    expect(onlyKnownNumbers("PHP 180000.00", facts)).toBe(true);
  });
});

describe("safeParagraph", () => {
  const facts = "Grace period: 60 days, until January 14, 2027";

  it("accepts a short plain paragraph", () => {
    expect(safeParagraph("You have 60 days, until January 14, 2027, to catch up.", facts)).toBe(true);
  });

  it.each([
    ["numbers written as words", "You have sixty days to pay."],
    ["Filipino number words", "May dalawang buwan ka pa."],
    ["links", "Read more at https://example.com"],
    ["markdown", "**You have 60 days**"],
    ["anything long", "You have time. ".repeat(60)],
  ])("rejects %s", (_, text) => {
    expect(safeParagraph(text, facts)).toBe(false);
  });
});

describe("explainRights", () => {
  beforeEach(() => { vi.mocked(complete).mockReset(); });

  it("uses the AI paragraph when it only repeats known numbers", async () => {
    vi.mocked(complete).mockResolvedValue("Kalma lang. May 60 araw ka, hanggang Enero 14, 2027.");
    await expect(explainRights(under2, "fil")).resolves.toEqual({
      text: "Kalma lang. May 60 araw ka, hanggang Enero 14, 2027.",
      source: "ai",
    });
    const [, prompt] = vi.mocked(complete).mock.calls[0];
    expect(prompt).toContain("Enero 14, 2027");
  });

  it("falls back to the template when the AI invents a number", async () => {
    vi.mocked(complete).mockResolvedValue("You have 90 days.");
    await expect(explainRights(under2, "en")).resolves.toEqual({
      text: templateMessage(under2, "en"),
      source: "template",
    });
  });

  it("falls back to the template when the AI returns nothing", async () => {
    vi.mocked(complete).mockResolvedValue(null);
    await expect(explainRights(under2, "en")).resolves.toMatchObject({ source: "template" });
  });

  it("falls back to the template when the AI call fails", async () => {
    vi.mocked(complete).mockImplementation(async () => {
      throw new Error("timeout");
    });
    await expect(explainRights(under2, "en")).resolves.toMatchObject({ source: "template", transient: true });
  });
});
