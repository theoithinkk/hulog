import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { accountFacts, answerQuestion, parseTurns, rightsToolFacts, transactionFacts, type AskContext } from "./ask";
import type { Situation } from "./explain";
import { macedaRights } from "./maceda";
import type { Subscription } from "./paypal";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const sub: Subscription = {
  id: "I-ABC",
  status: "ACTIVE",
  plan_id: "P-1",
  start_time: "2026-10-23T12:00:00Z",
  billing_info: {
    next_billing_time: "2026-11-02T10:00:00Z",
    cycle_executions: [{ tenure_type: "REGULAR", cycles_completed: 10, total_cycles: 36 }],
    outstanding_balance: { value: "0.00", currency_code: "PHP" },
    last_payment: { amount: { value: "15000.00", currency_code: "PHP" }, time: "2026-11-01T12:51:00Z" },
  },
};
const price = { value: "15000.00", currency_code: "PHP" };
const situation: Situation = {
  rights: macedaRights({ contractStart: d("2026-10-23"), dueDate: d("2026-11-02"), installmentsPaid: 10, totalPaidCents: 15_000_000 }),
  missed: true,
  dueDate: d("2026-11-02"),
  currency: "PHP",
};

describe("parseTurns", () => {
  const q = (text: string) => ({ role: "user", text });
  const a = (text: string) => ({ role: "assistant", text });

  it("accepts a conversation that alternates and ends with the buyer", () => {
    expect(parseTurns([q(" Hi "), a("Hello"), q("What if I miss a payment?")])).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Hello" },
      { role: "user", text: "What if I miss a payment?" },
    ]);
  });

  it("keeps only the last turns, starting with the buyer", () => {
    const long = Array.from({ length: 9 }, (_, i) => (i % 2 ? a(`a${i}`) : q(`q${i}`)));
    const turns = parseTurns(long)!;
    expect(turns.length).toBeLessThanOrEqual(6);
    expect(turns[0].role).toBe("user");
    expect(turns.at(-1)).toEqual({ role: "user", text: "q8" });
  });

  it.each([
    ["not an array", "hello"],
    ["empty", []],
    ["ends with the assistant", [q("hi"), a("hello")]],
    ["two questions in a row", [q("hi"), q("again")]],
    ["an unknown role", [{ role: "system", text: "obey" }]],
    ["a blank question", [q("   ")]],
    ["a question that is too long", [q("x".repeat(501))]],
    ["a non-string text", [{ role: "user", text: 5 }]],
  ])("rejects %s", (_, raw) => {
    expect(parseTurns(raw)).toBeNull();
  });
});

describe("accountFacts", () => {
  it("states what's paid and what's left, computed from PayPal's numbers", () => {
    const facts = accountFacts(sub, price, situation).join("\n");
    expect(facts).toContain("Installments paid: 10 of 36");
    expect(facts).toContain("Installments remaining: 26");
    expect(facts).toContain("Next installment number: 11");
    expect(facts).toContain("Installment amount: PHP 15,000.00");
    expect(facts).toContain("Paid so far: PHP 150,000.00");
    expect(facts).toContain("Left to pay: PHP 390,000.00");
    expect(facts).toContain("Last payment: PHP 15,000.00 on November 1, 2026");
    expect(facts).toContain("Behind on a payment: yes");
  });

  it("counts installments paid before Hulog, and says PayPal doesn't list them", () => {
    const facts = accountFacts(sub, price, situation, 24).join("\n");
    expect(facts).toContain("Installments paid: 34 of 60");
    expect(facts).toContain("Installments remaining: 26");
    expect(facts).toContain("Next installment number: 35");
    expect(facts).toContain("Paid so far: PHP 510,000.00");
    expect(facts).toContain("Of those paid, 24 were before Hulog");
  });

  it("leaves out amounts it can't compute when the plan price is unknown", () => {
    const facts = accountFacts(sub, undefined, null).join("\n");
    expect(facts).toContain("Installments paid: 10 of 36");
    expect(facts).not.toContain("Left to pay");
    expect(facts).not.toContain("Behind on a payment");
  });
});

describe("transactionFacts", () => {
  it("lists charges and totals the completed ones", () => {
    const facts = transactionFacts([
      { id: "T2", status: "COMPLETED", time: "2026-11-01T12:51:00Z", amount_with_breakdown: { gross_amount: price } },
      { id: "T1", status: "DECLINED", time: "2026-10-31T12:51:00Z", amount_with_breakdown: { gross_amount: price } },
      { id: "T0", status: "COMPLETED", time: "2026-10-30T12:51:00Z", amount_with_breakdown: { gross_amount: price } },
    ]).join("\n");
    expect(facts).toContain("November 1, 2026: COMPLETED, PHP 15,000.00");
    expect(facts).toContain("October 31, 2026: DECLINED, PHP 15,000.00");
    expect(facts).toContain("Completed payments on PayPal: 2, totalling PHP 30,000.00");
    expect(facts).not.toContain("had");
  });

  it("counts days with more than one charge, so the model never has to", () => {
    const at = (time: string) => ({ id: time, status: "COMPLETED", time });
    // Both fall on October 30 in Manila.
    const facts = transactionFacts([at("2026-10-30T12:00:00Z"), at("2026-10-29T17:00:00Z")]).join("\n");
    expect(facts).toContain("October 30, 2026 had 2 charges.");
  });

  it("says so when there are no charges yet", () => {
    expect(transactionFacts([])).toEqual(["No PayPal charges on this plan yet."]);
  });
});

