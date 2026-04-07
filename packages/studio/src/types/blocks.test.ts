import { describe, expect, test } from 'vitest';
import {
  createActivityBlockData,
  getActivityPortConfig,
  getBlockCategoryKey,
  getParallelPortConfig,
  getSwitchPortConfig,
  getTryCatchPortConfig,
} from './blocks';
import { normalizeActivitiesResult } from './engine';

describe('blocks activity metadata mapping', () => {
  test('maps sdk categories and typed ports into block config', () => {
    const activity = normalizeActivitiesResult({
      activities: [
        {
          id: 'DesktopUI.try_click',
          name: 'Try Click',
          type: 'error_handler',
          category: 'Desktop',
          description: 'Click with error branch.',
          icon: '🖱',
          ports: {
            inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
            outputs: [
              { id: 'output', type: 'flow', label: 'Done', required: true },
              { id: 'error', type: 'error', label: 'Error', required: true },
              { id: 'branch-1', type: 'flow', label: 'Branch 1', required: true },
            ],
          },
          params: [],
          robotFramework: {
            keyword: 'Try Click',
            library: 'DesktopUI',
          },
        },
      ],
    }).activities[0];

    const portConfig = getActivityPortConfig(activity);

    expect(getBlockCategoryKey(activity.category)).toBe('desktop-automation');
    expect(portConfig.outputs.map((port) => ({ id: port.id, type: port.type }))).toEqual([
      { id: 'output', type: 'output' },
      { id: 'error', type: 'error' },
      { id: 'branch-1', type: 'branch' },
    ]);
  });

  test('creates activity block data from sdk defaults', () => {
    const activity = normalizeActivitiesResult({
      activities: [
        {
          id: 'BuiltIn.log',
          name: 'Log',
          type: 'sync',
          category: 'BuiltIn',
          description: 'Log a message.',
          icon: '📝',
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
          builtin: {
            timeout: false,
            continueOnError: true,
          },
          robotFramework: {
            keyword: 'Log',
            library: 'BuiltIn',
          },
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
      builtin: {
        timeout: false,
        continueOnError: true,
      },
      robotFramework: {
        keyword: 'Log',
        library: 'BuiltIn',
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
      { id: 'error', type: 'error', label: 'Except (2)' },
      { id: 'finally', type: 'output', label: 'Finally' },
    ]);
  });
});
