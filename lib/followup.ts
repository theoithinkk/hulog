import { complete } from "./ai";
import { formatDate, formatMoney, whyUnsafe, type Lang, type Situation } from "./explain";
import { manilaDate } from "./maceda";

// A message the broker reviews and sends to a buyer who's behind. Hulog never sends anything itself.

const MAX_MESSAGE = 700;

// Days of grace left, today included as 0. Negative once it has passed; null when there's no grace period.
export function daysLeft(graceEnds: Date | null, today = new Date()) {
  return graceEnds ? Math.round((graceEnds.getTime() - manilaDate(today).getTime()) / 86_400_000) : null;
}

export type FollowUpInput = {
  firstName?: string;
  unit: string;
  price: { value: string; currency_code: string };
  situation: Situation;
};

export type Draft = { text: string; source: "ai" | "template" };

const amountOf = ({ value, currency_code }: FollowUpInput["price"]) =>
  `${currency_code} ${formatMoney(Math.round(Number(value) * 100))}`;

// Only the numbers this message needs. The check accepts any number in here, so a wider list ("Sec. 5",
// "30 days") would let a made-up "pay within 5 days" through.
export function followUpFacts(input: FollowUpInput, lang: Lang, today = new Date()): string[] {
  const { rights, dueDate } = input.situation;
  const left = daysLeft(rights.graceEnds, today);
  return [
    ...(input.firstName ? [`Buyer's first name: ${input.firstName}`] : []),
    `Unit: ${input.unit}`,
    `Missed installment amount: ${amountOf(input.price)}`,
    `Missed installment due: ${formatDate(dueDate, lang)}`,
    !rights.graceEnds || left === null
      ? "The grace period for this installment has already been used."
      : left < 0
        ? `The grace period ended on ${formatDate(rights.graceEnds, lang)}.`
        : `Grace period ends: ${formatDate(rights.graceEnds, lang)}`,
  ];
}

// Used when the AI is off or its draft fails the check. Every number comes straight from the engine.
export function templateFollowUp(input: FollowUpInput, lang: Lang, today = new Date()): string {
  const { situation: s, unit, firstName } = input;
  const amount = amountOf(input.price);
  const due = formatDate(s.dueDate, lang);
  const ends = s.rights.graceEnds;
  const left = daysLeft(ends, today);
  const inGrace = ends && left !== null && left >= 0;
  if (lang === "fil") {
    const hi = firstName ? `Kumusta, ${firstName}. ` : "Kumusta. ";
    return (
      `${hi}Tungkol ito sa ${unit}. Hindi pumasok ang hulog mo na ${amount} na dapat bayaran noong ${due}. ` +
      (inGrace
        ? `Sa ilalim ng Maceda Law, may grace period ka hanggang ${formatDate(ends, lang)}, kaya may panahon ka pa para humabol. Sabihan mo lang ako kung kailangan mo ng tulong.`
        : "Makipag-ugnayan ka sa akin sa lalong madaling panahon para mapag-usapan natin ang mga opsyon mo.")
    );
  }
  const hi = firstName ? `Hi ${firstName}. ` : "Hi. ";
  return (
    `${hi}This is about ${unit}. Your installment of ${amount} due ${due} didn't go through. ` +
    (inGrace
      ? `Under the Maceda Law your grace period runs until ${formatDate(ends, lang)}, so you still have time to catch up. Let me know if I can help.`
      : "Please contact me as soon as you can so we can go through your options.")
  );
}

const system = (lang: Lang) => `You draft a short follow-up message from a licensed real estate broker in the Philippines to a home buyer who missed an installment. The broker reviews it and sends it. Many buyers work abroad.
- Use only the facts provided. Never add, change, or calculate a number, date, amount, or percentage.
- Write every number as digits, exactly as it appears in the facts (write 1, never "one").
- Be warm and respectful, never threatening. Don't mention cancellation or refunds.
- Say which unit, the missed amount and due date, and when the grace period ends. If it has ended, ask them to get in touch soon, without promising anything.
- End by offering to help. Don't sign with a name, and use no placeholders.
- Write 3 to 5 short sentences of plain text: no lists, no markdown, no links.
- Write in ${lang === "fil" ? "Filipino (natural Taglish is fine)" : "English"}.
- This isn't legal advice, so don't tell the buyer what they must do.`;

type Model = (system: string, prompt: string) => Promise<string | null>;

// Same rule as Ask Hulog: the check runs on every draft, one rewrite, then the fixed message.
export async function draftFollowUp(input: FollowUpInput, lang: Lang, model: Model = complete): Promise<Draft> {
  const facts = followUpFacts(input, lang);
  const known = facts.join("\n");
  const prompt = `Facts:\n${facts.map((f) => `- ${f}`).join("\n")}`;
  let correction = "";
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await model(system(lang), prompt + correction);
      if (!text) break;
      const why = whyUnsafe(text, known, MAX_MESSAGE);
      if (!why) return { text, source: "ai" };
      console.warn(`Follow-up draft failed the guardrail (${why})`);
      correction = `\n\nYour last draft was rejected (${why}). Write it again, using digits exactly as in the facts. If a word is quoted above, don't use it at all.`;
    }
  } catch (e) {
    console.error("Follow-up draft failed; using the template:", e instanceof Error ? e.message : e);
  }
  return { text: templateFollowUp(input, lang), source: "template" };
}