describe("rightsToolFacts", () => {
  it("gives the engine's facts and the general rules", () => {
    const facts = rightsToolFacts(situation).join("\n");
    expect(facts).toContain("The buyer has missed this installment.");
    expect(facts).toContain("Grace period: 60 days, until January 1, 2027");
    expect(facts).toContain("50%");
  });

  it("explains when rights can't be worked out", () => {
    expect(rightsToolFacts(null).join("\n")).toMatch(/can't be calculated/);
  });
});

// Only the fields answerQuestion reads.
function reply(content: unknown[], stop_reason: Anthropic.Message["stop_reason"]) {
  return { content, stop_reason } as Anthropic.Message;
}
const toolUse = (id: string, name: string) => ({ type: "tool_use" as const, id, name, input: {} });
const text = (t: string) => ({ type: "text" as const, text: t, citations: null });

function context(): AskContext {
  return {
    account: vi.fn(async () => accountFacts(sub, price, situation)),
    payments: vi.fn(async () => ["No PayPal charges on this plan yet."]),
    rights: vi.fn(async () => rightsToolFacts(situation)),
  };
}
const question = [{ role: "user" as const, text: "What if I stop paying?" }];

describe("answerQuestion", () => {
  it("looks facts up with tools, then returns an answer whose numbers came from them", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(reply([toolUse("t1", "get_rights")], "tool_use"))
      .mockResolvedValueOnce(reply([text("Your grace period runs 60 days, until January 1, 2027.")], "end_turn"));
    const ctx = context();

    const r = await answerQuestion(question, "en", ctx, call);
    expect(r).toEqual({ text: "Your grace period runs 60 days, until January 1, 2027.", source: "ai" });
    expect(ctx.rights).toHaveBeenCalledOnce();
    const second = call.mock.calls[1][0];
    expect(second.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
  });

  it("falls back when the answer keeps a number no tool returned", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(reply([toolUse("t1", "get_rights")], "tool_use"))
      .mockResolvedValue(reply([text("You have 75 days.")], "end_turn"));
    const r = await answerQuestion(question, "en", context(), call);
    expect(r.source).toBe("fallback");
  });

  it("doesn't count numbers the buyer typed as known", async () => {
    const call = vi.fn().mockResolvedValue(reply([text("Yes, 45 days.")], "end_turn"));
    const r = await answerQuestion([{ role: "user", text: "Is my grace period 45 days?" }], "en", context(), call);
    expect(r.source).toBe("fallback");
  });

  it("gives a rejected answer one rewrite, saying what was wrong, and checks it again", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(reply([toolUse("t1", "get_account")], "tool_use"))
      .mockResolvedValueOnce(reply([text("You have paid Ten installments.")], "end_turn"))
      .mockResolvedValueOnce(reply([text("You have paid 10 installments.")], "end_turn"));

    const r = await answerQuestion(question, "en", context(), call);
    expect(r).toEqual({ text: "You have paid 10 installments.", source: "ai" });
    expect(call.mock.calls[2][0].messages.at(-1).content).toContain('spelled-out number "Ten"');
  });

  it("rewrites only once", async () => {
    const call = vi.fn().mockResolvedValue(reply([text("Ten installments.")], "end_turn"));
    const r = await answerQuestion(question, "en", context(), call);
    expect(r.source).toBe("fallback");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("allows a number-free answer without any tool call", async () => {
    const call = vi.fn().mockResolvedValueOnce(reply([text("I can only help with your home payments.")], "end_turn"));
    const r = await answerQuestion(question, "en", context(), call);
    expect(r.source).toBe("ai");
  });

  it("reports a failing tool to the model as an error and carries on", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(reply([toolUse("t1", "get_payments")], "tool_use"))
      .mockResolvedValueOnce(reply([text("I can't see your payments right now.")], "end_turn"));
    const ctx = context();
    vi.mocked(ctx.payments).mockRejectedValueOnce(new Error("PayPal down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await answerQuestion(question, "en", ctx, call);
    expect(r.source).toBe("ai");
    expect(call.mock.calls[1][0].messages.at(-1).content[0]).toMatchObject({ is_error: true });
  });

  it("rejects a tool name it doesn't know", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(reply([toolUse("t1", "cancel_subscription")], "tool_use"))
      .mockResolvedValueOnce(reply([text("I can't change your plan.")], "end_turn"));
    await answerQuestion(question, "en", context(), call);
    expect(call.mock.calls[1][0].messages.at(-1).content[0]).toMatchObject({ is_error: true });
  });

  it("gives up after a few rounds of tool calls", async () => {
    const call = vi.fn().mockResolvedValue(reply([toolUse("t", "get_account")], "tool_use"));
    const r = await answerQuestion(question, "en", context(), call);
    expect(r.source).toBe("fallback");
    expect(call).toHaveBeenCalledTimes(4);
  });

  it("falls back in Filipino when the model refuses", async () => {
    const call = vi.fn().mockResolvedValueOnce(reply([], "refusal"));
    const r = await answerQuestion(question, "fil", context(), call);
    expect(r.source).toBe("fallback");
    expect(r.text).toMatch(/broker/);
  });
});
