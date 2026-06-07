// Pricing as of 2025 — per million tokens
const CLAUDE_PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.80,  output: 4.00,  cacheRead: 0.08 },
  "claude-sonnet-4-6":         { input: 3.00,  output: 15.00, cacheRead: 0.30 },
};

export const TAVILY_SEARCH_COST = 0.005; // per basic search call
export const VOYAGE_COST_PER_M_TOKENS = 0.02;

export function calcClaudeCost(
  model: string,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number }
): number {
  const p = CLAUDE_PRICING[model];
  if (!p) {
    console.warn("[cost] unknown model:", model, "— cost reported as $0. Update CLAUDE_PRICING.");
    return 0;
  }
  return (
    (usage.input_tokens / 1_000_000) * p.input +
    (usage.output_tokens / 1_000_000) * p.output +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * p.cacheRead
  );
}

export function calcVoyageCost(charLength: number): number {
  const tokens = Math.ceil(charLength / 4);
  return (tokens / 1_000_000) * VOYAGE_COST_PER_M_TOKENS;
}
