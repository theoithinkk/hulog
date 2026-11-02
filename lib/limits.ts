// Who's asking, for rate limits. Cloudflare sits in front of Render and sets these two headers itself.
// The start of X-Forwarded-For is whatever the client typed; only its last entry was added by a proxy.
export function clientIp(headers: Headers) {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("true-client-ip") ??
    headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    "unknown"
  );
}

const ASKS_PER_HOUR = 200;
const HOUR_MS = 3_600_000;
let asks = { count: 0, resetAt: 0 };

// A ceiling on model spend across all visitors, whatever happens to the per-IP limit.
// ponytail: in-memory on one instance and reset by a restart; move to the database if this ever scales out.
export function takeAskBudget(now = Date.now()) {
  if (asks.resetAt <= now) asks = { count: 0, resetAt: now + HOUR_MS };
  return ++asks.count <= ASKS_PER_HOUR;
}
