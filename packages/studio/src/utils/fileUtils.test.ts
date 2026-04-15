import { describe, expect, test } from 'vitest';
import {
  deserializeDiagram,
  deserializeProject,
  serializeDiagram,
  serializeProject,
} from './fileUtils';

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

  test('preserves nested-diagram project documents through project serialization', () => {
    const exportedAt = new Date().toISOString();
    const projectJson = serializeProject(
      {
        name: 'Nested Project',
        version: '1.0.0',
        main: 'main-diagram',
        diagrams: [
          {
            id: 'main-diagram',
            name: 'Main Process',
            type: 'main',
            path: 'Main.process',
            createdAt: exportedAt,
            updatedAt: exportedAt,
          },
          {
            id: 'login-flow',
            name: 'Login Flow',
            type: 'sub-diagram',
            path: 'auth/Login-Flow.process',
            inputs: ['username'],
            outputs: ['success'],
            folder: 'auth',
            createdAt: exportedAt,
            updatedAt: exportedAt,
          },
        ],
        folders: ['auth'],
        settings: {
          defaultTimeout: 30000,
          screenshotOnError: true,
        },
      },
      {
        'main-diagram': {
          metadata: {
            id: 'main-diagram',
            name: 'Main Process',
            createdAt: exportedAt,
            updatedAt: exportedAt,
          },
          nodes: [],
          edges: [],
        },
        'login-flow': {
          metadata: {
            id: 'login-flow',
            name: 'Login Flow',
            createdAt: exportedAt,
            updatedAt: exportedAt,
          },
          nodes: [
            {
              id: 'sub-start',
              type: 'start',
              position: { x: 0, y: 0 },
              data: {
                blockData: {
                  id: 'sub-start',
                  type: 'start',
                  name: 'Start',
                  label: 'Start',
                  category: 'flow-control',
                  processName: 'Login Flow',
                },
                description: '',
                tags: [],
              },
            },
          ],
          edges: [],
        },
      }
    );

    const projectResult = deserializeProject(projectJson);

    expect(projectResult.success).toBe(true);
    expect(projectResult.project?.project.diagrams).toHaveLength(2);
    expect(projectResult.project?.diagrams['login-flow'].metadata.name).toBe('Login Flow');
    expect(projectResult.project?.diagrams['login-flow'].nodes).toHaveLength(1);
  });
});
