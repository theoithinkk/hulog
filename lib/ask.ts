import Anthropic from "@anthropic-ai/sdk";
import { formatDate, formatMoney, rightsFacts, whyUnsafe, type Lang, type Situation } from "./explain";
import { manilaDate } from "./maceda";
import type { Subscription, Transaction } from "./paypal";

// Ask Hulog: the buyer's questions, answered from their own PayPal data and the Maceda engine.
// Read-only by design: no tool can change a subscription, and every tool is bound to one buyer.

export type Turn = { role: "user" | "assistant"; text: string };
export type Answer = { text: string; source: "ai" | "fallback" | "off" };

export const MAX_QUESTION = 500;
const MAX_REPLY = 1200;
const MAX_TURNS = 5; // odd, so the window still starts on a question

// The conversation comes from the browser, so it's checked like any other input.
export function parseTurns(raw: unknown): Turn[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null;
  const turns: Turn[] = [];
  for (const [i, t] of raw.entries()) {
    if (!t || typeof t !== "object") return null;
    const { role, text } = t as Record<string, unknown>;
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (role !== expected || typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > (role === "user" ? MAX_QUESTION : MAX_REPLY)) return null;
    turns.push({ role: expected, text: trimmed });
  }
  if (turns.at(-1)!.role !== "user") return null;
  return turns.slice(-MAX_TURNS);
}

const cents = (value: string) => Math.round(Number(value) * 100);
const day = (iso: string) => formatDate(manilaDate(new Date(iso)), "en");

// What PayPal knows about the plan, plus the totals code can work out from it.
export function accountFacts(
  sub: Subscription,
  price: { value: string; currency_code: string } | undefined,
  situation: Situation | null,
  prior = 0,
): string[] {
  const cycles = sub.billing_info?.cycle_executions?.find((c) => c.tenure_type === "REGULAR");
  const last = sub.billing_info?.last_payment;
  const owed = sub.billing_info?.outstanding_balance;
  const facts = [`Status on PayPal: ${sub.status}`];
  if (cycles) {
    const paid = prior + cycles.cycles_completed;
    const total = prior + cycles.total_cycles;
    facts.push(`Installments paid: ${paid} of ${total}`, `Installments remaining: ${total - paid}`);
    if (prior) facts.push(`Of those paid, ${prior} were before Hulog, as recorded by the broker, so PayPal doesn't list them.`);
    if (paid < total) facts.push(`Next installment number: ${paid + 1}`);
    if (price) {
      const each = cents(price.value);
      const cur = price.currency_code;
      facts.push(
        `Installment amount: ${cur} ${formatMoney(each)}`,
        `Paid so far: ${cur} ${formatMoney(each * paid)}`,
        `Left to pay: ${cur} ${formatMoney(each * (total - paid))}`,
      );
    }
  }
  if (sub.billing_info?.next_billing_time) facts.push(`Next payment due: ${day(sub.billing_info.next_billing_time)}`);
  if (last) facts.push(`Last payment: ${last.amount.currency_code} ${formatMoney(cents(last.amount.value))} on ${day(last.time)}`);
  if (owed) facts.push(`Outstanding balance on PayPal: ${owed.currency_code} ${formatMoney(cents(owed.value))}`);
  if (situation) facts.push(`Behind on a payment: ${situation.missed ? "yes" : "no"}`);
  return facts;
}

const LIST_LIMIT = 24;

export function transactionFacts(txns: Transaction[]): string[] {
  if (!txns.length) return ["No PayPal charges on this plan yet."];
  const lines = txns.slice(0, LIST_LIMIT).map((t) => {
    const g = t.amount_with_breakdown?.gross_amount;
    return `${day(t.time)}: ${t.status}${g ? `, ${g.currency_code} ${formatMoney(cents(g.value))}` : ""}`;
  });
  // Counted here so the model can say "2 charges on October 30" without counting itself.
  const perDay = new Map<string, number>();
  for (const t of txns) perDay.set(day(t.time), (perDay.get(day(t.time)) ?? 0) + 1);
  const repeats = [...perDay].filter(([, n]) => n > 1).map(([d, n]) => `${d} had ${n} charges.`);
  const done = txns.filter((t) => t.status === "COMPLETED");
  const cur = done[0]?.amount_with_breakdown?.gross_amount?.currency_code;
  const sum = done.reduce((n, t) => n + cents(t.amount_with_breakdown?.gross_amount?.value ?? "0"), 0);
  return [
    ...lines,
    ...(txns.length > LIST_LIMIT ? [`(${LIST_LIMIT} most recent shown)`] : []),
    ...repeats,
    `Completed payments on PayPal: ${done.length}${cur ? `, totalling ${cur} ${formatMoney(sum)}` : ""}`,
  ];
}

// The law's general rules, so "what if I'd paid longer?" has an answer that isn't the model's.
const LAW = [
  "General rule (Sec. 4): under 2 years of installments, a grace period of at least 60 days from the due date; no refund.",
  "General rule (Sec. 3): after at least 2 years, 1 month of interest-free grace per year paid, usable once every 5 years of the contract.",
  "General rule (Sec. 3): after at least 2 years, a cancelled contract refunds 50% of total payments, plus 5% per year after year 5, up to 90%.",
  "Sec. 5: the buyer can sell or assign their rights before cancellation. Sec. 6: the buyer can pay the full balance early without interest.",
  "The law covers residential real estate bought on installment; it excludes industrial lots, commercial buildings and agrarian-reform sales.",
];

