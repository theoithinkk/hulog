import { describe, expect, it } from "vitest";
import { behindSince, demoFailure, isDemoEvent, ledgerLabel } from "./demo";

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

  it("gives every simulated failure its own ID", () => {
    expect(demoFailure("I-ABC123").eventId).not.toBe(demoFailure("I-ABC123").eventId);
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
});
