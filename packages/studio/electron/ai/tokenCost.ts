import type { AiProviderId, TokenUsage } from '../../src/types/ai';

interface TokenPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const DEFAULT_PRICING: Record<AiProviderId, TokenPricing> = {
  'openai-compatible': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  anthropic: { inputPerMillion: 3, outputPerMillion: 15 },
  ollama: { inputPerMillion: 0, outputPerMillion: 0 },
  groq: { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  gemini: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  openrouter: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  mistral: { inputPerMillion: 0.1, outputPerMillion: 0.3 },
  'nvidia-nim': { inputPerMillion: 0.8, outputPerMillion: 0.8 },
};

function pricingFor(provider: AiProviderId, model?: string): TokenPricing {
  const normalized = model?.toLowerCase() ?? '';
  if (normalized.includes('gpt-4o-mini')) return { inputPerMillion: 0.15, outputPerMillion: 0.6 };
  if (normalized.includes('gpt-4o')) return { inputPerMillion: 2.5, outputPerMillion: 10 };
  if (normalized.includes('claude-3-5') || normalized.includes('claude-sonnet')) return { inputPerMillion: 3, outputPerMillion: 15 };
  return DEFAULT_PRICING[provider];
}

/** Return a deliberately approximate USD estimate; providers do not expose billing data. */
export function estimateTokenCost(provider: AiProviderId, model: string | undefined, usage: TokenUsage): number {
  const pricing = pricingFor(provider, model);
  const cost = (usage.prompt * pricing.inputPerMillion + usage.completion * pricing.outputPerMillion) / 1_000_000;
  return Number(cost.toFixed(6));
}
