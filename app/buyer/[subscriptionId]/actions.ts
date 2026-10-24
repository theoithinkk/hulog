"use server";

import { revalidatePath } from "next/cache";
import { deleteDemoEvents, eventsFor, insertEvent } from "@/lib/db";
import { demoFailure, isDemoEvent } from "@/lib/demo";
import { getPlan, getSubscription } from "@/lib/paypal";
import { isSubscriptionId } from "@/lib/unit";

// The ID arrives from the browser (bound to the form), so check it like any other input.
// Looking it up in PayPal means demo rows only ever attach to real subscriptions.
async function demoSubscription(id: string) {
  if (process.env.DEMO_MODE !== "true") throw new Error("Demo controls are off");
  if (!isSubscriptionId(id)) throw new Error("Invalid subscription ID");
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
