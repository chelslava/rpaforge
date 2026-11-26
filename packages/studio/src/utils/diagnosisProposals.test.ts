import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { ProcessNodeData } from '../stores/processStore';
import type { Activity } from '@rpaforge/activities';
import { applyProposals } from './diagnosisProposals';

function activityNode(id: string, params: Record<string, unknown>): Node<ProcessNodeData> {
  return {
    id,
    type: 'activity',
    position: { x: 0, y: 0 },
    data: {
      blockData: {
        id,
        type: 'activity',
        name: id,
        label: id,
        category: 'web-automation',
        activityId: id,
        activityType: 'sync',
        library: 'WebUI',
        params,
        paramTypes: Object.fromEntries(
          Object.keys(params).map((key) => [key, 'string'])
        ),
        builtin: { timeout_ms: 30000, has_retry: false, has_continue_on_error: false },
        tags: [],
      },
      description: undefined,
      tags: [],
    },
  };
}

function line(nodes: Node<ProcessNodeData>[]): Edge[] {
  const edges: Edge[] = [];
  for (let index = 0; index < nodes.length - 1; index++) {
    edges.push({
      id: `edge_${nodes[index].id}_output_${nodes[index + 1].id}_input`,
      source: nodes[index].id,
      target: nodes[index + 1].id,
      sourceHandle: 'output',
      targetHandle: 'input',
    });
  }
  return edges;
}

function seed(): { nodes: Node<ProcessNodeData>[]; edges: Edge[] } {
  const nodes = [
    activityNode('start-1', {}),
    activityNode('click-download', { selector: '#download', timeout: '10' }),
    activityNode('save-file', { path: 'out.pdf' }),
  ];
  return { nodes, edges: line(nodes) };
}

const EXAMPLE_ACTIVITY: Activity = {
  id: 'WebUI.Open Browser',
  name: 'Open Browser',
  library: 'WebUI',
  type: 'sync',
  category: 'web-automation',
  description: 'Open a browser',
  tags: [],
  timeout_ms: 30000,
  has_retry: false,
  has_continue_on_error: false,
  params: [
    { name: 'url', type: 'string', label: 'url', description: '', required: true, options: [] },
  ],
  has_output: false,
  output_description: '',
};

