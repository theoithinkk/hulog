"use server";

import { revalidatePath } from "next/cache";
import { accountFacts, answerQuestion, offAnswer, parseTurns, rightsToolFacts, transactionFacts, type Answer } from "@/lib/ask";
import { deleteDemoEvents, eventsFor, insertEvent } from "@/lib/db";
import { demoFailure, isDemoEvent } from "@/lib/demo";
import type { Lang } from "@/lib/explain";
import { getPlan, getSubscription, listTransactions } from "@/lib/paypal";
import { isSampleId } from "@/lib/samples";
import { cachedPlan, situationFor } from "@/lib/situation";
import { isSubscriptionId } from "@/lib/unit";

// The ID arrives from the browser (bound to the form), so check it like any other input.
// Looking it up in PayPal means demo rows only ever attach to real subscriptions.
async function demoSubscription(id: string) {
  if (process.env.DEMO_MODE !== "true") throw new Error("Demo controls are off");
  if (!isSubscriptionId(id) || isSampleId(id)) throw new Error("Invalid subscription ID");
  return getSubscription(id);
}

export async function simulateMissedPayment(subscriptionId: string) {
  const sub = await demoSubscription(subscriptionId);
  // Already showing a simulated miss: another click adds nothing, which caps ledger spam at one row.
  const [latest] = await eventsFor(sub.id);
  if (latest && isDemoEvent(latest.event_id)) return;
  const plan = await getPlan(sub.plan_id);
  const price = plan.billing_cycles.find((c) => c.tenure_type === "REGULAR")?.pricing_scheme.fixed_price;
  await insertEvent(demoFailure(sub.id, price));
  revalidatePath(`/buyer/${sub.id}`);
}

export async function resetDemo(subscriptionId: string) {
  const sub = await demoSubscription(subscriptionId);
  await deleteDemoEvents(sub.id);
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
  const plan = once(() => cachedPlan(sub.plan_id));
  const situation = once(async () => {
    const events = await eventsFor(sub.id).catch(() => null);
    return situationFor(sub, events, process.env.DEMO_MODE === "true").catch(() => null);
  });

  return answerQuestion(turns, l, {
    account: async () => {
      const price = (await plan()).billing_cycles.find((c) => c.tenure_type === "REGULAR")?.pricing_scheme.fixed_price;
      return accountFacts(sub, price, await situation());
    },
    // From a day before the plan started, so the first charge is never cut off by time zones.
    payments: async () =>
      transactionFacts(
        await listTransactions(sub.id, new Date(new Date(sub.start_time ?? 0).getTime() - 86_400_000), new Date()),
      ),
    rights: async () => rightsToolFacts(await situation()),
  });
}
