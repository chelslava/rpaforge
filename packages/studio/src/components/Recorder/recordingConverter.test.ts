import { describe, expect, it } from 'vitest';
import { convertRecordingToDiagram } from './recordingConverter';
import type { RecordedAction } from './SelectorInference';
import { validateDiagram } from '@rpaforge/validation';

const action: RecordedAction = {
  id: 'a1',
  type: 'input',
  selector: { type: 'id', value: '#email', reliability: 1 },
  allCandidates: [],
  timestamp: 1,
  value: 'user@example.com',
};

function webAction(index: number, type: RecordedAction['type']): RecordedAction {
  return {
    id: `action-${index}`,
    type,
    selector: { type: 'css', value: `#btn-${index}`, reliability: 0.9 },
    allCandidates: [
      { type: 'css', value: `#btn-${index}`, reliability: 0.9 },
      { type: 'xpath', value: `//*[@id="btn-${index}"]`, reliability: 0.7 },
      { type: 'text', value: `Button ${index}`, reliability: 0.5 },
    ],
    timestamp: 1700000000000 + index,
    source: 'web',
    ...(type === 'input' ? { value: 'hello' } : {}),
  };
}

describe('convertRecordingToDiagram', () => {
  it('wraps recorded actions in a connected start/end sequence', () => {
    const diagram = convertRecordingToDiagram([action]);

    expect(diagram.nodes).toHaveLength(3);
    expect(diagram.edges).toHaveLength(2);
    expect(diagram.nodes[1].data.blockData).toMatchObject({
      activityId: 'WebUI.Input Text',
      params: { selector: '#email', text: 'user@example.com' },
    });
  });

  it('creates a valid empty recording skeleton', () => {
    const diagram = convertRecordingToDiagram([]);
    expect(diagram.nodes.map((node) => node.data.blockData?.type)).toEqual(['start', 'end']);
    expect(diagram.edges[0]).toMatchObject({ source: 'recording-start', target: 'recording-end' });
  });

  it('converts a 5-step web session into a linear diagram (issue #848)', () => {
    const diagram = convertRecordingToDiagram([
      webAction(1, 'click'),
      webAction(2, 'input'),
      webAction(3, 'click'),
      webAction(4, 'select'),
      webAction(5, 'keypress'),
    ]);

    expect(diagram.nodes).toHaveLength(7); // start + 5 + end
    expect(diagram.edges).toHaveLength(6);
    expect(diagram.nodes[0].type).toBe('start');
    expect(diagram.nodes[6].type).toBe('end');
    expect(
      diagram.edges.every(
        (edge, i) => edge.source === diagram.nodes[i].id && edge.target === diagram.nodes[i + 1].id,
      ),
    ).toBe(true);
  });

  it('serializes the smart-selector fallback chain into each node (issue #848)', () => {
    const diagram = convertRecordingToDiagram([webAction(1, 'click')]);

    const blockData = diagram.nodes[1].data.blockData as unknown as Record<string, unknown>;
    const chain = blockData.selectorChain as Array<Record<string, unknown>>;

    expect(chain).toHaveLength(3); // primary + 2 unique fallbacks
    expect(chain[0]).toEqual({ type: 'css', value: '#btn-1', reliability: 0.9 });
    expect(chain.map((candidate) => candidate.value)).toEqual([
      '#btn-1',
      '//*[@id="btn-1"]',
      'Button 1',
    ]);
    expect((blockData.params as Record<string, unknown>).selector).toBe('#btn-1');
  });

  it('passes diagram validation for a 5-step web session (issue #848)', () => {
    const diagram = convertRecordingToDiagram([
      webAction(1, 'click'),
      webAction(2, 'input'),
      webAction(3, 'click'),
      webAction(4, 'select'),
      webAction(5, 'keypress'),
    ]);

    // Semantic validation layer (@rpaforge/validation): no per-node errors.
    const errors = validateDiagram(
      'recording-test',
      diagram.nodes as never,
      [],
      new Map(),
    );

    expect(errors).toEqual([]);
  });
});
describe('convertRecordingToDiagram editing (#869)', () => {
  it('skips excluded (soft-deleted) actions', () => {
    const diagram = convertRecordingToDiagram([
      webAction(1, 'click'),
      { ...webAction(2, 'input'), included: false },
      webAction(3, 'click'),
    ]);
    const activityIds = diagram.nodes.map((n) => n.id).filter((id) => id.includes('action'));
    expect(activityIds).toHaveLength(2);
    // chain remains connected: every node has exactly one incoming edge
    for (const node of diagram.nodes.slice(1)) {
      expect(diagram.edges.some((e) => e.target === node.id)).toBe(true);
    }
  });

  it('converts a contiguous try-catch run into output/error handle topology', () => {
    const diagram = convertRecordingToDiagram([
      webAction(1, 'click'),
      { ...webAction(2, 'click'), wrapIn: 'try-catch' as const },
      { ...webAction(3, 'input'), wrapIn: 'try-catch' as const },
      webAction(4, 'click'),
    ]);
    const tryNode = diagram.nodes.find((n) => n.data.blockData?.type === 'try-catch');
    expect(tryNode).toBeDefined();
    const outEdge = diagram.edges.find((e) => e.source === tryNode!.id && e.sourceHandle === 'output');
    const errorEdge = diagram.edges.find((e) => e.source === tryNode!.id && e.sourceHandle === 'error');
    expect(outEdge).toBeDefined();
    expect(errorEdge).toBeDefined();
    // both handles converge on the same continuation node (merge point)
    const continueEdge = diagram.edges.find(
      (e) => e.source === `${tryNode!.id}-step-2` && !e.sourceHandle,
    );
    expect(continueEdge?.target).toBe(errorEdge?.target);
    // semantic validation stays clean
    expect(validateDiagram('recording-test', diagram.nodes as never, [], new Map())).toEqual([]);
  });

  it('ends the error handle at the end node when the run is last', () => {
    const diagram = convertRecordingToDiagram([
      webAction(1, 'click'),
      { ...webAction(2, 'click'), wrapIn: 'try-catch' as const },
    ]);
    const tryNode = diagram.nodes.find((n) => n.data.blockData?.type === 'try-catch');
    const errorEdge = diagram.edges.find((e) => e.source === tryNode!.id && e.sourceHandle === 'error');
    expect(errorEdge?.target).toBe('recording-end');
  });
});
