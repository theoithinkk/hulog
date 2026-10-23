import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getPlan, getSubscription, PayPalError, type Subscription } from "@/lib/paypal";
import { isSubscriptionId } from "@/lib/unit";
import { eventsFor, type LedgerEntry } from "@/lib/db";
import { eventLabel, unpaidSince } from "@/lib/webhook";
import { macedaRights, manilaDate } from "@/lib/maceda";
import { explainRights, rightsFacts, templateMessage, type Explanation, type Lang, type Situation } from "@/lib/explain";

export const dynamic = "force-dynamic";

const date = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }) : "—";

// Plans don't change after creation, so one PayPal lookup an hour per plan is plenty.
const cachedPlan = (id: string) => unstable_cache(() => getPlan(id), ["plan", id], { revalidate: 3600 })();

// What the Maceda engine needs: payments made (PayPal) and the installment the buyer is behind on (ledger).
async function situationFor(sub: Subscription, events: LedgerEntry[] | null): Promise<Situation | null> {
  const cycles = sub.billing_info?.cycle_executions?.find((c) => c.tenure_type === "REGULAR");
  if (!cycles || !sub.start_time || !["ACTIVE", "SUSPENDED"].includes(sub.status)) return null;

  // Behind only if the ledger shows an unpaid failure and PayPal agrees money is owed;
  // either source alone can be stale (a lost webhook, or a balance PayPal hasn't updated yet).
  const owed = Number(sub.billing_info?.outstanding_balance?.value ?? 0) > 0;
  const unpaid = owed && events ? unpaidSince(events) : null;
  const missed = unpaid !== null;
  const due = unpaid ?? sub.billing_info?.next_billing_time;
  const price = (await cachedPlan(sub.plan_id)).billing_cycles.find((c) => c.tenure_type === "REGULAR")?.pricing_scheme
    .fixed_price;
  // The currency code ends up in text sent to the model; accept only an ISO code.
  if (!due || !price || !/^[A-Z]{3}$/.test(price.currency_code)) return null;

  const dueDate = manilaDate(new Date(due));
  return {
    rights: macedaRights({
      installmentsPaid: cycles.cycles_completed,
      totalPaidCents: cycles.cycles_completed * Math.round(Number(price.value) * 100),
      contractStart: manilaDate(new Date(sub.start_time)),
      dueDate,
      // ponytail: grace already used isn't tracked yet; it only matters after 2+ years. Add with contract records.
    }),
    missed,
    dueDate,
    currency: price.currency_code,
  };
}

const inFlight = new Map<string, Promise<Explanation>>();

// Same facts, same language: one model call an hour. Concurrent first views share that one call,
// and a fallback caused by a transient error isn't cached, so the next view tries again.
// ponytail: per-process; several Render instances would each make their own call.
function explanationFor(subId: string, s: Situation, lang: Lang): Promise<Explanation> {
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

  const situation = await situationFor(sub, events).catch((e): Situation | null => {
    console.error("rights calculation failed:", e instanceof Error ? e.message : e);
    return null;
  });
  const explanation = situation && (await explanationFor(sub.id, situation, lang));

  const name = sub.subscriber?.name?.given_name;
  const cycles = sub.billing_info?.cycle_executions?.find((c) => c.tenure_type === "REGULAR");
  const last = sub.billing_info?.last_payment;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-3xl font-bold">{name ? `Hi, ${name}` : "Your payments"}</h1>
      <p>
        Status: <strong>{sub.status}</strong>{" "}
        <Link href={`/buyer/${sub.id}`} className="text-sm underline">
          refresh
        </Link>
      </p>
      {cycles && (
        <p>
          {cycles.cycles_completed} of {cycles.total_cycles} payments made
        </p>
      )}
      {last && (
        <p>
          Last payment: {last.amount.currency_code}{" "}
          {Number(last.amount.value).toLocaleString("en-US", { minimumFractionDigits: 2 })} on {date(last.time)}
        </p>
      )}
      <p>Next payment: {date(sub.billing_info?.next_billing_time)}</p>
      {situation && explanation && (
        <section className="flex flex-col gap-2" lang={lang}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">{fil ? "Ang mga karapatan mo" : "Your rights"}</h2>
            <nav aria-label="Language" className="text-sm">
              <Link href={`/buyer/${sub.id}`} aria-current={fil ? undefined : "true"} className={fil ? "underline" : "font-semibold"}>
                English
              </Link>
              {" · "}
              <Link href={`/buyer/${sub.id}?lang=fil`} aria-current={fil ? "true" : undefined} className={fil ? "font-semibold" : "underline"}>
                Filipino
              </Link>
            </nav>
          </div>
          <p>{explanation.text}</p>
          {explanation.source === "ai" && (
            <p className="text-xs opacity-70">
              {fil ? "Isinulat ng AI batay sa mga detalye sa ibaba." : "Written by AI from the details below."}
            </p>
          )}
          <ul className="list-disc pl-5 text-sm">
            {rightsFacts(situation, lang).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">History</h2>
        {events === null && <p role="alert">Payment history is unavailable right now.</p>}
        {events?.length === 0 && <p>No payments recorded yet.</p>}
        {!!events?.length && (
          <ul className="flex flex-col gap-1">
            {events.map((e) => (
              <li key={e.event_id} className="flex justify-between gap-4 border-b border-current/10 py-1">
                <span>
                  {eventLabel(e.event_type)}
                  <span className="block text-sm opacity-70">{date(new Date(e.occurred_at).toISOString())}</span>
                </span>
                {e.amount && (
                  <span>
                    {e.currency} {Number(e.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-sm opacity-70" lang={lang}>
        {fil
          ? "Impormasyon lamang ito, hindi legal na payo. Kumonsulta sa abogado o lisensyadong broker."
          : "Information only, not legal advice. Consult a lawyer or licensed broker."}
      </p>
    </main>
  );
}
