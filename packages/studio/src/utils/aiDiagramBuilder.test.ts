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
});
