import Anthropic from "@anthropic-ai/sdk";

// The only file that knows which model provider Hulog uses. Returns null when the model didn't finish normally.
export async function complete(system: string, prompt: string): Promise<string | null> {
  // No key means AI is switched off on purpose (the demo runs on templates), not an error to log.
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // Built per call so a bad key throws here, inside the caller's fallback, not at import time.
  // No retries: the template is the fallback, and the page shouldn't wait more than one timeout.
  const client = new Anthropic({ timeout: 15_000, maxRetries: 0 });
  // Haiku: a few sentences from given facts doesn't need a bigger model. It has no server-side
  // fallback, so a refusal returns null below and the template is shown.
  const res = await client.messages.create({
    model: "claude-haiku-5-5",
    // Cost cap: room for brief thinking plus 3 sentences. Hitting it returns null and the template is shown.
    max_tokens: 2048,
    // A few warm sentences from given facts; low effort is plenty.
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason !== "end_turn") return null;
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return text || null;
}
