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
          type: 'condition',
          category: 'Web',
          description: 'Conditional branch.',
          icon: '◆',
          ports: {
            inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
            outputs: [
              { id: 'true', type: 'flow', label: 'True', required: true },
              { id: 'false', type: 'flow', label: 'False', required: true },
            ],
          },
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
          builtin: {
            timeout: false,
            continueOnError: true,
          },
          robotFramework: {
            keyword: 'IF',
            library: 'RPAForge.WebUI',
          },
        },
      ],
    });

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      id: 'WebUI.if_else',
      type: 'condition',
      library: 'WebUI',
      category: 'Web',
      robotFramework: {
        keyword: 'IF',
        library: 'RPAForge.WebUI',
      },
      builtin: {
        timeout: false,
        retry: false,
        continueOnError: true,
        nested: false,
      },
    });
    expect(result.activities[0].ports.outputs.map((port) => port.id)).toEqual(['true', 'false']);
  });

  test('creates sensible default param values and display library', () => {
    const activity = normalizeActivitiesResult({
      activities: [
        {
          id: 'BuiltIn.sample',
          name: 'Sample',
          type: 'sync',
          category: 'BuiltIn',
          description: '',
          params: [
            { name: 'message', type: 'string', label: 'Message', description: '', required: true, options: [], default: 'hi' },
            { name: 'enabled', type: 'boolean', label: 'Enabled', description: '', required: false, options: [] },
            { name: 'count', type: 'integer', label: 'Count', description: '', required: false, options: [] },
          ],
          robotFramework: {
            keyword: 'Sample',
            library: 'RPAForge.BuiltIn',
          },
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
