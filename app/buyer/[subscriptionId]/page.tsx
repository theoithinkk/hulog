import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubscription, PayPalError, type Subscription } from "@/lib/paypal";
import { isSubscriptionId } from "@/lib/unit";

export const dynamic = "force-dynamic";

const date = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }) : "—";

export default async function BuyerPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  if (!isSubscriptionId(subscriptionId)) notFound();

  let sub: Subscription;
  try {
    sub = await getSubscription(subscriptionId);
  } catch (e) {
    if (e instanceof PayPalError && e.status === 404) notFound();
    throw e;
  }

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
          Last payment: {last.amount.currency_code} {last.amount.value} on {date(last.time)}
        </p>
      )}
      <p>Next payment: {date(sub.billing_info?.next_billing_time)}</p>
      <p className="text-sm opacity-70">
        Information only, not legal advice. Consult a lawyer or licensed broker.
      </p>
    </main>
  );
}
