import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getSubscription, listPlans, type PlanSummary } from "@/lib/paypal";
import { eventsFor, recentEvents, type LedgerEntry } from "@/lib/db";
import { ledgerLabel } from "@/lib/demo";
import { formatDate } from "@/lib/explain";
import { situationFor } from "@/lib/situation";
import { installmentNumbers, rowStrand, strands, type Strand } from "@/lib/strip";
import { totalPriceLabel } from "@/lib/unit";
import { Shell } from "@/app/ui/shell";
import { WeaveStrip } from "@/app/ui/weave";
import { NewUnitForm } from "./new-unit-form";

const when = (d: string | Date) =>
  new Date(d).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

export const dynamic = "force-dynamic";

const DEMO = process.env.DEMO_MODE === "true";

type Buyer = {
  id: string;
  name: string;
  weave: Strand[];
  total: number;
  numbers: Record<string, number>; // ledger event -> installment number (plain object: the cache stores JSON)
  status: string;
  tone: "ok" | "grace" | "missed" | "neutral";
};

// Buyers are the subscriptions the ledger has heard from, newest first. The page is public and each
// buyer costs a PayPal call, so the board is cached for 30 seconds whatever the traffic.
// ponytail: limited to the latest 20 ledger events; list subscriptions per plan when brokers have more buyers.
function buyersFrom(events: LedgerEntry[]): Promise<Buyer[]> {
  const ids = [...new Set(events.map((e) => e.subscription_id).filter((id): id is string => !!id))].slice(0, 8);
  return unstable_cache(() => loadBuyers(ids), ["buyers", ...ids], { revalidate: 30 })();
}

async function loadBuyers(ids: string[]): Promise<Buyer[]> {
  const rows = await Promise.allSettled(
    ids.map(async (id): Promise<Buyer> => {
      const [sub, history] = await Promise.all([getSubscription(id), eventsFor(id)]);
      const situation = await situationFor(sub, history, DEMO).catch(() => null);
      const cycles = sub.billing_info?.cycle_executions?.find((c) => c.tenure_type === "REGULAR");
      const paid = cycles?.cycles_completed ?? 0;
      const total = cycles?.total_cycles ?? 0;
      const weave = strands(total, paid, situation?.missed ? { graceEnds: situation.rights.graceEnds } : null);
      // The broker page is public: first name and surname initial are enough to tell buyers apart.
      const given = sub.subscriber?.name?.given_name;
      const initial = sub.subscriber?.name?.surname?.[0];
      const name = given ? `${given}${initial ? ` ${initial}.` : ""}` : "Buyer";
      const base = { id, name, weave, total, numbers: Object.fromEntries(installmentNumbers(history, paid)) };
      if (sub.status !== "ACTIVE" && sub.status !== "SUSPENDED")
        return { ...base, status: sub.status === "EXPIRED" ? "Fully paid" : "Cancelled", tone: "neutral" };
      if (weave.includes("missed")) return { ...base, status: "Missed, grace period over", tone: "missed" };
      if (weave.includes("grace") && situation?.rights.graceEnds)
        return { ...base, status: `In grace until ${formatDate(situation.rights.graceEnds, "en")}`, tone: "grace" };
      return { ...base, status: `On time · ${paid} of ${total} paid`, tone: "ok" };
    }),
  );
  return rows.flatMap((r) => {
    if (r.status === "fulfilled") return [r.value];
    console.error("broker buyer load failed:", r.reason instanceof Error ? r.reason.message : r.reason);
    return [];
  });
}

const TONE = {
  ok: "bg-tikog/10 text-tikog",
  grace: "bg-turmeric/20 text-turmeric-ink",
  missed: "bg-magenta/10 text-magenta-deep",
  neutral: "bg-line text-ink-soft",
};

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
  try {
    events = await recentEvents();
  } catch (e) {
    console.error("recentEvents failed:", e);
  }
  const buyers = events ? await buyersFrom(events) : [];
  const buyerOf = new Map(buyers.map((b) => [b.id, b]));

  const panel = "rounded-2xl bg-panel shadow-[0_2px_12px_rgba(43,19,56,0.08)]";

  return (
    <>
      <Shell wide aside={<span className="text-shell-soft">Broker</span>}>
        <h1 className="mt-6 text-[2rem] font-extrabold leading-tight">Your units and buyers</h1>
        <p className="text-shell-soft">List a unit, send its payment link, and see every buyer&apos;s payments as they happen.</p>
      </Shell>

      <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-5 pt-8 pb-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="new-unit" className="order-2 flex flex-col gap-3 lg:self-start">
          <h2 id="new-unit" className="text-2xl font-extrabold">
            New unit
          </h2>
          <div className={`${panel} p-5`}>
            <NewUnitForm />
          </div>
        </section>

        <div className="order-1 flex flex-col gap-10">
          <section aria-labelledby="buyers" className="flex flex-col gap-3">
            <h2 id="buyers" className="text-2xl font-extrabold">
              Buyers
            </h2>
            {events === null && <p role="alert">Couldn&apos;t load the payment ledger.</p>}
            {events && buyers.length === 0 && (
              <p className="text-ink-soft">No buyers yet. Send a unit&apos;s payment link to a buyer to see them here.</p>
            )}
            {buyers.length > 0 && (
              <ul className={`${panel} px-5`}>
                {buyers.map((b) => (
                  <li key={b.id} className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link href={`/buyer/${encodeURIComponent(b.id)}`} className="font-extrabold text-ink">
                        {b.name}
                      </Link>
                      <span className={`rounded-full px-3 py-0.5 text-[0.9375rem] font-semibold ${TONE[b.tone]}`}>{b.status}</span>
                    </div>
                    <WeaveStrip strands={b.weave} label={`${b.name}: ${b.status}`} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="units" className="flex flex-col gap-3">
            <h2 id="units" className="text-2xl font-extrabold">
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
                        className="rounded-lg border-2 border-aubergine px-4 py-1.5 font-semibold text-aubergine no-underline hover:bg-aubergine/5"
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
            <h2 id="recent" className="text-2xl font-extrabold">
              Recent payments
            </h2>
            {events?.length === 0 && <p className="text-ink-soft">No payments yet.</p>}
            {!!events?.length && (
              <div className={`${panel} overflow-x-auto`}>
                <table className="w-full text-left text-[1rem]">
                  <thead className="text-ink-soft">
                    <tr className="border-b border-line">
                      <th scope="col" className="px-5 py-3 font-semibold">When</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Payment</th>
                      <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Buyer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => {
                      const buyer = e.subscription_id ? buyerOf.get(e.subscription_id) : undefined;
                      const raw = buyer?.numbers[e.event_id];
                      const n = raw && buyer && raw <= buyer.total ? raw : undefined;
                      return (
                        <tr key={e.event_id} className="border-b border-line last:border-b-0">
                          <td className="num px-5 py-3 whitespace-nowrap">{when(e.occurred_at)}</td>
                          <td className="px-3 py-3">
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
                          <td className="num px-3 py-3 text-right whitespace-nowrap">
                            {e.amount
                              ? `${e.currency} ${Number(e.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                              : "—"}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <Link className="text-aubergine" href={`/buyer/${encodeURIComponent(e.subscription_id ?? "")}`}>
                              {buyer?.name ?? "Buyer"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
