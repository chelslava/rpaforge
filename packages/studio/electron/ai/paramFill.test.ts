import { describe, expect, it } from 'vitest';
import { buildPrompt } from './paramFill';

describe('AI parameter privacy boundary', () => {
  it('does not place secret-like variable values or defaults in the prompt', () => {
    const prompt = buildPrompt({
      activityId: 'web.login',
      activityName: 'Login',
      activityCategory: 'Web',
      activityParams: [{ name: 'username', type: 'string', required: true, defaultValue: 'Bearer abc.def.ghi' }],
      variables: [
        { name: 'password', type: 'string', value: 'hunter2' },
        { name: 'host', type: 'string', value: 'example.test' },
      ],
      previousActivities: [],
    });

    expect(prompt).not.toContain('hunter2');
    expect(prompt).not.toContain('Bearer abc.def.ghi');
    expect(prompt).toContain('example.test');
  });
});
