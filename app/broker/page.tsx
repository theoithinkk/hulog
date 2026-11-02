import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getSubscription, listPlans, type PlanSummary } from "@/lib/paypal";
import { eventsFor, recentBuyerIds, recentEvents, type LedgerEntry } from "@/lib/db";
import { isPreparedBuyer, ledgerLabel } from "@/lib/demo";
import { formatDate } from "@/lib/explain";
import { daysLeft } from "@/lib/followup";
import { cachedPlan, situationFor } from "@/lib/situation";
import { installmentNumbers, rowStrand, strands, type Strand } from "@/lib/strip";
import { contractProgress, totalPriceLabel } from "@/lib/unit";
import { JumpNav, Shell } from "@/app/ui/shell";
import { WeaveStrip } from "@/app/ui/weave";
import { FollowUp } from "./follow-up";
import { NewUnitForm } from "./new-unit-form";

const when = (d: string | Date) =>
  new Date(d).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

export const dynamic = "force-dynamic";

const DEMO = process.env.DEMO_MODE === "true";

type Buyer = {
  id: string;
  name: string;
  unit?: string;
  weave: Strand[];
  total: number;
  numbers: Record<string, number>; // ledger event -> installment number (plain object: the cache stores JSON)
  status: string;
  tone: "ok" | "grace" | "missed" | "neutral";
  graceLeft: number | null; // days; negative once it has passed
  suspended: boolean;
};

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

// Buyers are the subscriptions the ledger has heard from, newest first. The page is public and each
// buyer costs a PayPal call, so the board is cached for 30 seconds whatever the traffic.
function buyersFrom(ids: string[]): Promise<Buyer[]> {
  return unstable_cache(() => loadBuyers(ids), ["buyers", ...ids], { revalidate: 30, tags: ["buyers"] })();
}

// Longest overdue first, then whoever runs out of grace soonest.
const byUrgency = (a: Buyer, b: Buyer) => (a.graceLeft ?? -Infinity) - (b.graceLeft ?? -Infinity);

async function loadBuyers(ids: string[]): Promise<Buyer[]> {
  const rows = await Promise.allSettled(
    ids.map(async (id): Promise<Buyer> => {
      const [sub, history] = await Promise.all([getSubscription(id), eventsFor(id)]);
      const situation = await situationFor(sub, history, DEMO).catch(() => null);
      // No catch: without the plan the earlier installments are unknown, and a wrong count is worse than a missing row.
      const plan = await cachedPlan(sub.plan_id);
      const unit = plan.name;
      const { paid, total } = contractProgress(sub, plan.description);
      const weave = strands(total, paid, situation?.missed ? { graceEnds: situation.rights.graceEnds } : null);
      // The broker page is public: first name and surname initial are enough to tell buyers apart.
      const given = sub.subscriber?.name?.given_name;
      const initial = sub.subscriber?.name?.surname?.[0];
      const name = given ? `${given}${initial ? ` ${initial}.` : ""}` : "Buyer";
      const graceLeft = situation?.missed ? daysLeft(situation.rights.graceEnds) : null;
      const base = {
        id,
        name,
        unit,
        weave,
        total,
        numbers: Object.fromEntries(installmentNumbers(history, paid)),
        graceLeft,
        suspended: sub.status === "SUSPENDED",
      };
      if (sub.status !== "ACTIVE" && sub.status !== "SUSPENDED")
        return { ...base, status: sub.status === "EXPIRED" ? "Fully paid" : "Cancelled", tone: "neutral" };
      if (weave.includes("missed")) {
        const ago = graceLeft !== null ? ` · ${days(-graceLeft)} ago` : "";
        return { ...base, status: `Missed, grace period over${ago}`, tone: "missed" };
      }
      if (weave.includes("grace") && situation?.rights.graceEnds && graceLeft !== null) {
        const until = formatDate(situation.rights.graceEnds, "en");
        return { ...base, status: `In grace until ${until} · ${days(graceLeft)} left`, tone: "grace" };
      }
      return { ...base, status: `On time · ${paid} of ${total} paid`, tone: "ok" };
    }),
  );
  const buyers = rows.flatMap((r) => {
    if (r.status === "fulfilled") return [r.value];
    console.error("broker buyer load failed:", r.reason instanceof Error ? r.reason.message : r.reason);
    return [];
  });
  if (!DEMO) return buyers;
  // Sandbox testing leaves many plans under one test account, so a demo shows the newest per name.
  const names = new Set<string>();
  return buyers.filter((b) => !names.has(b.name) && names.add(b.name));
}

