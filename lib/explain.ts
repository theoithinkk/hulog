import { complete } from "./ai";
import type { Rights } from "./maceda";

export type Lang = "en" | "fil";

export type Situation = {
  rights: Rights;
  missed: boolean; // true: this installment was missed; false: what would apply if it were
  dueDate: Date;
  currency: string;
};

// Engine dates are calendar days at midnight UTC, so format them in UTC.
const date = (d: Date, lang: Lang) =>
  d.toLocaleDateString(lang === "fil" ? "fil-PH" : "en-PH", { dateStyle: "long", timeZone: "UTC" });

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Pages format engine dates and amounts the same way the facts do.
export { date as formatDate, money as formatMoney };

// The authoritative facts, rendered by the page as-is. The AI paragraph may only restate these.
export function rightsFacts({ rights: r, missed, dueDate, currency }: Situation, lang: Lang): string[] {
  const at = (d: Date) => date(d, lang);
  const refund = `${currency} ${money(r.refundCents)} (${r.refundPercent}%`;

  if (lang === "fil") {
    return [
      "Batas: Republic Act 6552 (Maceda Law)",
      missed ? `Hulog na hindi nabayaran: ${at(dueDate)}` : `Susunod na hulog: ${at(dueDate)}`,
      ...(r.section === "4"
        ? [
            `Grace period: 60 araw, hanggang ${at(r.graceEnds)}`,
            "Refund kapag kinansela ang kontrata: wala (wala pang 2 taon ng hulog ang naibayad)",
            "Kung hindi pa rin bayad pagkatapos ng grace period, puwede lang kanselahin ng seller ang kontrata 30 araw matapos mong matanggap ang notarial notice.",
          ]
        : [
            `Mga taon ng hulog na naibayad: ${r.yearsPaid}`,
            r.graceAvailable
              ? `Grace period: ${r.graceMonths} buwan, walang interes, hanggang ${at(r.graceEnds!)}`
              : `Grace period: nagamit na sa loob ng 5 taong ito ng kontrata; puwede ulit simula ${at(r.nextGraceFrom!)}`,
            `Refund kapag kinansela ang kontrata (cash surrender value): ${refund} ng naibayad mo sa Hulog)`,
            "Puwede lang kanselahin ng seller ang kontrata 30 araw matapos mong matanggap ang notarial notice at matapos kang bayaran ng refund na ito.",
          ]),
      "Puwede mong ibenta o ipasa sa iba ang karapatan mo bago makansela ang kontrata (Sec. 5).",
      "Puwede mong bayaran nang buo ang natitirang balanse nang mas maaga, nang walang interes (Sec. 6).",
    ];
  }

  return [
    "Law: Republic Act 6552 (Maceda Law)",
    missed ? `Missed installment due: ${at(dueDate)}` : `Next installment due: ${at(dueDate)}`,
    ...(r.section === "4"
      ? [
          `Grace period: 60 days, until ${at(r.graceEnds)}`,
          "Refund if the contract is cancelled: none (less than 2 years of installments paid)",
          "If still unpaid after the grace period, the seller can cancel the contract only 30 days after you receive a notarial notice.",
        ]
      : [
          `Years of installments paid: ${r.yearsPaid}`,
          r.graceAvailable
            ? `Grace period: ${r.graceMonths} months, interest-free, until ${at(r.graceEnds!)}`
            : `Grace period: already used in this 5-year period of the contract; available again from ${at(r.nextGraceFrom!)}`,
          `Refund if the contract is cancelled (cash surrender value): ${refund} of what you've paid through Hulog)`,
          "The seller can cancel the contract only 30 days after you receive a notarial notice and after paying you this refund.",
        ]),
    "You can sell or assign your rights to someone else before the contract is cancelled (Sec. 5).",
    "You can pay the full remaining balance early, without interest (Sec. 6).",
  ];
}

const graceLeft = (r: Rights) => r.section === "4" || r.graceAvailable;

