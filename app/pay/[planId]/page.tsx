import { notFound } from "next/navigation";
import { getPlan, PayPalError, type Plan } from "@/lib/paypal";
import { isPlanId } from "@/lib/unit";
import { SubscribeButton } from "./subscribe-button";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  if (!isPlanId(planId)) notFound();

  let plan: Plan;
  try {
    plan = await getPlan(planId);
  } catch (e) {
    if (e instanceof PayPalError && e.status === 404) notFound();
    throw e;
  }

  const cycle = plan.billing_cycles.find((c) => c.pricing_scheme?.fixed_price);
  if (!cycle) notFound();
  const price = cycle.pricing_scheme.fixed_price;
  const per = cycle.frequency.interval_unit === "DAY" ? "day (demo billing)" : "month";
  const clientId = process.env.PAYPAL_CLIENT_ID;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-3xl font-bold">{plan.name}</h1>
      {plan.description && <p className="opacity-70">{plan.description}</p>}
      <p className="text-lg">
        {price.currency_code} {Number(price.value).toLocaleString("en-US", { minimumFractionDigits: 2 })} per {per},{" "}
        {cycle.total_cycles} payments
      </p>
      {plan.status !== "ACTIVE" ? (
        <p role="alert">This unit isn&apos;t accepting payments right now.</p>
      ) : clientId ? (
        <SubscribeButton clientId={clientId} planId={plan.id} currency={price.currency_code} />
      ) : (
        <p role="alert">Payments aren&apos;t configured on this server.</p>
      )}
      <p className="text-sm opacity-70">
        Information only, not legal advice. Consult a lawyer or licensed broker.
      </p>
    </main>
  );
}
