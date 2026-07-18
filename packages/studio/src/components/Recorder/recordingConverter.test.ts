import { describe, expect, it } from 'vitest';
import { convertRecordingToDiagram } from './recordingConverter';
import type { RecordedAction } from './SelectorInference';

const action: RecordedAction = {
  id: 'a1',
  type: 'input',
  selector: { type: 'id', value: '#email', reliability: 1 },
  allCandidates: [],
  timestamp: 1,
  value: 'user@example.com',
};

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
});