// Shown when there's no AI text. Deliberately number-free: the facts list carries the numbers.
export function templateMessage({ rights, missed }: Situation, lang: Lang): string {
  const fil = lang === "fil";
  if (!missed) {
    return fil
      ? "Maayos ang mga bayad mo. Kung sakaling hindi ka makabayad, may grace period at iba pang proteksyon ka sa ilalim ng Maceda Law. Ito ang mag-a-apply sa susunod mong hulog."
      : "You're up to date. If you ever miss a payment, the Maceda Law gives you a grace period and other protections. Here's what would apply to your next installment.";
  }
  if (graceLeft(rights)) {
    return fil
      ? "Hindi pumasok ang bayad mo, pero may panahon ka pa. Pinoprotektahan ka ng Maceda Law: humabol bago matapos ang grace period at mananatiling maayos ang kontrata mo. Nasa ibaba ang eksaktong petsa at mga opsyon mo."
      : "Your payment didn't go through, but you have time. The Maceda Law protects you: catch up before your grace period ends and your contract stays in good standing. Your exact dates and options are below.";
  }
  return fil
    ? "Hindi pumasok ang bayad mo, at nagamit mo na ang grace period mo para sa yugtong ito ng kontrata, kaya makipag-ugnayan agad sa broker mo. May karapatan ka pa rin sa refund; nasa ibaba ang detalye."
    : "Your payment didn't go through, and you've already used your grace period for this stretch of the contract, so contact your broker soon. Your refund rights still apply; details are below.";
}

const numbers = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));

// Guardrail: every number in the AI's text must appear in the facts it was given.
export function onlyKnownNumbers(text: string, facts: string) {
  const known = new Set(numbers(facts));
  return numbers(text).every((n) => known.has(n));
}

// Spelled-out numbers would slip past the digit check. "isa/isang" is left out: it's everyday Filipino for "a".
const NUMBER_WORDS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|half|dalawa|dalawang|tatlo|tatlong|apat|lima|limang|anim|pito|pitong|walo|walong|siyam|sampu|sampung|daan|libo|milyon|kalahati)\b/i;

// The whole check an AI paragraph must pass. It fails closed: a false reject only means the template is shown.
// ponytail: a number can still be paired with the wrong unit ("30 days grace"); the facts list beside it is the backstop.
export function safeParagraph(text: string, facts: string) {
  return (
    text.length <= 600 &&
    !/https?:|www\.|[*#[\]_`]/.test(text) &&
    !NUMBER_WORDS.test(text) &&
    onlyKnownNumbers(text, facts)
  );
}

const system = (lang: Lang) => `You explain a home buyer's rights under the Philippine Maceda Law (RA 6552) in a short, warm message.
- Use only the facts provided. Never add, change, or calculate a number, date, amount, or percentage.
- Write every number as digits, exactly as it appears in the facts.
- Write 2 to 3 sentences of plain text: no greeting, no lists, no markdown.
- Write in ${lang === "fil" ? "Filipino (natural Taglish is fine)" : "English"}.
- This is information, not legal advice. Don't tell the buyer what they must do.`;

export type Explanation = { text: string; source: "ai" | "template"; transient?: true };

// `transient` marks a fallback caused by an error worth retrying, so callers don't cache it.
export async function explainRights(s: Situation, lang: Lang): Promise<Explanation> {
  const facts = rightsFacts(s, lang);
  const situation = s.missed
    ? "The buyer just missed this installment."
    : "The buyer is up to date. Explain what would apply if they missed the next installment.";
  const fallback: Explanation = { text: templateMessage(s, lang), source: "template" };
  try {
    const text = await complete(system(lang), `${situation}\nFacts:\n${facts.map((f) => `- ${f}`).join("\n")}`);
    if (!text) return fallback;
    if (!safeParagraph(text, facts.join("\n"))) {
      console.warn("AI rights text failed the guardrail; using the template");
      return fallback;
    }
    return { text, source: "ai" };
  } catch (e) {
    console.error("AI rights text failed; using the template:", e instanceof Error ? e.message : e);
    return { ...fallback, transient: true };
  }
}
