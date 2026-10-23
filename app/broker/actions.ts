"use server";

import { revalidatePath } from "next/cache";
import { createUnitPlan } from "@/lib/paypal";
import { parseUnit } from "@/lib/unit";

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
