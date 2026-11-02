import { describe, expect, it } from "vitest";
import { behindSince, demoFailure, isDemoEvent, isPreparedBuyer, latestPaymentEvent, ledgerLabel, TRY_DEMO_BUYER } from "./demo";

const FAILED = "BILLING.SUBSCRIPTION.PAYMENT.FAILED";
const at = (iso: string) => new Date(iso);

describe("demoFailure", () => {
  it("builds a clearly marked failed-payment row", () => {
    const row = demoFailure("I-ABC123", { value: "15000.00", currency_code: "PHP" }, at("2026-10-24T03:00:00Z"));
    expect(row).toMatchObject({
      eventType: FAILED,
      subscriptionId: "I-ABC123",
      amount: "15000.00",
      currency: "PHP",
      occurredAt: "2026-10-24T03:00:00.000Z",
      raw: '{"demo":true}',
    });
    expect(isDemoEvent(row.eventId)).toBe(true);
  });

  it("records a backdated due date without backdating the row", () => {
    const row = demoFailure("I-ABC123", undefined, at("2026-10-24T03:00:00Z"), at("2026-08-10T03:00:00Z"));
    expect(row.occurredAt).toBe("2026-10-24T03:00:00.000Z");
    expect(JSON.parse(row.raw)).toEqual({ demo: true, dueAt: "2026-08-10T03:00:00.000Z" });
  });

  it("gives every simulated failure its own ID", () => {
    expect(demoFailure("I-ABC123").eventId).not.toBe(demoFailure("I-ABC123").eventId);
  });
});

describe("prepared buyers", () => {
  it("are locked, but the try-it buyer and new subscriptions aren't", () => {
    expect(isPreparedBuyer("I-44AB396PNF68")).toBe(true);
    expect(isPreparedBuyer(TRY_DEMO_BUYER)).toBe(false);
    expect(isPreparedBuyer("I-SOMEONENEW123")).toBe(false);
  });
});

describe("ledgerLabel", () => {
  it("marks simulated rows", () => {
    expect(ledgerLabel({ event_id: "DEMO-1", event_type: FAILED })).toBe("Payment failed (simulated)");
    expect(ledgerLabel({ event_id: "WH-1", event_type: FAILED })).toBe("Payment failed");
  });
});

describe("behindSince", () => {
  const real = { event_id: "WH-1", event_type: FAILED, occurred_at: "2026-10-23T02:00:00Z" };
  const demo = { event_id: "DEMO-1", event_type: FAILED, occurred_at: "2026-10-24T02:00:00Z" };

  it("needs PayPal to show money owed for a real failure", () => {
    expect(behindSince([real], false, true)).toBeNull();
    expect(behindSince([real], true, true)).toEqual(at("2026-10-23T02:00:00Z"));
  });

  it("trusts a simulated failure without PayPal, but only in demo mode", () => {
    expect(behindSince([demo], false, true)).toEqual(at("2026-10-24T02:00:00Z"));
    expect(behindSince([demo], false, false)).toBeNull();
  });

  it("is null with no ledger", () => {
    expect(behindSince(null, true, true)).toBeNull();
  });

  it("dates a simulated miss from the simulation, not an older real failure", () => {
    expect(behindSince([demo, real], false, true)).toEqual(at("2026-10-24T02:00:00Z"));
  });

  it("uses the first of several simulated clicks", () => {
    const later = { ...demo, event_id: "DEMO-2", occurred_at: "2026-10-24T05:00:00Z" };
    expect(behindSince([later, demo], false, true)).toEqual(at("2026-10-24T02:00:00Z"));
  });

  it("is cleared by a real payment that arrives after a simulated miss", () => {
    const sale = { event_id: "WH-2", event_type: "PAYMENT.SALE.COMPLETED", occurred_at: "2026-10-25T02:00:00Z" };
    expect(behindSince([sale, demo], false, true)).toBeNull();
  });

  it("isn't cleared by the plan being suspended after a simulated miss", () => {
    const suspended = { event_id: "WH-3", event_type: "BILLING.SUBSCRIPTION.SUSPENDED", occurred_at: "2026-10-25T02:00:00Z" };
    expect(behindSince([suspended, demo], false, true)).toEqual(at("2026-10-24T02:00:00Z"));
    expect(latestPaymentEvent([suspended, demo])).toBe(demo);
  });

  it("isn't cleared when the plan is resumed, only by a payment", () => {
    const resumed = { event_id: "WH-4", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", occurred_at: "2026-10-25T02:00:00Z" };
    expect(behindSince([resumed, demo], false, true)).toEqual(at("2026-10-24T02:00:00Z"));
  });

  it("uses a backdated due date, which a real charge before the simulation doesn't clear", () => {
    const sale = { event_id: "WH-2", event_type: "PAYMENT.SALE.COMPLETED", occurred_at: "2026-10-23T02:00:00Z" };
    expect(behindSince([{ ...demo, due_at: "2026-08-10T00:00:00Z" }, sale], false, true)).toEqual(at("2026-08-10T00:00:00Z"));
  });
});
