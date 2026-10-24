import { NextResponse, type NextRequest } from "next/server";

// Each buyer or pay page view calls PayPal (and maybe the model), so cap views per IP.
// ponytail: in-memory fixed window on one instance, keyed on a spoofable header. It stops naive floods;
// move to the platform's rate limiting (or Redis) if this ever runs on more than one instance.
const LIMIT = 30;
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

export function middleware(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const now = Date.now();
  if (hits.size > 10_000) hits.clear(); // bound memory under a spray of fake IPs
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return NextResponse.next();
  }
  if (++entry.count > LIMIT) {
    return new NextResponse("Too many requests. Please wait a minute and try again.", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) },
    });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/buyer/:path*", "/pay/:path*", "/broker/:path*"] };
