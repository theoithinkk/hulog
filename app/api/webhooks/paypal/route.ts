import { handleWebhook } from "@/lib/webhook";

export async function POST(req: Request) {
  // Refuse declared-oversized bodies before buffering them; handleWebhook re-checks the real size.
  // ponytail: chunked bodies are still buffered, stream with a byte counter if that's ever abused.
  if (Number(req.headers.get("content-length")) > 64 * 1024) return new Response(null, { status: 413 });
  const status = await handleWebhook(req.headers, await req.text());
  return new Response(null, { status });
}