const TONE = {
  ok: "bg-tikog/10 text-tikog",
  grace: "bg-turmeric/20 text-turmeric-ink",
  missed: "bg-magenta/10 text-magenta-deep",
  neutral: "bg-line text-ink-soft",
};

function BuyerRow({ buyer: b, children }: { buyer: Buyer; children?: React.ReactNode }) {
  return (
    <li className="relative flex flex-col gap-3 border-b border-line py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          {/* The whole row is the tap target. */}
          <Link href={`/buyer/${encodeURIComponent(b.id)}`} className="font-extrabold text-ink after:absolute after:inset-0">
            {b.name}
          </Link>
          {b.unit && <div className="text-[0.9375rem] text-ink-soft">{b.unit}</div>}
        </div>
        <span className={`rounded-full px-3 py-0.5 text-[0.9375rem] font-semibold ${TONE[b.tone]}`}>{b.status}</span>
      </div>
      <WeaveStrip strands={b.weave} label={`${b.name}: ${b.status}`} />
      {children}
    </li>
  );
}

export default async function BrokerPage() {
  let plans: PlanSummary[] = [];
  let loadError = false;
  try {
    plans = await listPlans();
  } catch (e) {
    console.error("listPlans failed:", e);
    loadError = true;
  }
  let events: LedgerEntry[] | null = null;
  let buyerIds: string[] = [];
  try {
    [events, buyerIds] = await Promise.all([recentEvents(), recentBuyerIds()]);
  } catch (e) {
    console.error("loading the ledger failed:", e);
  }
  const buyers = events ? await buyersFrom(buyerIds) : [];
  const behind = buyers.filter((b) => b.tone === "grace" || b.tone === "missed").sort(byUrgency);
  const others = buyers.filter((b) => !behind.includes(b));
  const buyerOf = new Map(buyers.map((b) => [b.id, b]));
  // A buyer the demo board hides shouldn't appear as a nameless row below it.
  const payments = DEMO ? events?.filter((e) => buyerOf.has(e.subscription_id ?? "")) : events;

  const panel = "panel";

  return (
    <>
      <Shell wide aside={<span className="text-shell-soft">Broker</span>}>
        <h1 className="mt-6 text-2xl font-extrabold leading-tight sm:text-[2rem]">Your units and buyers</h1>
        <p className="text-shell-soft">List a unit, send its payment link, and see every buyer&apos;s payments as they happen.</p>
        <JumpNav
          label="Sections"
          links={[
            ["#new-unit", "New unit"],
            ["#units", "Units"],
            ["#recent", "Payments"],
          ]}
        />
      </Shell>

      <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-5 pt-8 pb-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="new-unit" className="order-2 flex flex-col gap-3 lg:self-start">
          <h2 id="new-unit" className="text-xl font-bold">
            New unit
          </h2>
          <div className={`${panel} p-5`}>
            <NewUnitForm />
          </div>
        </section>

        <div className="order-1 flex flex-col gap-10">
          {behind.length > 0 && (
            <section aria-labelledby="attention" className="flex flex-col gap-3">
              <h2 id="attention" className="text-xl font-bold">
                Needs attention
              </h2>
              <ul className={`${panel} px-5`}>
                {behind.map((b) => (
                  <BuyerRow key={b.id} buyer={b}>
                    <FollowUp subscriptionId={b.id} name={b.name} suspended={b.suspended} locked={isPreparedBuyer(b.id)} />
                  </BuyerRow>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="buyers" className="flex flex-col gap-3">
            <h2 id="buyers" className="text-xl font-bold">
              {behind.length > 0 ? "Other buyers" : "Buyers"}
            </h2>
            {events === null && <p role="alert">Couldn&apos;t load the payment ledger.</p>}
            {events && buyers.length === 0 && (
              <p className="text-ink-soft">No buyers yet. Send a unit&apos;s payment link to a buyer to see them here.</p>
            )}
            {others.length > 0 && (
              <ul className={`${panel} px-5`}>
                {others.map((b) => (
                  <BuyerRow key={b.id} buyer={b} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="units" className="flex flex-col gap-3">
            <h2 id="units" className="text-xl font-bold">
              Units
            </h2>
            {loadError && <p role="alert">Couldn&apos;t reach PayPal. Check the server&apos;s PayPal settings.</p>}
            {!loadError && plans.length === 0 && <p className="text-ink-soft">No units yet. Create one to get a payment link.</p>}
            {plans.length > 0 && (
              <ul className={`${panel} px-5`}>
                {plans.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-4 last:border-b-0">
                    <div>
                      <div className="font-extrabold">{p.name}</div>
                      {totalPriceLabel(p.description) && (
                        <div className="num text-[0.9375rem] text-ink-soft">{totalPriceLabel(p.description)}</div>
                      )}
                    </div>
                    {p.status === "ACTIVE" ? (
                      <Link
                        href={`/pay/${p.id}`}
                        className="transition-colors rounded-lg border-2 border-aubergine bg-panel px-4 py-1.5 font-semibold text-aubergine no-underline hover:bg-aubergine/5"
                      >
                        Payment link
                      </Link>
                    ) : (
                      <span className="text-ink-soft">{p.status.toLowerCase()}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="recent" className="flex flex-col gap-3">
            <h2 id="recent" className="text-xl font-bold">
              Recent payments
            </h2>
            {payments?.length === 0 && <p className="text-ink-soft">No payments yet.</p>}
            {!!payments?.length && (
              <div className={panel}>
                <div className="overflow-x-auto">
                {/* On a phone each row becomes two lines, so no column hides off-screen. The roles keep it a table for screen readers. */}
                <table role="table" className="w-full text-left text-[1rem] max-sm:block">
                  <thead role="rowgroup" className="text-ink-soft max-sm:hidden">
                    <tr role="row" className="border-b border-line">
                      <th scope="col" className="px-5 py-3 font-semibold">When</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Payment</th>
                      <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Buyer</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup" className="max-sm:block">
                    {payments.map((e) => {
                      const buyer = e.subscription_id ? buyerOf.get(e.subscription_id) : undefined;
                      const raw = buyer?.numbers[e.event_id];
                      const n = raw && buyer && raw <= buyer.total ? raw : undefined;
                      return (
                        <tr
                          key={e.event_id}
                          role="row"
                          className="border-b border-line last:border-b-0 max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:gap-x-3 max-sm:px-5 max-sm:py-3"
                        >
                          <td role="cell" className="num px-5 py-3 xl:whitespace-nowrap max-sm:col-start-1 max-sm:row-start-3 max-sm:p-0 max-sm:text-[0.9375rem] max-sm:text-ink-soft">
                            {when(e.occurred_at)}
                          </td>
                          <td role="cell" className="px-3 py-3 max-sm:col-span-2 max-sm:row-start-1 max-sm:p-0 max-sm:font-semibold">
                            <span className="flex gap-2.5">
                              {n && buyer && (
                                <span aria-hidden className={`strand strand--${rowStrand(e.event_type, n, buyer.weave)} swatch mt-1`} />
                              )}
                              <span>
                                {n && buyer && <span className="num">{`Installment ${n} of ${buyer.total}: `}</span>}
                                {ledgerLabel(e)}
                              </span>
                            </span>
                          </td>
                          <td role="cell" className="num px-3 py-3 text-right whitespace-nowrap max-sm:col-start-1 max-sm:row-start-2 max-sm:p-0 max-sm:text-left">
                            {e.amount ? (
                              `${e.currency} ${Number(e.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                            ) : (
                              <span className="max-sm:hidden">—</span>
                            )}
                          </td>
                          <td role="cell" className="px-5 py-3 whitespace-nowrap max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-2 max-sm:self-center max-sm:p-0 max-sm:text-right">
                            <Link className="text-aubergine max-sm:inline-flex max-sm:min-h-11 max-sm:items-center" href={`/buyer/${encodeURIComponent(e.subscription_id ?? "")}`}>
                              {buyer?.name ?? "Buyer"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
