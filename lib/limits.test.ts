import { describe, expect, it } from "vitest";
import { clientIp, takeAskBudget } from "./limits";

describe("clientIp", () => {
  it("trusts Cloudflare's header over anything the client can set", () => {
    const h = new Headers({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.1" });
    expect(clientIp(h)).toBe("198.51.100.7");
  });

  it("falls back to the proxy's header", () => {
    expect(clientIp(new Headers({ "true-client-ip": "198.51.100.8", "x-forwarded-for": "203.0.113.1" }))).toBe("198.51.100.8");
  });

  it("ignores the client-supplied start of X-Forwarded-For", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.1, 198.51.100.9" }))).toBe("198.51.100.9");
  });

  it("shares one bucket when nothing identifies the client", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("takeAskBudget", () => {
  const start = 1_000_000_000_000;

  it("stops at the hourly ceiling, then opens again", () => {
    const results = Array.from({ length: 201 }, () => takeAskBudget(start));
    expect(results.slice(0, 200).every(Boolean)).toBe(true);
    expect(results[200]).toBe(false);
    expect(takeAskBudget(start + 3_599_999)).toBe(false);
    expect(takeAskBudget(start + 3_600_000)).toBe(true);
  });
});
