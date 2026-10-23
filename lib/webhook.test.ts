import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleWebhook, toLedgerRow, type PayPalEvent } from "./webhook";
import { verifyWebhook } from "./paypal";
import { insertEvent } from "./db";

vi.mock("./paypal", () => ({ verifyWebhook: vi.fn() }));
vi.mock("./db", () => ({ insertEvent: vi.fn() }));

const sale: PayPalEvent = {
  id: "WH-1",
  event_type: "PAYMENT.SALE.COMPLETED",
  create_time: "2026-10-24T01:00:00Z",
  resource: { billing_agreement_id: "I-ABC123", amount: { total: "15000.00", currency: "PHP" } },
};

describe("toLedgerRow", () => {
  it("takes subscription and amount from a completed sale", () => {
    expect(toLedgerRow(sale)).toMatchObject({
      eventId: "WH-1",
      eventType: "PAYMENT.SALE.COMPLETED",
      subscriptionId: "I-ABC123",
      amount: "15000.00",
      currency: "PHP",
      occurredAt: "2026-10-24T01:00:00Z",
    });
  });

  it("takes the failed amount from a failed subscription payment", () => {
    const row = toLedgerRow({
      ...sale,
      event_type: "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
      resource: {
        id: "I-ABC123",
        billing_info: { last_failed_payment: { amount: { value: "15000.00", currency_code: "PHP" } } },
      },
    });
    expect(row).toMatchObject({ subscriptionId: "I-ABC123", amount: "15000.00", currency: "PHP" });
  });

  it("records status changes without an amount, even after an earlier failure", () => {
    const row = toLedgerRow({
      ...sale,
      event_type: "BILLING.SUBSCRIPTION.SUSPENDED",
      resource: {
        id: "I-ABC123",
        billing_info: { last_failed_payment: { amount: { value: "15000.00", currency_code: "PHP" } } },
      },
    });
    expect(row).toMatchObject({ subscriptionId: "I-ABC123", amount: null, currency: null });
  });

  it("keeps unrelated events with no subscription", () => {
    const row = toLedgerRow({ ...sale, event_type: "CATALOG.PRODUCT.CREATED", resource: { id: "PROD-1" } });
    expect(row.subscriptionId).toBeNull();
  });
});

describe("handleWebhook", () => {
  const headers = new Headers();
  const body = JSON.stringify(sale);

  beforeEach(() => {
    vi.mocked(verifyWebhook).mockReset();
    vi.mocked(insertEvent).mockReset();
  });

  it("stores a verified event and returns 200", async () => {
    vi.mocked(verifyWebhook).mockResolvedValue(true);
    await expect(handleWebhook(headers, body)).resolves.toBe(200);
    expect(verifyWebhook).toHaveBeenCalledWith(headers, body);
    expect(insertEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "WH-1", raw: body }));
  });

  it("rejects an event PayPal won't vouch for, without storing it", async () => {
    vi.mocked(verifyWebhook).mockResolvedValue(false);
    await expect(handleWebhook(headers, body)).resolves.toBe(400);
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "nope"],
    ["JSON that isn't an event", '"x"'],
    ["an event without an id", JSON.stringify({ ...sale, id: undefined })],
  ])("rejects %s before asking PayPal", async (_, bad) => {
    await expect(handleWebhook(headers, bad)).resolves.toBe(400);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });

  it("rejects bodies over 64 KB in bytes, not characters", async () => {
    await expect(handleWebhook(headers, "é".repeat(33 * 1024))).resolves.toBe(413);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });

  it("lets a storage failure surface so PayPal retries", async () => {
    vi.mocked(verifyWebhook).mockResolvedValue(true);
    vi.mocked(insertEvent).mockRejectedValue(new Error("db down"));
    await expect(handleWebhook(headers, body)).rejects.toThrow("db down");
  });
});
