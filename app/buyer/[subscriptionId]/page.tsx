import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubscription, PayPalError, type Subscription } from "@/lib/paypal";
import { isSubscriptionId } from "@/lib/unit";
import { eventsFor, type LedgerEntry } from "@/lib/db";
import { eventLabel } from "@/lib/webhook";

export const dynamic = "force-dynamic";

const date = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }) : "—";

export default async function BuyerPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  if (!isSubscriptionId(subscriptionId)) notFound();

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

  const name = sub.subscriber?.name?.given_name;
  const cycles = sub.billing_info?.cycle_executions?.find((c) => c.total_cycles > 0);
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
      <p className="text-sm opacity-70">
        Information only, not legal advice. Consult a lawyer or licensed broker.
      </p>
    </main>
  );
}
