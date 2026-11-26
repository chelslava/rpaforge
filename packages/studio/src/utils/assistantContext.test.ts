import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { ProcessNodeData } from '../stores/blockStore';
import { buildAssistantContext } from './assistantContext';

function node(
  id: string,
  blockData: Record<string, unknown> | undefined,
  type = 'activity'
): Node<ProcessNodeData> {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { blockData: blockData as ProcessNodeData['blockData'] } as ProcessNodeData,
  };
}

describe('buildAssistantContext', () => {
  it('summarizes nodes with labels, types and param KEY names only', () => {
    const nodes: Node<ProcessNodeData>[] = [
      node('start-1', { type: 'start', label: 'Start' }, 'start'),
      node(
        'click-download',
        {
          type: 'activity',
          label: 'Click download',
          params: { selector: '#download', timeout: '30' },
        },
      ),
    ];
    const edges: Edge[] = [];
    const context = buildAssistantContext(nodes, edges, 'click-download');
    expect(context.diagramNodes).toHaveLength(2);
    expect(context.diagramNodes[1]).toEqual({
      id: 'click-download',
      label: 'Click download',
      type: 'activity',
      paramKeys: ['selector', 'timeout'],
    });
    expect(context.selectedNodeId).toBe('click-download');
  });

  it('never includes param values', () => {
    const serialized = JSON.stringify(
      buildAssistantContext(
        [
          node('n1', {
            type: 'activity',
            label: 'Call API',
            params: { api_key: 'sk-proj-supersecret123', url: 'https://example.com' },
          }),
        ],
        [],
        null
      )
    );
    expect(serialized).not.toContain('sk-proj-supersecret123');
    expect(serialized).not.toContain('https://example.com');
    expect(serialized).toContain('api_key');
  });

  it('carries the last error when provided', () => {
    const context = buildAssistantContext([], [], null, 'exit code 1');
    expect(context.lastError).toBe('exit code 1');
  });

  it('defaults to null lastError and no selection', () => {
    const context = buildAssistantContext([], [], null);
    expect(context.lastError).toBeNull();
    expect(context.selectedNodeId).toBeNull();
  });
});
