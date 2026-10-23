import Link from "next/link";
import { listPlans, type PlanSummary } from "@/lib/paypal";
import { NewUnitForm } from "./new-unit-form";

export const dynamic = "force-dynamic";

export default async function BrokerPage() {
  let plans: PlanSummary[] = [];
  let loadError = false;
  try {
    plans = await listPlans();
  } catch (e) {
    console.error("listPlans failed:", e);
    loadError = true;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <h1 className="text-3xl font-bold">Broker</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">New unit</h2>
        <NewUnitForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Units</h2>
        {loadError && <p role="alert">Couldn&apos;t reach PayPal. Check the server&apos;s PayPal configuration.</p>}
        {!loadError && plans.length === 0 && <p>No units yet.</p>}
        <ul className="flex flex-col gap-2">
          {plans.map((p) => (
            <li key={p.id} className="rounded border border-current/20 p-3">
              <div className="font-medium">{p.name}</div>
              {p.description && <div className="text-sm opacity-70">{p.description}</div>}
              <div className="text-sm">
                {p.status} &middot;{" "}
                <Link className="underline" href={`/pay/${p.id}`}>
                  payment link
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
