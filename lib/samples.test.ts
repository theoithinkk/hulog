import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { macedaRights, manilaDate } from "./maceda";
import { getPlan, getSubscription, listTransactions } from "./paypal";
import { isSampleId, sampleEvents, sampleIds, samplePlan, sampleSubscription, sampleTransactions } from "./samples";
import { strands } from "./strip";
import { unpaidSince } from "./webhook";

const now = new Date("2026-11-02T04:00:00Z");

// What the buyer page works out, from the sample's own records.
function rightsOf(id: string) {
  const sub = sampleSubscription(id, now)!;
  const cycles = sub.billing_info!.cycle_executions![0];
  const price = samplePlan(sub.plan_id)!.billing_cycles[0].pricing_scheme.fixed_price;
  const unpaid = unpaidSince(sampleEvents(id, now)!);
  const rights = macedaRights({
    installmentsPaid: cycles.cycles_completed,
    totalPaidCents: cycles.cycles_completed * Math.round(Number(price.value) * 100),
    contractStart: manilaDate(new Date(sub.start_time!)),
    dueDate: manilaDate(unpaid ?? new Date(sub.billing_info!.next_billing_time!)),
  });
  const weave = strands(cycles.total_cycles, cycles.cycles_completed, unpaid ? { graceEnds: rights.graceEnds } : null, now);
  return { rights, unpaid, weave };
}

describe("samples", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("don't exist outside demo mode", () => {
    vi.stubEnv("DEMO_MODE", "false");
    expect(sampleIds()).toEqual([]);
    expect(isSampleId("I-SAMPLEMARIA")).toBe(false);
    expect(sampleSubscription("I-SAMPLEMARIA")).toBeUndefined();
  });

  it("never reach PayPal", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const sub = await getSubscription("I-SAMPLEMARIA");
    expect(sub.subscriber?.name?.given_name).toBe("Maria");
    expect((await getPlan(sub.plan_id)).name).toContain("Cebu Bay");
    expect(await listTransactions(sub.id, new Date(0), new Date())).toHaveLength(8);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cover each stage of a contract", () => {
    const maria = rightsOf("I-SAMPLEMARIA");
    expect(maria.unpaid).toBeNull();
    expect(maria.rights.section).toBe("4");

    const ramon = rightsOf("I-SAMPLERAMON");
    expect(ramon.rights.section).toBe("4");
    expect(ramon.weave[14]).toBe("grace");

    const liza = rightsOf("I-SAMPLELIZA");
    expect(liza.weave[38]).toBe("grace");
    expect(liza.rights).toMatchObject({ section: "3", yearsPaid: 3, graceMonths: 3, refundPercent: 50, refundCents: 41_800_000 });

    expect(rightsOf("I-SAMPLEJUN").weave[9]).toBe("missed");

    const ana = rightsOf("I-SAMPLEANA");
    expect(ana.unpaid).toBeNull();
    expect(ana.rights).toMatchObject({ section: "3", yearsPaid: 7, refundPercent: 60 });

    const carlo = sampleSubscription("I-SAMPLECARLO", now)!;
    expect(carlo.status).toBe("EXPIRED");
    expect(Number(carlo.billing_info!.outstanding_balance!.value)).toBe(0);
  });

  it("keep their records consistent with each other", () => {
    for (const id of sampleIds()) {
      const sub = sampleSubscription(id, now)!;
      const paid = sub.billing_info!.cycle_executions![0].cycles_completed;
      const txns = sampleTransactions(id, now)!;
      const events = sampleEvents(id, now)!;
      expect(txns.filter((t) => t.status === "COMPLETED")).toHaveLength(paid);
      expect(new Set(events.map((e) => e.event_id)).size).toBe(events.length);
      // Newest first, like the real ledger.
      const times = events.map((e) => +new Date(e.occurred_at));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(new Date(sub.billing_info!.last_payment!.time) <= now).toBe(true);
    }
  });
});
