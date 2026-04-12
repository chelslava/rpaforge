import { describe, expect, test } from 'vitest';
import type { BlockData } from '../types/blocks';
import { createDefaultBlockData } from '../types/blocks';
import { generateClientRobotCode } from './clientCodegen';

function node(id: string, blockData: BlockData, data: Record<string, unknown> = {}) {
  return {
    id,
    type: blockData.type,
    position: { x: 0, y: 0 },
    data: {
      blockData,
      ...data,
    },
  };
}

describe('clientCodegen', () => {
  test('generates switch branches with default path', () => {
    const code = generateClientRobotCode({
      nodes: [
        node('start', { ...createDefaultBlockData('start', 'start'), processName: 'Switch Test' } as Extract<BlockData, { type: 'start' }>),
        node('switch', {
          ...createDefaultBlockData('switch', 'switch'),
          expression: '${status}',
          cases: [
            { id: 'success', value: 'success', label: 'Success' },
            { id: 'failure', value: 'failure', label: 'Failure' },
          ],
        } as Extract<BlockData, { type: 'switch' }>),
        node('success-node', {
          ...createDefaultBlockData('activity', 'success-node'),
          activityId: 'log',
          library: 'BuiltIn',
          params: { message: 'success path' },
        } as Extract<BlockData, { type: 'activity' }>, { activityValues: { message: 'success path' } }),
        node('failure-node', {
          ...createDefaultBlockData('activity', 'failure-node'),
          activityId: 'log',
          library: 'BuiltIn',
          params: { message: 'failure path' },
        } as Extract<BlockData, { type: 'activity' }>, { activityValues: { message: 'failure path' } }),
        node('default-node', {
          ...createDefaultBlockData('activity', 'default-node'),
          activityId: 'log',
          library: 'BuiltIn',
          params: { message: 'default path' },
        } as Extract<BlockData, { type: 'activity' }>, { activityValues: { message: 'default path' } }),
        node('end', createDefaultBlockData('end', 'end')),
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'switch', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'switch', target: 'success-node', sourceHandle: 'success', targetHandle: 'input' },
        { id: 'e3', source: 'switch', target: 'failure-node', sourceHandle: 'failure', targetHandle: 'input' },
        { id: 'e4', source: 'switch', target: 'default-node', sourceHandle: 'default', targetHandle: 'input' },
        { id: 'e5', source: 'success-node', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e6', source: 'failure-node', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e7', source: 'default-node', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
      ],
    });

    expect(code).toContain("IF    ${status} == 'success'");
    expect(code).toContain("ELSE IF    ${status} == 'failure'");
    expect(code).toContain('ELSE');
    expect(code).toContain('Log    success path');
    expect(code).toContain('Log    failure path');
    expect(code).toContain('Log    default path');
  });

  test('generates try/catch/finally fallback code', () => {
    const code = generateClientRobotCode({
      nodes: [
        node('start', { ...createDefaultBlockData('start', 'start'), processName: 'Try Test' } as Extract<BlockData, { type: 'start' }>),
        node('try', {
          ...createDefaultBlockData('try-catch', 'try'),
          exceptBlocks: [{ id: 'except', exceptionType: 'TimeoutError', variable: 'err', handler: [] }],
          finallyBlock: [],
        } as Extract<BlockData, { type: 'try-catch' }>),
        node('try-node', {
          ...createDefaultBlockData('activity', 'try-node'),
          activityId: 'log',
          library: 'BuiltIn',
          params: { message: 'try path' },
        } as Extract<BlockData, { type: 'activity' }>, { activityValues: { message: 'try path' } }),
        node('error-node', {
          ...createDefaultBlockData('activity', 'error-node'),
          activityId: 'log',
          library: 'BuiltIn',
          params: { message: 'error path' },
        } as Extract<BlockData, { type: 'activity' }>, { activityValues: { message: 'error path' } }),
        node('finally-node', {
          ...createDefaultBlockData('activity', 'finally-node'),
          activityId: 'log',
          library: 'BuiltIn',
          params: { message: 'cleanup path' },
        } as Extract<BlockData, { type: 'activity' }>, { activityValues: { message: 'cleanup path' } }),
        node('end', createDefaultBlockData('end', 'end')),
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'try', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'try', target: 'try-node', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e3', source: 'try', target: 'error-node', sourceHandle: 'error', targetHandle: 'input' },
        { id: 'e4', source: 'try', target: 'finally-node', sourceHandle: 'finally', targetHandle: 'input' },
        { id: 'e5', source: 'try-node', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e6', source: 'error-node', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e7', source: 'finally-node', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
      ],
    });

    expect(code).toContain('TRY');
    expect(code).toContain('EXCEPT    TimeoutError    AS    ${err}');
    expect(code).toContain('FINALLY');
    expect(code).toContain('Log    try path');
    expect(code).toContain('Log    error path');
    expect(code).toContain('Log    cleanup path');
  });

  test('generates while loop with body', () => {
    const code = generateClientRobotCode({
      nodes: [
        node('start', { ...createDefaultBlockData('start', 'start'), processName: 'While Test' } as Extract<BlockData, { type: 'start' }>),
        node('while', {
          ...createDefaultBlockData('while', 'while'),
          condition: '${counter} < 5',
          maxIterations: 50,
        } as Extract<BlockData, { type: 'while' }>),
        node('body', {
          ...createDefaultBlockData('activity', 'body'),
          activityId: 'log',
          library: 'BuiltIn',
          params: { message: 'iteration' },
        } as Extract<BlockData, { type: 'activity' }>, { activityValues: { message: 'iteration' } }),
        node('end', createDefaultBlockData('end', 'end')),
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'while', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'while', target: 'body', sourceHandle: 'body', targetHandle: 'input' },
        { id: 'e3', source: 'while', target: 'end', sourceHandle: 'next', targetHandle: 'input' },
        { id: 'e4', source: 'body', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
      ],
    });

    expect(code).toContain('WHILE    ${counter} < 5    limit=50');
    expect(code).toContain('Log    iteration');
    expect(code).toContain('END');
  });

  test('generates for-each loop with body', () => {
    const code = generateClientRobotCode({
      nodes: [
        node('start', { ...createDefaultBlockData('start', 'start'), processName: 'ForEach Test' } as Extract<BlockData, { type: 'start' }>),
        node('foreach', {
          ...createDefaultBlockData('for-each', 'foreach'),
          itemVariable: '${item}',
          collection: '@{items}',
        } as Extract<BlockData, { type: 'for-each' }>),
        node('body', {
          ...createDefaultBlockData('activity', 'body'),
          activityId: 'log',
          library: 'BuiltIn',
          params: { message: 'item' },
        } as Extract<BlockData, { type: 'activity' }>, { activityValues: { message: '${item}' } }),
        node('end', createDefaultBlockData('end', 'end')),
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'foreach', sourceHandle: 'output', targetHandle: 'input' },
        { id: 'e2', source: 'foreach', target: 'body', sourceHandle: 'body', targetHandle: 'input' },
        { id: 'e3', source: 'foreach', target: 'end', sourceHandle: 'next', targetHandle: 'input' },
        { id: 'e4', source: 'body', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
      ],
    });

    expect(code).toContain('FOR    ${item}    IN    @{items}');
    expect(code).toContain('Log    ${item}');
    expect(code).toContain('END');
  });

  test('generates nested sub-diagram keywords for project payloads', () => {
    const code = generateClientRobotCode({
      metadata: { id: 'main', name: 'Main Process' },
      activeDiagramId: 'main',
      project: {
        name: 'Nested Project',
        version: '1.0.0',
        main: 'main',
        diagrams: [
          {
            id: 'main',
            name: 'Main Process',
            type: 'main',
            path: 'processes/main.diagram.json',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'login',
            name: 'Login Flow',
            type: 'sub-diagram',
            path: 'processes/auth/login.flow.diagram.json',
            inputs: ['username'],
            outputs: ['success'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        settings: {
          defaultTimeout: 30000,
          screenshotOnError: true,
        },
      },
      diagramDocuments: {
        main: {
          metadata: {
            id: 'main',
            name: 'Main Process',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          nodes: [
            node('main-start', { ...createDefaultBlockData('start', 'main-start'), processName: 'Main Process' } as Extract<BlockData, { type: 'start' }>),
            node('call-login', {
              ...createDefaultBlockData('sub-diagram-call', 'call-login'),
              diagramId: 'login',
              diagramName: 'Login Flow',
              parameters: { username: '${user}' },
              returns: { success: '${login_success}' },
            } as Extract<BlockData, { type: 'sub-diagram-call' }>),
            node('main-end', createDefaultBlockData('end', 'main-end')),
          ],
          edges: [
            { id: 'e1', source: 'main-start', target: 'call-login' },
            { id: 'e2', source: 'call-login', target: 'main-end' },
          ],
        },
        login: {
          metadata: {
            id: 'login',
            name: 'Login Flow',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          nodes: [
            node('login-start', { ...createDefaultBlockData('start', 'login-start'), processName: 'Login Flow' } as Extract<BlockData, { type: 'start' }>),
            node('login-activity', {
              ...createDefaultBlockData('activity', 'login-activity'),
              activityId: 'log',
              library: 'BuiltIn',
              params: { message: 'Logging in' },
            } as Extract<BlockData, { type: 'activity' }>, { activityValues: { message: 'Logging in' } }),
            node('login-end', createDefaultBlockData('end', 'login-end')),
          ],
          edges: [
            { id: 'e3', source: 'login-start', target: 'login-activity' },
            { id: 'e4', source: 'login-activity', target: 'login-end' },
          ],
        },
      },
      nodes: [],
      edges: [],
    });

    expect(code).toContain('${login_success}=    Login Flow    ${user}');
    expect(code).toContain('*** Keywords ***');
    expect(code).toContain('Login Flow');
    expect(code).toContain('[Arguments]    ${username}');
    expect(code).toContain('RETURN    ${success}');
  });
});
