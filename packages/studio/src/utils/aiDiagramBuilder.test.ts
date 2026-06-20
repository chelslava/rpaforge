import { describe, expect, test } from 'vitest';
import { buildDiagramFromAiResult } from './aiDiagramBuilder';
import type { Activity } from '../domain/activity';
import type { AiDiagramJson } from '../types/ai';

const CLICK_ACTIVITY: Activity = {
  id: 'web.click',
  name: 'Click',
  library: 'WebUI',
  type: 'sync',
  category: 'Web',
  description: 'Click an element',
  tags: [],
  timeout_ms: 30000,
  has_retry: false,
  has_continue_on_error: false,
  params: [
    { name: 'selector', type: 'string', label: 'Selector', description: '', required: true, options: [] },
  ],
  has_output: false,
  output_description: '',
};

const READ_SHEET_ACTIVITY: Activity = {
  id: 'excel.read_sheet_to_list',
  name: 'Read Sheet To List',
  library: 'Excel',
  type: 'sync',
  category: 'Excel',
  description: 'Read a sheet into a list of dicts',
  tags: [],
  timeout_ms: 30000,
  has_retry: false,
  has_continue_on_error: false,
  params: [
    { name: 'sheet', type: 'string', label: 'Sheet', description: '', required: false, options: [] },
    { name: 'header_row', type: 'integer', label: 'Header Row', description: '', required: false, default: 1, options: [] },
    { name: 'strict', type: 'boolean', label: 'Strict', description: '', required: false, default: false, options: [] },
  ],
  has_output: true,
  output_description: '',
};

