import { describe, expect, test } from 'vitest';
import {
  createActivityParamValues,
  getActivityDisplayLibrary,
  normalizeActivitiesResult,
} from './engine';

describe('engine activity contract', () => {
  test('normalizes bridge payload into canonical activity contract', () => {
    const result = normalizeActivitiesResult({
      activities: [
        {
          id: 'WebUI.if_else',
          name: 'If Else',
          library: 'WebUI',
          type: 'condition',
          category: 'Web',
          description: 'Conditional branch.',
          tags: ['web', 'condition'],
          timeout_ms: 30000,
          has_retry: false,
          has_continue_on_error: true,
          params: [
            {
              name: 'condition',
              type: 'expression',
              label: 'Condition',
              description: 'Branch expression',
              required: true,
              options: [],
            },
          ],
        },
      ],
    });

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      id: 'WebUI.if_else',
      type: 'condition',
      library: 'WebUI',
      category: 'Web',
      timeout_ms: 30000,
      has_retry: false,
      has_continue_on_error: true,
    });
  });

  test('creates sensible default param values and display library', () => {
    const activity = normalizeActivitiesResult({
      activities: [
        {
          id: 'BuiltIn.sample',
          name: 'Sample',
          library: 'BuiltIn',
          type: 'sync',
          category: 'BuiltIn',
          description: '',
          tags: [],
          timeout_ms: 30000,
          has_retry: false,
          has_continue_on_error: false,
          params: [
            { name: 'message', type: 'string', label: 'Message', description: '', required: true, options: [], default: 'hi' },
            { name: 'enabled', type: 'boolean', label: 'Enabled', description: '', required: false, options: [] },
            { name: 'count', type: 'integer', label: 'Count', description: '', required: false, options: [] },
          ],
        },
      ],
    }).activities[0];

    expect(createActivityParamValues(activity)).toEqual({
      message: 'hi',
      enabled: false,
      count: 0,
    });
    expect(getActivityDisplayLibrary(activity)).toBe('BuiltIn');
  });
});
