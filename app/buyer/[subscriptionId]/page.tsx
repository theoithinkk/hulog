import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getSubscription, PayPalError, type Subscription } from "@/lib/paypal";
import { isSubscriptionId } from "@/lib/unit";
import { eventsFor, type LedgerEntry } from "@/lib/db";
import { ledgerLabel } from "@/lib/demo";
import { cachedPlan, situationFor } from "@/lib/situation";
import { installmentNumbers, rowStrand, strands } from "@/lib/strip";
import {
  explainRights,
  formatDate,
  rightsFacts,
  templateMessage,
  type Explanation,
  type Lang,
  type Situation,
} from "@/lib/explain";
import { Disclaimer, Shell } from "@/app/ui/shell";
import { LEGEND_EN, LEGEND_FIL, WeaveLegend, WeaveStrip } from "@/app/ui/weave";
import { resetDemo, simulateMissedPayment } from "./actions";

export const dynamic = "force-dynamic";

const DEMO = process.env.DEMO_MODE === "true";

const shortDate = (d?: string | Date) =>
  d ? new Date(d).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }) : "—";

const amount = (value: string, currency: string) =>
  `${currency} ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inFlight = new Map<string, Promise<Explanation>>();

// Same facts, same language: one model call an hour. Concurrent first views share that one call,
// and a fallback caused by a transient error isn't cached, so the next view tries again.
// ponytail: per-process; several Render instances would each make their own call.
function explanationFor(subId: string, s: Situation, lang: Lang): Promise<Explanation> {
  // AI off (no key): nothing to cache, and adding a key later takes effect on the next view.
  if (!process.env.ANTHROPIC_API_KEY) return Promise.resolve({ text: templateMessage(s, lang), source: "template" });
  const key = JSON.stringify([subId, lang, s]);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const cached = unstable_cache(
    async () => {
      const r = await explainRights(s, lang);
      if (r.transient) throw Object.assign(new Error("transient"), { fallback: r });
      return r;
    },
    ["rights", key],
    { revalidate: 3600 },
  );
  const p = cached()
    .catch((e: { fallback?: Explanation }) => e.fallback ?? { text: templateMessage(s, lang), source: "template" as const })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

// "Label: value" facts become rows; whole sentences stay sentences.
function splitFact(f: string): [string | null, string] {
  const i = f.indexOf(": ");
  return i > 0 && i < 60 ? [f.slice(0, i), f.slice(i + 2)] : [null, f];
}

const STATUS: Record<string, [string, string]> = {
  ACTIVE: ["Active", "Aktibo"],
  SUSPENDED: ["Suspended", "Suspendido"],
  CANCELLED: ["Cancelled", "Kinansela"],
  EXPIRED: ["Fully paid", "Bayad na nang buo"],
};

export default async function BuyerPage({
  params,
  searchParams,
}: {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { subscriptionId } = await params;
  if (!isSubscriptionId(subscriptionId)) notFound();
  const lang: Lang = (await searchParams).lang === "fil" ? "fil" : "en";
  const fil = lang === "fil";

  // A ledger outage shouldn't hide the status PayPal already knows.
  const history = eventsFor(subscriptionId).catch((e): LedgerEntry[] | null => {
    console.error("eventsFor failed:", e);
    return null;
  });

  let sub: Subscription;
  try {
    sub = await getSubscription(subscriptionId);
  } catch (e) {
    if (e instanceof PayPalError && e.status === 404) notFound();
    throw e;
  }
  const events = await history;
  const plan = await cachedPlan(sub.plan_id).catch(() => null);

  const situation = await situationFor(sub, events, DEMO).catch((e): Situation | null => {
    console.error("rights calculation failed:", e instanceof Error ? e.message : e);
    return null;
  });
  const explanation = situation && (await explanationFor(sub.id, situation, lang));

  const name = sub.subscriber?.name?.given_name;
  const cycles = sub.billing_info?.cycle_executions?.find((c) => c.tenure_type === "REGULAR");
  const price = plan?.billing_cycles.find((c) => c.tenure_type === "REGULAR")?.pricing_scheme.fixed_price;
  const last = sub.billing_info?.last_payment;
  const paid = cycles?.cycles_completed ?? 0;
  const total = cycles?.total_cycles ?? 0;
  const weave = strands(total, paid, situation?.missed ? { graceEnds: situation.rights.graceEnds } : null);
  const status = STATUS[sub.status]?.[fil ? 1 : 0] ?? sub.status;
  const next = Math.min(paid + 1, total);
  const numbers = installmentNumbers(events ?? [], paid);

  const self = `/buyer/${sub.id}`;
  const langNav = (
    <nav aria-label={fil ? "Wika" : "Language"} className="flex rounded-full border border-white/25 p-0.5 text-[0.9375rem]">
      {(
        [
          ["en", "English", self],
          ["fil", "Filipino", `${self}?lang=fil`],
        ] as const
      ).map(([code, label, href]) => (
        <Link
          key={code}
          href={href}
          aria-current={lang === code ? "page" : undefined}
          className={`rounded-full px-3 py-1 no-underline ${
            lang === code ? "bg-shell-ink font-semibold text-aubergine" : "text-shell-soft hover:text-shell-ink"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );

  // A calm headline, then which installment and the date the law gives until. The installment's own
  // strand sits beside the date, so the rights panel speaks the strip's language. Once the grace
  // period has passed (its strand turns "missed"), nothing on the panel may still promise time.
  const graceEnds = situation?.rights.graceEnds ?? null;
  const nextStrand = weave[paid] ?? "upcoming";
  const expired = !!situation?.missed && nextStrand === "missed";
  const t = (en: string, tl: string) => (fil ? tl : en);
  const headline = !situation?.missed
    ? t("You're up to date.", "Maayos ang mga bayad mo.")
    : !graceEnds
      ? t("Your grace period is used up.", "Nagamit mo na ang grace period.")
      : expired
        ? t("Your grace period has ended.", "Tapos na ang grace period mo.")
        : t("You still have time.", "May panahon ka pa.");
  const lead = situation?.missed
    ? t(`Installment ${next} of ${total} wasn't paid. `, `Hindi nabayaran ang hulog ${next} sa ${total}. `) +
      (!graceEnds
        ? t(
            "You've already used your grace period for this stretch of the contract.",
            "Nagamit mo na ang grace period para sa yugtong ito ng kontrata.",
          )
        : expired
          ? t("Your grace period ended on", "Natapos ang grace period mo noong")
          : t("Your grace period ends on", "Matatapos ang grace period mo sa"))
    : graceEnds
      ? t(
          `If installment ${next} of ${total} is missed, your grace period would end on`,
          `Kung hindi mabayaran ang hulog ${next} sa ${total}, matatapos ang grace period sa`,
        )
      : t(
          `No grace period is available for installment ${next} of ${total}.`,
          `Walang grace period para sa hulog ${next} sa ${total}.`,
        );
  const decide = situation && (
    <>
      <h3 className="text-xl font-extrabold">{headline}</h3>
      <p className="mt-1 text-ink-soft">{lead}</p>
      {graceEnds && (
        <p className="mt-2 flex items-center gap-3">
          <span aria-hidden className={`strand strand--${nextStrand} swatch-lg`} />
          <span
            className={`num text-[clamp(1.25rem,6.2vw,2rem)] font-extrabold leading-tight whitespace-nowrap ${expired ? "text-magenta-deep" : "text-ink"}`}
          >
            {formatDate(graceEnds, lang)}
          </span>
        </p>
      )}
    </>
  );

  return (
    <>
      <Shell wide aside={langNav}>
        <h1 className="mt-6 text-2xl font-extrabold leading-tight sm:text-[2rem]" lang={lang}>
          {name ? (fil ? `Kumusta, ${name}` : `Hi, ${name}`) : fil ? "Ang mga bayad mo" : "Your payments"}
        </h1>
        {plan && (
          <p className="text-shell-soft">
            {plan.name}
            {price && (
              <>
                {" · "}
                <span className="num whitespace-nowrap">
                  {amount(price.value, price.currency_code)} {fil ? "kada buwan" : "a month"}
                </span>
              </>
            )}
          </p>
        )}
        {total > 0 && (
          <div className="mt-5 flex flex-col gap-3">
            <WeaveStrip
              dark
              strands={weave}
              label={fil ? `${paid} sa ${total} na hulog ang bayad na` : `${paid} of ${total} installments paid`}
            />
            <WeaveLegend dark strands={weave} labels={fil ? LEGEND_FIL : LEGEND_EN} />
          </div>
        )}
      </Shell>

      <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-10 px-5 pt-8 pb-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" lang={lang}>
        {situation && explanation && (
          <section aria-labelledby="rights" className="flex flex-col gap-3">
            <h2 id="rights" className="text-2xl font-extrabold">
              {fil ? "Ang mga karapatan mo" : "Your rights"}
            </h2>
            <div className="flex flex-col gap-4 rounded-2xl bg-panel p-5">
              <div>{decide}</div>
              {/* Its words assume time remains, so it steps aside once the grace period has passed. */}
              {!expired && <p>{explanation.text}</p>}
              {!expired && explanation.source === "ai" && (
                <p className="text-[0.9375rem] text-ink-soft">
                  {fil ? "Isinulat ng AI batay sa mga detalye sa ibaba." : "Written by AI from the details below."}
                </p>
              )}
              {(() => {
                const facts = rightsFacts(situation, lang).map(splitFact);
                return (
                  <div className="border-t border-line text-[1rem]">
                    <dl>
                      {facts
                        .filter(([label]) => label)
                        .map(([label, value]) => (
                          <div
                            key={label}
                            className="flex flex-col gap-0.5 border-b border-line py-3 sm:flex-row sm:justify-between sm:gap-6"
                          >
                            <dt className="text-ink-soft">{label}</dt>
                            <dd className="num font-semibold sm:text-right">{value}</dd>
                          </div>
                        ))}
                    </dl>
                    <ul>
                      {facts
                        .filter(([label]) => !label)
                        .map(([, value]) => (
                          <li key={value} className="border-b border-line py-3">
                            {value}
                          </li>
                        ))}
                    </ul>
                  </div>
                );
              })()}
              <Disclaimer fil={fil} />
            </div>
          </section>
        )}

        <section aria-labelledby="payments" className="flex flex-col gap-3">
          <h2 id="payments" className="text-2xl font-extrabold">
            {fil ? "Mga bayad" : "Payments"}
          </h2>
          <dl className="rounded-2xl bg-panel px-5 py-2">
            <div className="flex justify-between gap-6 border-b border-line py-3">
              <dt className="text-ink-soft">{fil ? "Katayuan" : "Status"}</dt>
              <dd className="font-semibold">{status}</dd>
            </div>
            {total > 0 && (
              <div className="flex justify-between gap-6 border-b border-line py-3">
                <dt className="text-ink-soft">{fil ? "Naibayad" : "Paid so far"}</dt>
                <dd className="num font-semibold">
                  {paid} / {total}
                </dd>
              </div>
            )}
            {last && (
              <div className="flex justify-between gap-6 border-b border-line py-3">
                <dt className="text-ink-soft">{fil ? "Huling bayad" : "Last payment"}</dt>
                <dd className="num text-right font-semibold">
                  {amount(last.amount.value, last.amount.currency_code)}
                  <span className="block text-[0.9375rem] font-normal text-ink-soft">{shortDate(last.time)}</span>
                </dd>
              </div>
            )}
            {situation?.missed ? (
              // Behind: the useful date is when to catch up by, not the missed installment's own due date.
              graceEnds && (
                <div className="flex justify-between gap-6 py-3">
                  <dt className="text-ink-soft">{fil ? "Humabol bago ang" : "Catch up by"}</dt>
                  <dd className="num font-semibold">{formatDate(graceEnds, lang)}</dd>
                </div>
              )
            ) : (
              <div className="flex justify-between gap-6 py-3">
                <dt className="text-ink-soft">{fil ? "Susunod na bayad" : "Next payment"}</dt>
                <dd className="num font-semibold">{shortDate(sub.billing_info?.next_billing_time)}</dd>
              </div>
            )}
          </dl>

          <h3 className="mt-4 text-lg font-extrabold">{fil ? "Kasaysayan" : "History"}</h3>
          {events === null && (
            <p role="alert">{fil ? "Hindi makuha ang kasaysayan ng bayad ngayon." : "Payment history is unavailable right now."}</p>
          )}
          {events?.length === 0 && <p className="text-ink-soft">{fil ? "Wala pang naitalang bayad." : "No payments recorded yet."}</p>}
          {!!events?.length && (
            <ul className="rounded-2xl bg-panel px-5 py-1" lang="en">
              {events.map((e) => {
                const raw = numbers.get(e.event_id);
                const n = raw && raw <= total ? raw : undefined;
                return (
                <li key={e.event_id} className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
                  <span className="flex gap-3">
                    {n && <span aria-hidden className={`strand strand--${rowStrand(e.event_type, n, weave)} swatch mt-1`} />}
                    <span>
                      {n && (
                        <span className="num" lang={lang}>
                          {fil ? `Hulog ${n} sa ${total}: ` : `Installment ${n} of ${total}: `}
                        </span>
                      )}
                      {ledgerLabel(e)}
                      <span className="block text-[0.9375rem] text-ink-soft">{shortDate(e.occurred_at)}</span>
                    </span>
                  </span>
                  {e.amount && e.currency && (
                    <span className="num font-semibold whitespace-nowrap">{amount(e.amount, e.currency)}</span>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </section>

        {DEMO && (
          <section
            aria-label="Demo controls"
            lang="en"
            className="flex flex-col gap-3 rounded-2xl border-2 border-dashed lg:col-span-2 border-ink-soft/40 p-5"
          >
            <p className="text-[0.9375rem] text-ink-soft">
              Demo only. PayPal sandbox can&apos;t fail a payment on cue, so these add or remove a marked, simulated one.
            </p>
            <div className="flex flex-wrap gap-3">
              <form action={simulateMissedPayment.bind(null, sub.id)}>
                <button className="rounded-lg bg-aubergine px-4 py-2.5 font-semibold text-shell-ink hover:bg-aubergine-raised">
                  Simulate a missed payment
                </button>
              </form>
              <form action={resetDemo.bind(null, sub.id)}>
                <button className="rounded-lg border-2 border-aubergine px-4 py-2 font-semibold text-aubergine hover:bg-aubergine/5">
                  Reset demo
                </button>
              </form>
            </div>
          </section>
        )}

        {!situation && (
          <div className="lg:col-span-2">
            <Disclaimer fil={fil} />
          </div>
        )}
      </main>
    </>
  );
}
