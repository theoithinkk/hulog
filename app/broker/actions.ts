"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { eventsFor } from "@/lib/db";
import { isPreparedBuyer } from "@/lib/demo";
import type { Lang } from "@/lib/explain";
import { draftFollowUp, templateFollowUp, type Draft, type FollowUpInput } from "@/lib/followup";
import { takeAskBudget } from "@/lib/limits";
import { activateSubscription, createUnitPlan, getSubscription } from "@/lib/paypal";
import { cachedPlan, situationFor } from "@/lib/situation";
import { isSubscriptionId, parseUnit } from "@/lib/unit";

export type FormState = { error?: string; planId?: string };

export async function createUnit(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parseUnit(Object.fromEntries(form));
  if (!parsed.ok) return { error: parsed.error };
  try {
    const { planId } = await createUnitPlan(parsed.unit);
    revalidatePath("/broker");
    return { planId };
  } catch (e) {
    console.error("createUnit failed:", e);
    return { error: "PayPal couldn't create the plan. Try again, or switch the currency to USD." };
  }
}

// Read-only: returns text for the broker to review. Nothing is sent to the buyer.
export async function draftBuyerFollowUp(subscriptionId: string, rawLang: unknown): Promise<Draft> {
  // Everything here arrives from the browser.
  if (!isSubscriptionId(subscriptionId)) throw new Error("Invalid subscription ID");
  const lang: Lang = rawLang === "fil" ? "fil" : "en";
  const sub = await getSubscription(subscriptionId);
  const events = await eventsFor(sub.id);
  const situation = await situationFor(sub, events, process.env.DEMO_MODE === "true");
  if (!situation?.missed) throw new Error("This buyer isn't behind");
  const plan = await cachedPlan(sub.plan_id);
  const price = plan.billing_cycles.find((c) => c.tenure_type === "REGULAR")?.pricing_scheme.fixed_price;
  if (!price) throw new Error("This plan has no price");
  const input: FollowUpInput = { firstName: sub.subscriber?.name?.given_name, unit: plan.name, price, situation };
  // Same ceiling as Ask Hulog, so drafts can't run up the bill either.
  if (!takeAskBudget()) return { text: templateFollowUp(input, lang), source: "template" };
  return draftFollowUp(input, lang);
}

// ponytail: demo only. Restarting charges needs a broker login before this can exist on a real account.
export async function resumePlan(subscriptionId: string) {
  if (process.env.DEMO_MODE !== "true") throw new Error("Demo controls are off");
  if (!isSubscriptionId(subscriptionId)) throw new Error("Invalid subscription ID");
  if (isPreparedBuyer(subscriptionId)) throw new Error("This buyer's demo controls are locked");
  const sub = await getSubscription(subscriptionId);
  if (sub.status !== "SUSPENDED") throw new Error("This plan isn't paused");
  await activateSubscription(sub.id, "Resumed by the broker");
  revalidateTag("buyers");
  revalidatePath("/broker");
  revalidatePath(`/buyer/${sub.id}`);
}
