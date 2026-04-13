import { describe, expect, test } from 'vitest';
import {
  createActivityBlockData,
  getBlockCategoryKey,
  getParallelPortConfig,
  getSwitchPortConfig,
  getTryCatchPortConfig,
} from './blocks';
import { normalizeActivitiesResult } from './engine';

describe('blocks activity metadata mapping', () => {
  test('maps sdk categories into block config', () => {
    const activity = normalizeActivitiesResult({
      activities: [
        {
          id: 'DesktopUI.try_click',
          name: 'Try Click',
          library: 'DesktopUI',
          type: 'error_handler',
          category: 'Desktop',
          description: 'Click with error branch.',
          tags: ['desktop'],
          timeout_ms: 30000,
          has_retry: false,
          has_continue_on_error: true,
          params: [],
        },
      ],
    }).activities[0];

    expect(getBlockCategoryKey(activity.category)).toBe('desktop-automation');
  });

  test('creates activity block data from sdk defaults', () => {
    const activity = normalizeActivitiesResult({
      activities: [
        {
          id: 'BuiltIn.log',
          name: 'Log',
          library: 'BuiltIn',
          type: 'sync',
          category: 'BuiltIn',
          description: 'Log a message.',
          tags: ['logging'],
          timeout_ms: 30000,
          has_retry: false,
          has_continue_on_error: true,
          params: [
            {
              name: 'message',
              type: 'string',
              label: 'Message',
              description: 'Message body',
              required: true,
              options: [],
              default: 'hello',
            },
          ],
        },
      ],
    }).activities[0];

    const blockData = createActivityBlockData(activity, 'node-1');

    expect(blockData).toMatchObject({
      id: 'node-1',
      type: 'activity',
      activityId: 'BuiltIn.log',
      library: 'BuiltIn',
      params: {
        message: 'hello',
      },
    });
  });

  test('creates dynamic switch outputs from cases', () => {
    const portConfig = getSwitchPortConfig({
      id: 'switch-1',
      type: 'switch',
      name: 'Switch',
      label: 'Switch',
      category: 'flow-control',
      expression: '${status}',
      cases: [
        { id: 'success', value: 'success', label: 'Success' },
        { id: 'failure', value: 'failure', label: 'Failure' },
      ],
    });

    expect(portConfig.inputs).toHaveLength(1);
    expect(portConfig.outputs.map((port) => ({ id: port.id, label: port.label }))).toEqual([
      { id: 'success', label: 'Success' },
      { id: 'failure', label: 'Failure' },
      { id: 'default', label: 'Default' },
    ]);
  });

  test('creates dynamic parallel branch outputs from branch definitions', () => {
    const portConfig = getParallelPortConfig({
      id: 'parallel-1',
      type: 'parallel',
      name: 'Parallel',
      label: 'Parallel',
      category: 'flow-control',
      branches: [
        { id: 'branch-a', name: 'Branch A', activities: [] },
        { id: 'branch-b', name: 'Branch B', activities: [] },
        { id: 'branch-c', name: 'Branch C', activities: [] },
      ],
    });

    expect(portConfig.outputs.map((port) => ({ id: port.id, type: port.type, label: port.label }))).toEqual([
      { id: 'branch-a', type: 'branch', label: 'Branch A' },
      { id: 'branch-b', type: 'branch', label: 'Branch B' },
      { id: 'branch-c', type: 'branch', label: 'Branch C' },
    ]);
  });

  test('creates try/catch output ports from handlers and finally flag', () => {
    const portConfig = getTryCatchPortConfig({
      id: 'try-1',
      type: 'try-catch',
      name: 'Try Catch',
      label: 'Try Catch',
      category: 'error-handling',
      exceptBlocks: [
        { id: 'except-1', exceptionType: 'TimeoutError', variable: 'err', handler: [] },
        { id: 'except-2', exceptionType: 'ValueError', handler: [] },
      ],
      finallyBlock: [],
    });

    expect(portConfig.outputs.map((port) => ({ id: port.id, type: port.type, label: port.label }))).toEqual([
      { id: 'output', type: 'output', label: 'Success' },
      { id: 'except-1', type: 'error', label: 'TimeoutError' },
      { id: 'except-2', type: 'error', label: 'ValueError' },
      { id: 'finally', type: 'output', label: 'Finally' },
    ]);
  });
});
