import { describe, expect, it, vi } from 'vitest';
import {
  buildDiagnosisBundle,
  diagnoseFailure,
  validateDiagnosis,
} from './diagnoseFailure';
import type { AiProvider, AiProviderCredentials } from './providers';
import type {
  AiDiagnoseFailureRequest,
  DiagnosisResult,
} from '../../src/types/ai';

const credentials: AiProviderCredentials = { apiKey: 'test-key' };

const DIAGRAM = {
  nodes: [
    { id: 'start-1', data: { type: 'start' } },
    { id: 'click-download', data: { type: 'activity' } },
  ],
  edges: [],
};

function makeRequest(
  overrides: Partial<AiDiagnoseFailureRequest> = {}
): AiDiagnoseFailureRequest {
  return {
    requestId: 'req-1',
    providerId: 'openai-compatible',
    runRecord: {
      run_id: 'run-123',
      process_name: 'invoice-download',
      status: 'failed',
      steps: [
        {
          activity: 'WebUI.Click Element',
          node_id: 'click-download',
          status: 'failed',
          error: 'Click failed: element not found',
          inputs: { selector: '#download' },
        },
      ],
      error: 'Click failed: element not found',
    },
    diagram: DIAGRAM,
    ...overrides,
  };
}

const VALID_ANSWER = {
  root_cause: 'Download button selector is stale',
  confidence: 'high',
  explanation: 'The element moved.',
  proposals: [
    { type: 'selector_update', node_id: 'click-download', new_selector: '[data-testid=download]' },
  ],
};

function providerReturning(text: string, truncated = false): AiProvider {
  return {
    id: 'openai-compatible',
    generate: vi.fn().mockResolvedValue({
      text,
      truncated,
      tokenUsage: { prompt: 10, completion: 5, total: 15 },
    }),
    test: vi.fn(),
  } as unknown as AiProvider;
}

describe('buildDiagnosisBundle', () => {
  it('trims steps to the tail and includes the diagram', () => {
    const request = makeRequest({
      runRecord: {
        status: 'failed',
        error: 'boom',
        steps: Array.from({ length: 30 }, (_, index) => ({
          activity: `step-${index}`,
        })),
      },
    });
    const bundle = buildDiagnosisBundle(request) as {
      steps: Array<{ activity: string }>;
      diagram: unknown;
      error: string;
    };
    expect(bundle.steps).toHaveLength(15);
    expect(bundle.steps[14].activity).toBe('step-29');
    expect(bundle.diagram).toEqual(DIAGRAM);
    expect(bundle.error).toBe('boom');
  });
});

describe('validateDiagnosis', () => {
  it('accepts a valid answer with known node ids', () => {
    const outcome = validateDiagnosis(
      VALID_ANSWER,
      new Set(['start-1', 'click-download'])
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.diagnosis.proposals).toHaveLength(1);
    }
  });

  it('rejects unknown proposal types', () => {
    const outcome = validateDiagnosis(
      { ...VALID_ANSWER, proposals: [{ type: 'reformat_disk' }] },
      new Set(['n1'])
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errors.join(' ')).toContain('known proposal type');
    }
  });

  it('rejects references to unknown node ids', () => {
    const outcome = validateDiagnosis(
      {
        ...VALID_ANSWER,
        proposals: [
          { type: 'selector_update', node_id: 'ghost', new_selector: '#x' },
        ],
      },
      new Set(['click-download'])
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errors.join(' ')).toContain('unknown node id');
    }
  });

  it('rejects missing required fields', () => {
    const outcome = validateDiagnosis(
      {
        ...VALID_ANSWER,
        proposals: [{ type: 'param_change', node_id: 'click-download' }],
      },
      new Set(['click-download'])
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errors.join(' ')).toContain('"param"');
    }
  });
});

describe('diagnoseFailure', () => {
  it('returns a diagnosis on the first attempt and reports token usage', async () => {
    const provider = providerReturning(JSON.stringify(VALID_ANSWER));
    const result = await diagnoseFailure(provider, credentials, makeRequest());
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.tokenUsage?.total).toBe(15);
    expect(result.diagnosis?.proposals[0].type).toBe('selector_update');
  });

  it('redacts secret-shaped values before the provider call', async () => {
    const generate = vi.fn().mockResolvedValue({
      text: JSON.stringify(VALID_ANSWER),
      truncated: false,
    });
    const provider = { id: 'openai-compatible', generate, test: vi.fn() } as unknown as AiProvider;
    const request = makeRequest({
      runRecord: {
        status: 'failed',
        error: 'auth failed',
        steps: [
          {
            activity: 'HTTP.Request',
            node_id: 'call-api',
            status: 'failed',
            error: '401 unauthorized',
            inputs: { api_key: 'sk-super-secret-value' },
          },
        ],
      },
    });
    const result = await diagnoseFailure(provider, credentials, request);
    expect(result.success).toBe(true);
    const userPrompt = (generate.mock.calls[0] as unknown[])[1] as {
      userPrompt: string;
    };
    expect(userPrompt.userPrompt).not.toContain('sk-super-secret-value');
    expect(userPrompt.userPrompt).toContain('[REDACTED]');
  });

  it('feeds validation errors back and retries', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: 'not json', truncated: false })
      .mockResolvedValueOnce({
        text: JSON.stringify(VALID_ANSWER),
        truncated: false,
      });
    const provider = { id: 'openai-compatible', generate, test: vi.fn() } as unknown as AiProvider;
    const result = await diagnoseFailure(provider, credentials, makeRequest());
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    const secondCall = (generate.mock.calls[1] as unknown[])[1] as {
      userPrompt: string;
    };
    expect(secondCall.userPrompt).toContain('not valid JSON');
  });

  it('survives a rejected diagnosis for unknown node ids and fails with errors', async () => {
    const bad = {
      ...VALID_ANSWER,
      proposals: [
        { type: 'selector_update', node_id: 'ghost', new_selector: '#x' },
      ],
    };
    const provider = providerReturning(JSON.stringify(bad));
    const result = await diagnoseFailure(provider, credentials, makeRequest());
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.errors?.join(' ')).toContain('unknown node id');
  });

  it('returns provider errors verbatim in errors[]', async () => {
    const provider = {
      id: 'openai-compatible',
      generate: vi.fn().mockRejectedValue(new Error('boom from provider')),
      test: vi.fn(),
    } as unknown as AiProvider;
    const result = await diagnoseFailure(provider, credentials, makeRequest());
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('boom from provider');
  });
});
