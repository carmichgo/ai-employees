/**
 * Token usage tracking — records every LLM API call for cost analysis.
 *
 * Used by both the API server and the worker process. Fire-and-forget:
 * errors are logged but never thrown so callers don't need try/catch.
 */

import { db } from "./client.js";
import { tokenUsageLogs } from "./schema/usage-records.js";

/** Model pricing per million tokens (USD). */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-opus-4-6":            { input: 15,   output: 75 },
  "anthropic/claude-sonnet-4-5-20250929": { input: 3,    output: 15 },
  "anthropic/claude-haiku-4-5-20251001":  { input: 0.80, output: 4 },
};

const DEFAULT_PRICING = { input: 3, output: 15 };

function estimateCost(model: string, tokensInput: number, tokensOutput: number): number {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  return (tokensInput * pricing.input + tokensOutput * pricing.output) / 1_000_000;
}

export interface TokenUsageParams {
  companyId: string;
  employeeId: string;
  source: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
}

/** Record a single LLM API call's token usage. Fire-and-forget. */
export async function recordTokenUsage(params: TokenUsageParams): Promise<void> {
  try {
    const cost = estimateCost(params.model, params.tokensInput, params.tokensOutput);
    await db.insert(tokenUsageLogs).values({
      companyId: params.companyId,
      employeeId: params.employeeId,
      source: params.source,
      model: params.model,
      tokensInput: params.tokensInput,
      tokensOutput: params.tokensOutput,
      estimatedCostUsd: cost.toFixed(6),
    });
  } catch (err) {
    console.error("[usage] Failed to record token usage:", err);
  }
}

/** Extract token counts from an OpenAI-compatible chat completion response. */
export function extractUsage(data: unknown): { tokensInput: number; tokensOutput: number } | null {
  const obj = data as Record<string, unknown> | null | undefined;
  if (!obj) return null;
  const usage = (obj.usage ?? obj) as Record<string, unknown> | undefined;
  if (!usage) return null;
  const tokensInput = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const tokensOutput = typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
  if (tokensInput === 0 && tokensOutput === 0) return null;
  return { tokensInput, tokensOutput };
}
