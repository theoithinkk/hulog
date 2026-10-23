import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlanBody, createUnitPlan, resetTokenCache, verifyWebhook } from "./paypal";
import type { Unit } from "./unit";

const unit: Unit = {
  name: "Unit 12B",
  project: "Azure Residences",
  tcp: 1800000,
  monthlyAmount: 15000,
  months: 36,
  currency: "PHP",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("buildPlanBody", () => {
  it("makes one regular cycle per installment at the monthly amount", () => {
    const body = buildPlanBody("PROD-1", unit, "MONTH");
    expect(body.product_id).toBe("PROD-1");
    expect(body.billing_cycles).toEqual([
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 36,
        pricing_scheme: {
          fixed_price: { value: "15000.00", currency_code: "PHP" },
        },
      },
    ]);
    expect(body.payment_preferences.auto_bill_outstanding).toBe(true);
  });

  it("puts project and TCP in the description within PayPal's 127-char limit", () => {
    const body = buildPlanBody("PROD-1", { ...unit, project: "x".repeat(60) }, "DAY");
    expect(body.description).toContain("TCP PHP 1,800,000.00");
    expect(body.description.length).toBeLessThanOrEqual(127);
    expect(body.billing_cycles[0].frequency.interval_unit).toBe("DAY");
  });
});

describe("createUnitPlan", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetTokenCache();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    vi.stubEnv("DEMO_MODE", "true");
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("gets a token, then creates product then plan", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 32400 }))
      .mockResolvedValueOnce(json({ id: "PROD-1" }, 201))
      .mockResolvedValueOnce(json({ id: "P-ABC123" }, 201));

    await expect(createUnitPlan(unit)).resolves.toEqual({
      productId: "PROD-1",
      planId: "P-ABC123",
    });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(tokenInit.headers.Authorization).toBe(`Basic ${btoa("id:secret")}`);

    const [productUrl, productInit] = fetchMock.mock.calls[1];
    expect(productUrl).toMatch(/\/v1\/catalogs\/products$/);
    expect(productInit.headers.Authorization).toBe("Bearer tok");

    const planBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(planBody.product_id).toBe("PROD-1");
    expect(planBody.billing_cycles[0].frequency.interval_unit).toBe("DAY");
  });

  it("reuses a cached token across calls", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 32400 }))
      .mockResolvedValueOnce(json({ id: "PROD-1" }, 201))
      .mockResolvedValueOnce(json({ id: "P-1" }, 201))
      .mockResolvedValueOnce(json({ id: "PROD-2" }, 201))
      .mockResolvedValueOnce(json({ id: "P-2" }, 201));

    await createUnitPlan(unit);
    await createUnitPlan(unit);
    const tokenCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/oauth2/token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("drops a rejected token and retries once on 401", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "old", expires_in: 32400 }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ access_token: "new", expires_in: 32400 }))
      .mockResolvedValueOnce(json({ id: "PROD-1" }, 201))
      .mockResolvedValueOnce(json({ id: "P-1" }, 201));

    await expect(createUnitPlan(unit)).resolves.toEqual({ productId: "PROD-1", planId: "P-1" });
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe("Bearer new");
  });

  it("gives up after a second 401", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "a", expires_in: 32400 }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ access_token: "b", expires_in: 32400 }))
      .mockResolvedValueOnce(json({}, 401));

    await expect(createUnitPlan(unit)).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("throws a PayPalError with status and debug_id, without the response body", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 32400 }))
      .mockResolvedValueOnce(json({ name: "INVALID_REQUEST", debug_id: "dbg42" }, 400));

    await expect(createUnitPlan(unit)).rejects.toMatchObject({
      name: "PayPalError",
      status: 400,
      debugId: "dbg42",
    });
  });

  it("fails clearly when credentials are missing", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "");
    await expect(createUnitPlan(unit)).rejects.toThrow(/PAYPAL_CLIENT_ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("verifyWebhook", () => {
  const fetchMock = vi.fn();
  const headers = new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
    "paypal-transmission-id": "tx-1",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-10-24T01:00:00Z",
  });
  // Spacing and number formatting PayPal signed; JSON.stringify would normalise both.
  const raw = '{"id": "WH-1", "amount": 1.50}';

  beforeEach(() => {
    resetTokenCache();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-ID");
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the headers, webhook ID and the untouched raw event to PayPal", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 32400 }))
      .mockResolvedValueOnce(json({ verification_status: "SUCCESS" }));

    await expect(verifyWebhook(headers, raw)).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toMatch(/\/v1\/notifications\/verify-webhook-signature$/);
    expect(init.body).toContain(`"webhook_event":${raw}`);
    expect(JSON.parse(init.body)).toMatchObject({
      auth_algo: "SHA256withRSA",
      cert_url: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
      transmission_id: "tx-1",
      transmission_sig: "sig",
      transmission_time: "2026-10-24T01:00:00Z",
      webhook_id: "WH-ID",
    });
  });

  it("returns false when PayPal says FAILURE", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 32400 }))
      .mockResolvedValueOnce(json({ verification_status: "FAILURE" }));
    await expect(verifyWebhook(headers, raw)).resolves.toBe(false);
  });

  it("returns false without calling PayPal when a signature header is missing", async () => {
    const partial = new Headers(headers);
    partial.delete("paypal-transmission-sig");
    await expect(verifyWebhook(partial, raw)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["http", "http://api.sandbox.paypal.com/v1/notifications/certs/CERT-1"],
    ["a non-PayPal host", "https://evil.example/certs/CERT-1"],
    ["a lookalike host", "https://paypal.com.evil.example/certs/CERT-1"],
  ])("returns false without calling PayPal when the cert URL is %s", async (_, certUrl) => {
    const forged = new Headers(headers);
    forged.set("paypal-cert-url", certUrl);
    await expect(verifyWebhook(forged, raw)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a PayPal 4xx on the verify call as unverified", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 32400 }))
      .mockResolvedValueOnce(json({ name: "VALIDATION_ERROR" }, 400));
    await expect(verifyWebhook(headers, raw)).resolves.toBe(false);
  });

  it("checks headers before configuration, so junk gets 400 not 500", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "");
    await expect(verifyWebhook(new Headers(), raw)).resolves.toBe(false);
  });

  it("fails clearly when the webhook ID is not configured", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "");
    await expect(verifyWebhook(headers, raw)).rejects.toThrow(/PAYPAL_WEBHOOK_ID/);
  });
});
