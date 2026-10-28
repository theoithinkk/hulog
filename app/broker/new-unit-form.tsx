"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createUnit, type FormState } from "./actions";

const input =
  "rounded-lg border border-line bg-panel px-3 py-2.5 text-ink focus:border-aubergine focus:outline-none focus-visible:outline-3 focus-visible:outline-magenta";

function Field(props: {
  name: string;
  label: string;
  defaultValue: string;
  inputMode?: "decimal" | "numeric";
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold">{props.label}</span>
      <input
        name={props.name}
        defaultValue={props.defaultValue}
        inputMode={props.inputMode}
        required
        className={`${input} ${props.inputMode ? "num" : ""}`}
      />
      {props.hint && <span className="text-[0.9375rem] text-ink-soft">{props.hint}</span>}
    </label>
  );
}

export function NewUnitForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createUnit, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field name="name" label="Unit" defaultValue="Unit 12B" />
      <Field name="project" label="Project" defaultValue="Azure Residences" />
      <Field name="tcp" label="Total contract price" defaultValue="1800000" inputMode="decimal" />
      <Field name="monthlyAmount" label="Monthly equity" defaultValue="15000" inputMode="decimal" />
      <Field name="months" label="Installments" defaultValue="36" inputMode="numeric" hint="One per month." />
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">Currency</span>
        <select name="currency" defaultValue="PHP" className={input}>
          <option value="PHP">PHP</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <button
        disabled={pending}
        className="transition-colors rounded-lg bg-aubergine px-5 py-3 font-bold text-shell-ink hover:bg-aubergine-raised disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
      >
        {pending ? "Creating the PayPal plan…" : "Create unit and payment link"}
      </button>
      {state.error && (
        <p role="alert" className="rounded-lg bg-magenta/10 px-4 py-3 text-magenta-deep sm:col-span-2">
          {state.error}
        </p>
      )}
      {state.planId && (
        <p role="status" className="rounded-lg bg-tikog/10 px-4 py-3 sm:col-span-2">
          Unit created. Send the buyer this payment link:{" "}
          <Link className="font-semibold break-all text-tikog" href={`/pay/${state.planId}`}>
            /pay/{state.planId}
          </Link>
        </p>
      )}
    </form>
  );
}
