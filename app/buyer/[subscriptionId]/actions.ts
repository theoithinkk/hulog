"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { accountFacts, answerQuestion, busyAnswer, offAnswer, parseTurns, rightsToolFacts, transactionFacts, type Answer } from "@/lib/ask";
import { deleteDemoEvents, eventsFor, insertEvent } from "@/lib/db";
import { demoFailure, isDemoEvent, isPreparedBuyer, latestPaymentEvent, LONG_MISS_DAYS, LONG_MISS_MIN_PRIOR } from "@/lib/demo";
import type { Lang } from "@/lib/explain";
import { takeAskBudget } from "@/lib/limits";
import { activateSubscription, getPlan, getSubscription, listTransactions, suspendSubscription } from "@/lib/paypal";
import { cachedPlan, situationFor } from "@/lib/situation";
import { isSubscriptionId, priorInstallments } from "@/lib/unit";

// The ID arrives from the browser (bound to the form), so check it like any other input.
// Looking it up in PayPal means demo rows only ever attach to real subscriptions.
async function demoSubscription(id: string) {
  if (process.env.DEMO_MODE !== "true") throw new Error("Demo controls are off");
  if (!isSubscriptionId(id)) throw new Error("Invalid subscription ID");
  if (isPreparedBuyer(id)) throw new Error("This buyer's demo controls are locked");
  return getSubscription(id);
}

async function simulateMiss(subscriptionId: string, daysAgo: number) {
  const sub = await demoSubscription(subscriptionId);
  // Already showing a simulated miss: another click adds nothing, which caps ledger spam at one row.
  const latest = latestPaymentEvent(await eventsFor(sub.id));
  if (latest && isDemoEvent(latest.event_id)) return;
  const plan = await getPlan(sub.plan_id);
  // A due date before the contract began has no rights to calculate.
  if (daysAgo && priorInstallments(plan.description) < LONG_MISS_MIN_PRIOR) throw new Error("Contract is too new");
  const price = plan.billing_cycles.find((c) => c.tenure_type === "REGULAR")?.pricing_scheme.fixed_price;
  const now = new Date();
  await insertEvent(demoFailure(sub.id, price, now, daysAgo ? new Date(now.getTime() - daysAgo * 86_400_000) : undefined));
  // Really stop the charges: the next one would count as catching up and undo the simulated miss.
  if (sub.status === "ACTIVE") {
    await suspendSubscription(sub.id, "Hulog demo: simulated missed payment").catch((e) =>
      console.error("demo suspend failed:", e instanceof Error ? e.message : e),
    );
  }
  revalidateTag("buyers");
  revalidatePath(`/buyer/${sub.id}`);
}

export async function simulateMissedPayment(subscriptionId: string) {
  await simulateMiss(subscriptionId, 0);
}

export async function simulateLongMissedPayment(subscriptionId: string) {
  await simulateMiss(subscriptionId, LONG_MISS_DAYS);
}

export async function resetDemo(subscriptionId: string) {
  const sub = await demoSubscription(subscriptionId);
  await deleteDemoEvents(sub.id);
  if (sub.status === "SUSPENDED") {
    await activateSubscription(sub.id, "Hulog demo: reset").catch((e) =>
      console.error("demo activate failed:", e instanceof Error ? e.message : e),
    );
  }
  revalidateTag("buyers");
  revalidatePath(`/buyer/${sub.id}`);
}

// One lookup per request, however many times the model asks.
const once = <T,>(f: () => Promise<T>) => {
  let p: Promise<T> | undefined;
  return () => (p ??= f());
};

export async function askHulog(subscriptionId: string, lang: Lang, rawTurns: unknown): Promise<Answer> {
  // Everything here arrives from the browser.
  if (!isSubscriptionId(subscriptionId)) throw new Error("Invalid subscription ID");
  const l: Lang = lang === "fil" ? "fil" : "en";
  const turns = parseTurns(rawTurns);
  if (!turns) throw new Error("Invalid question");
  if (!process.env.ANTHROPIC_API_KEY) return offAnswer(l);

  // Fetched up front: an unknown subscription fails here, before any model call.
  const sub = await getSubscription(subscriptionId);
  if (!takeAskBudget()) return busyAnswer(l);
  const plan = once(() => cachedPlan(sub.plan_id));
  const situation = once(async () => {
    const events = await eventsFor(sub.id).catch(() => null);
    return situationFor(sub, events, process.env.DEMO_MODE === "true").catch(() => null);
  });

  return answerQuestion(turns, l, {
    account: async () => {
      const p = await plan();
      const price = p.billing_cycles.find((c) => c.tenure_type === "REGULAR")?.pricing_scheme.fixed_price;
      return accountFacts(sub, price, await situation(), priorInstallments(p.description));
    },
    // From a day before the plan started, so the first charge is never cut off by time zones.
    payments: async () =>
      transactionFacts(
        await listTransactions(sub.id, new Date(new Date(sub.start_time ?? 0).getTime() - 86_400_000), new Date()),
      ),
    rights: async () => rightsToolFacts(await situation()),
  });
}