export function rightsToolFacts(situation: Situation | null): string[] {
  if (!situation) return ["Rights can't be calculated for this plan right now (it isn't active or PayPal has no billing details).", ...LAW];
  return [
    situation.missed
      ? "The buyer has missed this installment."
      : "The buyer is up to date. These rights would apply if the next installment were missed.",
    ...rightsFacts(situation, "en"),
    ...LAW,
  ];
}

// Each tool reads one thing about this buyer. The page binds them to its subscription.
export type AskContext = {
  account: () => Promise<string[]>;
  payments: () => Promise<string[]>;
  rights: () => Promise<string[]>;
};

const TOOLS: { name: string; key: keyof AskContext; description: string }[] = [
  {
    name: "get_account",
    key: "account",
    description:
      "The buyer's installment plan from PayPal: status, installments paid and remaining, amounts paid and left to pay, next due date, last payment, and whether they're behind.",
  },
  {
    name: "get_payments",
    key: "payments",
    description: "The buyer's charges on PayPal, newest first, with each status and amount, and the total completed.",
  },
  {
    name: "get_rights",
    key: "rights",
    description:
      "The buyer's rights under the Maceda Law (RA 6552), calculated for their plan: grace period and its end date, refund if cancelled, notice rules, and their options. Also the law's general rules.",
  },
];

const tools: Anthropic.Tool[] = TOOLS.map(({ name, description }) => ({
  name,
  description,
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  strict: true,
}));

const system = (lang: Lang) => `You are Ask Hulog, the assistant on a home buyer's payment page. The buyer pays for a home in the Philippines in installments through PayPal, often while working abroad.
- Answer only about this buyer's plan, payments and rights under the Maceda Law. For anything else, say briefly that you can only help with their home payments.
- Look facts up with the tools before answering. Use numbers, dates and amounts exactly as the tools give them, always as digits (write 1, never "one"). Never calculate a new number. If no tool gives it, say you don't have it and suggest asking their broker.- You can't change, pause or cancel the plan. For that, the buyer contacts their broker.
- Reply in ${lang === "fil" ? "Filipino (natural Taglish is fine)" : "English"}, unless the buyer writes in the other language.
- Write 2 to 4 short sentences of plain text: no lists, no markdown, no links.
- This is information, not legal advice. For decisions about the contract, suggest a lawyer or licensed broker.`;

const fallback = (lang: Lang): Answer => ({
  source: "fallback",
  text:
    lang === "fil"
      ? "Hindi ko masagot iyan nang sigurado. Nasa \"Ang mga karapatan mo\" sa itaas ang eksaktong petsa at halaga mo, o tanungin ang broker mo."
      : "I can't answer that one reliably. Your exact dates and amounts are under \"Your rights\" above, or ask your broker.",
});

export const offAnswer = (lang: Lang): Answer => ({
  source: "off",
  text:
    lang === "fil"
      ? "Naka-off ang Ask Hulog sa ngayon. Nasa itaas ang mga karapatan at bayad mo."
      : "Ask Hulog is switched off right now. Your rights and payments are above.",
});

export type ModelCall = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

const defaultCall: ModelCall = (params) =>
  // No retries: a slow answer is worse than the fallback. Built per call so a bad key throws inside the caller.
  new Anthropic({ timeout: 30_000, maxRetries: 0 }).messages.create(params);

// Enough to read the tools, answer, and rewrite once; the tools take at most three of them.
const MAX_ROUNDS = 4;

export async function answerQuestion(turns: Turn[], lang: Lang, ctx: AskContext, call: ModelCall = defaultCall): Promise<Answer> {
  const messages: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.text }));
  // Only what the tools returned in this request counts as known; the buyer's own words don't.
  const seen: string[] = [];
  let corrected = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await call({
      // Haiku has no server-side fallback, so a refusal shows the fixed message below.
      model: "claude-haiku-5-5",
      // Room for brief thinking plus a few sentences. Hitting it shows the fallback.
      max_tokens: 4096,
      output_config: { effort: "low" },
      system: system(lang),
      tools,
      messages,
    });

    if (res.stop_reason === "end_turn") {
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
      const why = text ? whyUnsafe(text, seen.join("\n"), MAX_REPLY) : "empty";
      if (!why) return { text, source: "ai" };
      console.warn(`Ask Hulog answer failed the guardrail (${why})`);
      if (!text || corrected) return fallback(lang);
      // One rewrite: the model usually broke a rule of form ("Ten" for 10), not of fact. The check runs again.
      corrected = true;
      messages.push(
        { role: "assistant", content: res.content },
        {
          role: "user",
          content: `That reply can't be shown to the buyer (${why}). Rewrite it. Write every number as digits, exactly as the tools gave it, and leave out any number the tools didn't give, including one the buyer stated. If a word is quoted above, don't use it at all, even where it isn't a count. Plain text only.`,
        },
      );
      continue;
    }
    if (res.stop_reason !== "tool_use") return fallback(lang);

    // Pass the whole turn back unchanged: thinking blocks must round-trip.
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      res.content.flatMap((b) => (b.type === "tool_use" ? [b] : [])).map(async (b) => {
        const tool = TOOLS.find((t) => t.name === b.name);
        if (!tool) return { type: "tool_result" as const, tool_use_id: b.id, content: "Unknown tool.", is_error: true };
        try {
          const facts = (await ctx[tool.key]()).join("\n");
          seen.push(facts);
          return { type: "tool_result" as const, tool_use_id: b.id, content: facts };
        } catch (e) {
          console.error(`Ask Hulog tool ${b.name} failed:`, e instanceof Error ? e.message : e);
          return { type: "tool_result" as const, tool_use_id: b.id, content: "Unavailable right now.", is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return fallback(lang);
}
