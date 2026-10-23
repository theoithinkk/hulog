"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createUnit, type FormState } from "./actions";

function Field(props: { name: string; label: string; defaultValue: string; inputMode?: "decimal" | "numeric" }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {props.label}
      <input
        name={props.name}
        defaultValue={props.defaultValue}
        inputMode={props.inputMode}
        required
        className="rounded border border-current/30 bg-transparent px-3 py-2"
      />
    </label>
  );
}

export function NewUnitForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createUnit, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field name="name" label="Unit" defaultValue="Unit 12B" />
      <Field name="project" label="Project" defaultValue="Azure Residences" />
      <Field name="tcp" label="Total contract price" defaultValue="1800000" inputMode="decimal" />
      <Field name="monthlyAmount" label="Monthly equity" defaultValue="15000" inputMode="decimal" />
      <Field name="months" label="Months" defaultValue="36" inputMode="numeric" />
      <label className="flex flex-col gap-1 text-sm">
        Currency
        <select name="currency" defaultValue="PHP" className="rounded border border-current/30 bg-transparent px-3 py-2">
          <option value="PHP">PHP</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <button
        disabled={pending}
        className="rounded bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50 sm:col-span-2"
      >
        {pending ? "Creating PayPal plan..." : "Create unit"}
      </button>
      {state.error && (
        <p role="alert" className="text-red-600 sm:col-span-2">
          {state.error}
        </p>
      )}
      {state.planId && (
        <p className="sm:col-span-2">
          Plan created. Buyer payment link:{" "}
          <Link className="underline" href={`/pay/${state.planId}`}>
            /pay/{state.planId}
          </Link>
        </p>
      )}
    </form>
  );
}
