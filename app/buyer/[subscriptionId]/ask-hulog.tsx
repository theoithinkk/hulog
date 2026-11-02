"use client";

import { useEffect, useRef, useState, useTransition } from "react";
// Type-only: a value import would ship the Anthropic SDK to the browser.
import type { Turn } from "@/lib/ask";
import type { Lang } from "@/lib/explain";
import { askHulog } from "./actions";

const SUGGESTED: Record<Lang, string[]> = {
  en: ["What happens if I stop paying?", "How much have I paid so far?", "Can I get a refund if the contract is cancelled?"],
  fil: ["Paano kung hindi na ako makabayad?", "Magkano na ang naibayad ko?", "May refund ba kung makansela ang kontrata?"],
};

export function AskHulog({ subscriptionId, lang }: { subscriptionId: string; lang: Lang }) {
  const fil = lang === "fil";
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLOListElement>(null);

  // On a phone the newest message can land off-screen, above the keyboard or the fold.
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [turns.length, pending]);

  function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    const next: Turn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setDraft("");
    setError(false);
    startTransition(async () => {
      try {
        const answer = await askHulog(subscriptionId, lang, next);
        setTurns([...next, { role: "assistant", text: answer.text }]);
      } catch {
        // Take the question back so the conversation still alternates, and let them resend it.
        setTurns(turns);
        setDraft(text);
        setError(true);
        input.current?.focus();
      }
    });
  }

  return (
    <section aria-labelledby="ask" className="flex flex-col gap-3 lg:col-span-2">
      <h2 id="ask" className="text-xl font-bold">
        Ask Hulog
      </h2>
      <div className="flex max-w-3xl flex-col gap-4 panel p-5">
        <p className="text-ink-soft">
          {fil
            ? "Magtanong tungkol sa mga bayad at karapatan mo. Sumasagot ang AI mula sa mga record mo sa PayPal at sa Maceda Law engine."
            : "Ask about your payments and rights. The AI answers from your PayPal records and the Maceda Law engine."}
        </p>

        {turns.length > 0 && (
          <ol ref={list} aria-live="polite" className="flex flex-col gap-3">
            {turns.map((t, i) => (
              <li
                key={i}
                className={
                  t.role === "user"
                    ? "max-w-[85%] self-end rounded-2xl rounded-br-sm bg-aubergine px-4 py-2.5 text-shell-ink"
                    : "max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-line bg-ground px-4 py-2.5"
                }
              >
                <span className="sr-only">{t.role === "user" ? (fil ? "Ikaw: " : "You: ") : "Hulog: "}</span>
                {t.text}
              </li>
            ))}
            {pending && (
              <li className="self-start px-1 text-ink-soft" role="status">
                {fil ? "Tinitingnan ni Hulog ang mga record mo…" : "Hulog is checking your records…"}
              </li>
            )}
          </ol>
        )}

        {turns.length === 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={fil ? "Mga mungkahing tanong" : "Suggested questions"}>
            {SUGGESTED[lang].map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => ask(q)}
                  disabled={pending}
                  className="min-h-11 rounded-full border border-aubergine/30 px-3.5 py-1.5 text-left text-[0.9375rem] text-aubergine transition-colors hover:bg-aubergine/5 disabled:opacity-60"
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="text-magenta-deep">
            {fil ? "Hindi maabot si Hulog ngayon. Subukan ulit." : "Couldn't reach Hulog just now. Please try again."}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <label htmlFor="ask-input" className="sr-only">
            {fil ? "Ang tanong mo" : "Your question"}
          </label>
          <textarea
            id="ask-input"
            ref={input}
            rows={2}
            enterKeyHint="send"
            maxLength={500 /* MAX_QUESTION in lib/ask.ts, which the server enforces */}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(draft);
              }
            }}
            placeholder={fil ? "Hal. Kailan ang huling araw ng grace period ko?" : "e.g. When does my grace period end?"}
            className="min-h-11 flex-1 resize-y rounded-lg border-2 border-line bg-panel px-3 py-2 focus:border-aubergine"
          />
          <button
            disabled={pending || !draft.trim()}
            className="rounded-lg bg-aubergine px-4 py-2.5 font-semibold text-shell-ink transition-colors hover:bg-aubergine-raised disabled:opacity-60"
          >
            {fil ? "Itanong" : "Ask"}
          </button>
        </form>
        <p className="text-[0.9375rem] text-ink-soft">
          {fil
            ? "Impormasyon lang, hindi legal na payo. Hindi nito mababago ang plano mo; para doon, kausapin ang broker mo."
            : "Information only, not legal advice. It can't change your plan; for that, talk to your broker."}
        </p>
      </div>
    </section>
  );
}