describe('buildDiagramFromAiResult', () => {
  test('builds structural blocks with their type-specific fields', () => {
    const diagram: AiDiagramJson = {
      nodes: [
        { id: 'start', blockType: 'start', label: 'Start' },
        { id: 'check', blockType: 'if', label: 'Is valid?', condition: 'order.total > 0' },
        { id: 'end1', blockType: 'end', label: 'Done' },
      ],
      edges: [
        { from: 'start', to: 'check' },
        { from: 'check', to: 'end1', handle: 'true' },
      ],
    };

    const result = buildDiagramFromAiResult(diagram, []);

    expect(result.warnings).toHaveLength(0);
    expect(result.nodes).toHaveLength(3);
    const ifNode = result.nodes.find((n) => n.id === 'check');
    expect(ifNode?.data.blockData).toMatchObject({ type: 'if', condition: 'order.total > 0', label: 'Is valid?' });
    expect(result.edges).toHaveLength(2);
    expect(result.edges[1].sourceHandle).toBe('true');
  });

  test('resolves an activity node against the live registry', () => {
    const diagram: AiDiagramJson = {
      nodes: [{ id: 'a1', blockType: 'activity', activityId: 'web.click', label: 'Click submit' }],
      edges: [],
    };

    const result = buildDiagramFromAiResult(diagram, [CLICK_ACTIVITY]);

    expect(result.warnings).toHaveLength(0);
    expect(result.nodes[0].data.blockData).toMatchObject({
      type: 'activity',
      activityId: 'web.click',
      label: 'Click submit',
    });
  });

  test('falls back to a placeholder with a warning when activityId is no longer in the registry', () => {
    const diagram: AiDiagramJson = {
      nodes: [{ id: 'a1', blockType: 'activity', activityId: 'web.click', label: 'Click submit' }],
      edges: [],
    };

    const result = buildDiagramFromAiResult(diagram, []);

    expect(result.warnings).toHaveLength(1);
    expect(result.nodes[0].data.blockData).toMatchObject({ type: 'activity', label: 'Click submit' });
    expect((result.nodes[0].data.blockData as { activityId?: string }).activityId).toBe('');
  });

  test('maps switch cases and assign/for-each fields', () => {
    const diagram: AiDiagramJson = {
      nodes: [
        {
          id: 'sw',
          blockType: 'switch',
          label: 'Route',
          expression: 'order.status',
          cases: [
            { value: 'paid', label: 'Paid' },
            { value: 'pending', label: 'Pending' },
          ],
        },
        { id: 'assign1', blockType: 'assign', label: 'Set total', variableName: 'total', variableExpression: '0' },
        { id: 'fe1', blockType: 'for-each', label: 'Each item', itemVariable: 'item', collection: 'order.items' },
      ],
      edges: [],
    };

    const result = buildDiagramFromAiResult(diagram, []);

    const switchNode = result.nodes.find((n) => n.id === 'sw');
    expect(switchNode?.data.blockData).toMatchObject({
      type: 'switch',
      expression: 'order.status',
      cases: [
        { id: 'case-1', value: 'paid', label: 'Paid' },
        { id: 'case-2', value: 'pending', label: 'Pending' },
      ],
    });

    const assignNode = result.nodes.find((n) => n.id === 'assign1');
    expect(assignNode?.data.blockData).toMatchObject({
      type: 'assign',
      variableName: 'total',
      expression: '0',
    });

    const forEachNode = result.nodes.find((n) => n.id === 'fe1');
    expect(forEachNode?.data.blockData).toMatchObject({
      type: 'for-each',
      itemVariable: 'item',
      collection: 'order.items',
    });
  });

  test('merges activityParams into blockData.params with type coercion', () => {
    const diagram: AiDiagramJson = {
      nodes: [
        {
          id: 'a1',
          blockType: 'activity',
          activityId: 'excel.read_sheet_to_list',
          label: 'Read sheet',
          activityParams: { sheet: 'Orders', header_row: 2, strict: true },
        },
      ],
      edges: [],
    };

    const result = buildDiagramFromAiResult(diagram, [READ_SHEET_ACTIVITY]);

    expect(result.warnings).toHaveLength(0);
    const blockData = result.nodes[0].data.blockData as { params: Record<string, unknown> };
    expect(blockData.params).toMatchObject({ sheet: 'Orders', header_row: 2, strict: true });
  });

  test('ignores activityParams keys that are not real params on the matched activity', () => {
    const diagram: AiDiagramJson = {
      nodes: [
        {
          id: 'a1',
          blockType: 'activity',
          activityId: 'excel.read_sheet_to_list',
          activityParams: { not_a_real_param: 'x' },
        },
      ],
      edges: [],
    };

    const result = buildDiagramFromAiResult(diagram, [READ_SHEET_ACTIVITY]);

    const blockData = result.nodes[0].data.blockData as { params: Record<string, unknown> };
    expect(blockData.params).not.toHaveProperty('not_a_real_param');
  });

  test('propagates outputVariable onto the node data (not blockData) for activity nodes', () => {
    const diagram: AiDiagramJson = {
      nodes: [
        { id: 'a1', blockType: 'activity', activityId: 'excel.read_sheet_to_list', outputVariable: 'orders' },
      ],
      edges: [],
    };

    const result = buildDiagramFromAiResult(diagram, [READ_SHEET_ACTIVITY]);

    expect(result.nodes[0].data.outputVariable).toBe('orders');
    expect(result.nodes[0].data.blockData).not.toHaveProperty('outputVariable');
  });

  test('collects distinct variable names from assign, for-each, and activity outputVariable', () => {
    const diagram: AiDiagramJson = {
      nodes: [
        { id: 'a1', blockType: 'activity', activityId: 'excel.read_sheet_to_list', outputVariable: 'orders' },
        { id: 'fe1', blockType: 'for-each', itemVariable: 'order', collection: 'orders' },
        { id: 'as1', blockType: 'assign', variableName: 'counter', variableExpression: '0' },
        { id: 'as2', blockType: 'assign', variableName: 'counter', variableExpression: 'counter + 1' },
      ],
      edges: [],
    };

    const result = buildDiagramFromAiResult(diagram, [READ_SHEET_ACTIVITY]);

    expect(result.variableNames.sort()).toEqual(['counter', 'order', 'orders']);
  });
});
