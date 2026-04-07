import { describe, expect, test } from 'vitest';
import { deserializeDiagram, serializeDiagram } from './fileUtils';

describe('fileUtils diagram round-trip', () => {
  test('preserves typed edge semantics through serialize and deserialize', () => {
    const json = serializeDiagram(
      [
        {
          id: 'start-1',
          type: 'start',
          position: { x: 0, y: 0 },
          data: {
            blockData: {
              id: 'start-1',
              type: 'start',
              name: 'Start',
              label: 'Start',
              category: 'flow-control',
              processName: 'Main',
            },
            description: '',
            tags: [],
          },
        },
      ],
      [
        {
          id: 'edge-1',
          source: 'start-1',
          target: 'node-2',
          sourceHandle: 'true',
          targetHandle: 'input',
          type: 'custom',
          data: { type: 'true', animated: false },
          style: { stroke: '#22C55E', strokeWidth: 2, strokeDasharray: '5,5' },
        },
      ],
      {
        id: 'process-1',
        name: 'Roundtrip',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );

    const result = deserializeDiagram(json);

    expect(result.success).toBe(true);
    expect(result.diagram?.edges[0]).toMatchObject({
      id: 'edge-1',
      sourceHandle: 'true',
      targetHandle: 'input',
      type: 'custom',
      data: { type: 'true', animated: false },
      style: { stroke: '#22C55E', strokeWidth: 2, strokeDasharray: '5,5' },
    });
  });
});
