import Link from "next/link";
import { listPlans, type PlanSummary } from "@/lib/paypal";
import { recentEvents, type LedgerEntry } from "@/lib/db";
import { ledgerLabel } from "@/lib/demo";
import { NewUnitForm } from "./new-unit-form";

const when = (d: string | Date) =>
  new Date(d).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

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
  let events: LedgerEntry[] | null = null;
  try {
    events = await recentEvents();
  } catch (e) {
    console.error("recentEvents failed:", e);
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

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Recent payments</h2>
        {events === null && <p role="alert">Couldn&apos;t load the payment ledger.</p>}
        {events?.length === 0 && <p>No payments yet.</p>}
        {!!events?.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-current/20">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Event</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2">Buyer</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.event_id} className="border-b border-current/10">
                    <td className="py-2 pr-4 whitespace-nowrap">{when(e.occurred_at)}</td>
                    <td className="py-2 pr-4">{ledgerLabel(e)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {e.amount
                        ? `${e.currency} ${Number(e.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="py-2">
                      <Link className="underline" href={`/buyer/${e.subscription_id}`}>
                        {e.subscription_id}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
