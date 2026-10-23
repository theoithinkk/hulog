import Anthropic from "@anthropic-ai/sdk";

// The only file that knows which model provider Hulog uses. Returns null when the model didn't finish normally.
export async function complete(system: string, prompt: string): Promise<string | null> {
  // Built per call so a missing key throws here, inside the caller's fallback, not at import time.
  // No retries: the template is the fallback, and the page shouldn't wait more than one timeout.
  const client = new Anthropic({ timeout: 15_000, maxRetries: 0 });
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    // Cost cap: room for brief thinking plus 3 sentences. Hitting it returns null and the template is shown.
    max_tokens: 2048,
    // A safety decline is re-run on Anthropic's recommended fallback model instead of failing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // A few warm sentences from given facts; low effort is plenty.
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason !== "end_turn") return null;
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return text || null;
}