describe('applyProposals', () => {
  it('applies a param change to blockData.params', () => {
    const { nodes, edges } = seed();
    const result = applyProposals(nodes, edges, [
      { type: 'param_change', node_id: 'click-download', param: 'timeout', new_value: '30' },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    const target = result.nodes.find((node) => node.id === 'click-download');
    expect((target?.data.blockData as unknown as { params: Record<string, unknown> }).params['timeout']).toBe('30');
    // untouched siblings keep their params
    const other = result.nodes.find((node) => node.id === 'click-download');
    expect((other?.data.blockData as unknown as { params: Record<string, unknown> }).params['selector']).toBe('#download');
  });

  it('skips a param change for an unknown param', () => {
    const { nodes, edges } = seed();
    const result = applyProposals(nodes, edges, [
      { type: 'param_change', node_id: 'click-download', param: 'xpath', new_value: 'x' },
    ]);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0].reason).toContain('xpath');
  });

  it('selector_update writes into the selector-shaped param key', () => {
    const { nodes, edges } = seed();
    const result = applyProposals(nodes, edges, [
      { type: 'selector_update', node_id: 'click-download', new_selector: '[data-testid=download]' },
    ]);
    expect(result.applied).toHaveLength(1);
    const target = result.nodes.find((node) => node.id === 'click-download');
    expect((target?.data.blockData as unknown as { params: Record<string, unknown> }).params['selector']).toBe(
      '[data-testid=download]'
    );
  });

  it('wrap_retry inserts a wrapper and rewires edges around the target', () => {
    const { nodes, edges } = seed();
    const result = applyProposals(nodes, edges, [
      { type: 'wrap_retry', node_id: 'click-download', retry_count: 5, retry_interval_s: 3 },
    ]);
    expect(result.applied).toHaveLength(1);
    const wrapper = result.nodes.find((node) => node.data.blockData?.type === 'retry-scope');
    expect(wrapper).toBeDefined();
    expect((wrapper?.data.blockData as unknown as { retryCount: number }).retryCount).toBe(5);
    expect((wrapper?.data.blockData as unknown as { body: string[] }).body).toEqual(['click-download']);

    const ids = new Set(result.nodes.map((node) => node.id));
    const allEndpointsValid = result.edges.every(
      (edge) => ids.has(edge.source) && ids.has(edge.target)
    );
    expect(allEndpointsValid).toBe(true);
    // start-1 now flows into the wrapper, wrapper into save-file.
    expect(result.edges.some((edge) => edge.source === 'start-1' && edge.target === wrapper!.id)).toBe(true);
    expect(result.edges.some((edge) => edge.source === wrapper!.id && edge.target === 'save-file')).toBe(true);
    // no direct edge bypassing the wrapper
    expect(result.edges.some((edge) => edge.source === 'start-1' && edge.target === 'click-download')).toBe(false);
  });

  it('wrap_trycatch creates a try-catch with an except branch', () => {
    const { nodes, edges } = seed();
    const result = applyProposals(nodes, edges, [
      { type: 'wrap_trycatch', node_id: 'click-download', exception_type: 'ElementNotFound' },
    ]);
    expect(result.applied).toHaveLength(1);
    const wrapper = result.nodes.find((node) => node.data.blockData?.type === 'try-catch');
    const blockData = wrapper?.data.blockData as unknown as {
      tryBlock: string[];
      exceptBlocks: Array<{ exceptionType: string }>;
    };
    expect(blockData.tryBlock).toEqual(['click-download']);
    expect(blockData.exceptBlocks[0].exceptionType).toBe('ElementNotFound');
  });

  it('insert_precondition splices an activity node before the anchor', () => {
    const { nodes, edges } = seed();
    const result = applyProposals(
      nodes,
      edges,
      [
        {
          type: 'insert_precondition',
          after_node_id: 'click-download',
          library: 'WebUI',
          activity: 'Open Browser',
          args: { url: 'https://example.com' },
          label: 'Ensure app is open',
        },
      ],
      { resolveActivity: (library, name) => (library === 'WebUI' && name === 'Open Browser' ? EXAMPLE_ACTIVITY : undefined) }
    );
    expect(result.applied).toHaveLength(1);
    const inserted = result.nodes.find((node) => node.id.startsWith('precondition'));
    expect(inserted).toBeDefined();
    const blockData = inserted?.data.blockData as unknown as {
      params: Record<string, unknown>;
      label: string;
    };
    expect(blockData.params['url']).toBe('https://example.com');
    expect(blockData.label).toBe('Ensure app is open');
    expect(result.edges.some((edge) => edge.source === inserted!.id && edge.target === 'click-download')).toBe(true);
    expect(result.edges.some((edge) => edge.source === 'start-1' && edge.target === inserted!.id)).toBe(true);
  });

  it('skips insert_precondition when the activity is not resolvable', () => {
    const { nodes, edges } = seed();
    const result = applyProposals(
      nodes,
      edges,
      [
        {
          type: 'insert_precondition',
          after_node_id: 'click-download',
          library: 'WebUI',
          activity: 'Ghost Activity',
        },
      ],
      { resolveActivity: () => undefined }
    );
    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0].reason).toContain('not available in the registry');
  });

  it('skips proposals referencing unknown nodes', () => {
    const { nodes, edges } = seed();
    const result = applyProposals(nodes, edges, [
      { type: 'wrap_retry', node_id: 'ghost' },
      { type: 'selector_update', node_id: 'ghost', new_selector: '#x' },
    ]);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
  });

  it('never mutates the input arrays', () => {
    const { nodes, edges } = seed();
    const nodesBefore = JSON.stringify(nodes);
    const edgesBefore = JSON.stringify(edges);
    applyProposals(nodes, edges, [
      { type: 'wrap_retry', node_id: 'click-download' },
      { type: 'param_change', node_id: 'click-download', param: 'timeout', new_value: '99' },
    ]);
    expect(JSON.stringify(nodes)).toBe(nodesBefore);
    expect(JSON.stringify(edges)).toBe(edgesBefore);
  });
});
