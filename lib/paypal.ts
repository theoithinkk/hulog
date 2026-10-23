import type { Unit } from "./unit";

// ponytail: sandbox only, the PRD rules out live payments. Switch on PAYPAL_ENV if that changes.
const API = "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  name = "PayPalError";
  constructor(
    public status: number,
    public debugId?: string,
  ) {
    super(`PayPal API error ${status}${debugId ? ` (debug_id ${debugId})` : ""}`);
  }
}

async function toError(res: Response) {
  const body = (await res.json().catch(() => ({}))) as { debug_id?: string };
  return new PayPalError(res.status, body.debug_id);
}

let token: { value: string; expiresAt: number } | null = null;

export function resetTokenCache() {
  token = null;
}

async function accessToken() {
  if (token && token.expiresAt > Date.now()) return token.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");

  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw await toError(res);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh a minute early so a token never expires mid-request.
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return token.value;
}

async function call<T>(path: string, body?: unknown, retried = false): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
    },
    // A string body is already JSON; see verifyWebhook.
    body: typeof body === "string" ? body : body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  // A cached token can be revoked early; fetch a fresh one and try once more.
  if (res.status === 401 && !retried) {
    resetTokenCache();
    return call(path, body, true);
  }
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

export type Interval = "DAY" | "MONTH";

const amount = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// One REGULAR cycle repeated `months` times. No trial, no setup fee: equity installments are flat.
export function buildPlanBody(productId: string, unit: Unit, interval: Interval) {
  return {
    product_id: productId,
    name: `${unit.name}, ${unit.project}`,
    description: `${unit.project} - TCP ${unit.currency} ${amount(unit.tcp)}`.slice(0, 127),
    billing_cycles: [
      {
        frequency: { interval_unit: interval, interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: unit.months,
        pricing_scheme: {
          fixed_price: { value: unit.monthlyAmount.toFixed(2), currency_code: unit.currency },
        },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
  };
}

export async function createUnitPlan(unit: Unit) {
  const product = await call<{ id: string }>("/v1/catalogs/products", {
    name: `${unit.name}, ${unit.project}`,
    type: "PHYSICAL",
  });
  // Daily billing in demo mode so judges can watch payments happen.
  const interval: Interval = process.env.DEMO_MODE === "true" ? "DAY" : "MONTH";
  const plan = await call<{ id: string }>(
    "/v1/billing/plans",
    buildPlanBody(product.id, unit, interval),
  );
  return { productId: product.id, planId: plan.id };
}

export type PlanSummary = {
  id: string;
  name: string;
  status: string;
  description?: string;
  create_time: string;
};

export type Plan = PlanSummary & {
  billing_cycles: {
    tenure_type: "REGULAR" | "TRIAL";
    frequency: { interval_unit: string };
    total_cycles: number;
    pricing_scheme: { fixed_price: { value: string; currency_code: string } };
  }[];
};

export type Subscription = {
  id: string;
  status: string;
  plan_id: string;
  start_time?: string;
  subscriber?: { name?: { given_name?: string; surname?: string } };
  billing_info?: {
    next_billing_time?: string;
    cycle_executions?: { tenure_type: "REGULAR" | "TRIAL"; cycles_completed: number; total_cycles: number }[];
    outstanding_balance?: { value: string; currency_code: string };
    last_payment?: { amount: { value: string; currency_code: string }; time: string };
  };
};

export async function listPlans() {
  // ponytail: first 20 plans only, add paging when a broker has more units than that.
  const r = await call<{ plans?: PlanSummary[] }>("/v1/billing/plans?page_size=20");
  return (r.plans ?? []).sort((a, b) => b.create_time.localeCompare(a.create_time));
}

export const getPlan = (id: string) => call<Plan>(`/v1/billing/plans/${encodeURIComponent(id)}`);

export const getSubscription = (id: string) =>
  call<Subscription>(`/v1/billing/subscriptions/${encodeURIComponent(id)}`);

const SIGNATURE_HEADERS = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
};

// Asks PayPal whether it really sent this event. `rawBody` must be valid JSON (the caller parses it first).
export async function verifyWebhook(headers: Headers, rawBody: string) {
  // Cheap checks first, so junk never costs a PayPal round trip (or a 500 on a misconfigured server).
  const fields = Object.fromEntries(
    Object.entries(SIGNATURE_HEADERS).map(([field, header]) => [field, headers.get(header)]),
  );
  if (Object.values(fields).some((v) => !v) || !isPayPalCertUrl(fields.cert_url!)) return false;

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID must be set");

  // Splice the raw body in: re-serialising the parsed event can change it and fail verification.
  const body = `${JSON.stringify({ ...fields, webhook_id: webhookId }).slice(0, -1)},"webhook_event":${rawBody}}`;
  try {
    const r = await call<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", body);
    return r.verification_status === "SUCCESS";
  } catch (e) {
    // PayPal rejecting the request means it won't vouch for it; a 5xx still throws so PayPal retries.
    if (e instanceof PayPalError && e.status >= 400 && e.status < 500) return false;
    throw e;
  }
}

function isPayPalCertUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "paypal.com" || u.hostname.endsWith(".paypal.com"));
  } catch {
    return false;
  }
}
