import Anthropic from "@anthropic-ai/sdk";

export const MODELS = {
  FAST: "claude-haiku-4-5-20251001", // JD analysis, team selection
  SMART: "claude-sonnet-4-6",        // Resume generation (PATH B/C full generation only)
} as const;

export function makeAnthropicClient(apiKey?: string | null) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("No Anthropic API key — set ANTHROPIC_API_KEY or provide x-anthropic-key header");
  return new Anthropic({ apiKey: key });
}
