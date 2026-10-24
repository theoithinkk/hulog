import { notFound } from "next/navigation";
import { getPlan, PayPalError, type Plan } from "@/lib/paypal";
import { isPlanId, totalPriceLabel } from "@/lib/unit";
import { strands } from "@/lib/strip";
import { Disclaimer, Shell } from "@/app/ui/shell";
import { LEGEND_EN, WeaveLegend, WeaveStrip } from "@/app/ui/weave";
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
  const daily = cycle.frequency.interval_unit === "DAY";
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const weave = strands(cycle.total_cycles, 0, null);

  return (
    <>
      <Shell>
        <h1 className="mt-6 text-2xl font-extrabold leading-tight sm:text-[2rem]">{plan.name}</h1>
        {totalPriceLabel(plan.description) && <p className="num text-shell-soft">{totalPriceLabel(plan.description)}</p>}
      </Shell>

      <main className="mx-auto flex max-w-xl flex-col gap-10 px-5 pt-8 pb-14">
        <section aria-labelledby="plan" className="flex flex-col gap-5 rounded-2xl bg-panel p-5">
          <h2 id="plan" className="sr-only">
            Your installment plan
          </h2>
          <p>
            <span className="num block text-[2rem] font-extrabold leading-tight">
              {price.currency_code}{" "}
              {Number(price.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-ink-soft">
              a {daily ? "day (demo billing: each day stands in for a month)" : "month"}, for{" "}
              <span className="num">{cycle.total_cycles}</span> installments
            </span>
          </p>
          <div className="flex flex-col gap-3">
            <WeaveStrip strands={weave} label={`${cycle.total_cycles} installments, none paid yet`} />
            <WeaveLegend strands={weave} labels={LEGEND_EN} />
          </div>
          <div className="border-t border-line pt-5">
            {plan.status !== "ACTIVE" ? (
              <p role="alert">This unit isn&apos;t accepting payments right now. Ask your broker for a new link.</p>
            ) : clientId ? (
              <SubscribeButton clientId={clientId} planId={plan.id} currency={price.currency_code} />
            ) : (
              <p role="alert">Payments aren&apos;t set up on this server yet.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="how" className="flex flex-col gap-3">
          <h2 id="how" className="text-2xl font-extrabold">
            What happens after you subscribe
          </h2>
          <ol className="flex flex-col gap-3">
            {[
              "PayPal charges each installment automatically. You don't need to remember a due date.",
              "Every payment is woven into your strip on your own Hulog page, which your family can open too.",
              "If a payment fails, the page shows your exact grace period and rights under the Maceda Law, in English or Filipino.",
            ].map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-aubergine font-bold text-shell-ink">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <Disclaimer />
      </main>
    </>
  );
}
