import { describe, expect, it } from 'vitest';
import { estimateTokenCost } from './tokenCost';

describe('estimateTokenCost', () => {
  it('uses model-specific pricing when available', () => {
    expect(estimateTokenCost('openai-compatible', 'gpt-4o-mini', { prompt: 1000, completion: 500, total: 1500 })).toBe(0.00045);
  });

  it('reports zero for local Ollama models', () => {
    expect(estimateTokenCost('ollama', 'llama3', { prompt: 1000, completion: 500, total: 1500 })).toBe(0);
  });
});
