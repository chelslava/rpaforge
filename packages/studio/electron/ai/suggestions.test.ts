import { describe, expect, it, vi } from 'vitest';
import { getActivitySuggestions } from './suggestions';

describe('AI suggestion privacy boundary', () => {
  it('redacts sensitive variable names before provider calls', async () => {
    const provider = {
      generate: vi.fn().mockResolvedValue({
        text: JSON.stringify({ suggestions: [{ activityId: 'next', label: 'Next', reason: 'Continue' }] }),
      }),
    };
    const context = {
      selectedActivityId: 'current',
      selectedActivityCategory: 'Web',
      processActivities: [{ id: 'next', name: 'Next', category: 'Web' }],
      variables: [{ name: 'password', type: 'string' }],
    };

    await getActivitySuggestions(provider as never, { apiKey: 'test' }, context);

    const options = provider.generate.mock.calls[0][1];
    expect(JSON.stringify(options)).not.toContain('password');
    expect(JSON.stringify(options)).toContain('[REDACTED]');
  });
});
