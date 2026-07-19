import { describe, expect, test } from 'vitest';
import {
  deserializeDiagram,
  deserializeProject,
  deserializeProjectManifest,
  serializeDiagram,
  serializeProject,
} from './fileUtils';
import type { ProcessVariable } from '../stores/variableStore';

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
          handle: 'true',
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
      source: 'start-1',
      target: 'node-2',
      handle: 'true',
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

  test('redacts secret values from diagram exports while retaining references', () => {
    const secret = {
      id: 'secret-1',
      projectId: 'project-1',
      name: 'api-token',
      type: 'secret' as const,
      value: 'plaintext-token',
      secretRef: 'secret://vault/api-token',
      scope: 'process' as const,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    } as ProcessVariable & { secretRef: string };

    const json = serializeDiagram([], [], {
      id: 'process-1',
      name: 'Secrets',
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    }, undefined, [secret]);

    expect(json).not.toContain('plaintext-token');
    expect(JSON.parse(json).variables[0]).toMatchObject({
      value: '',
      secretRef: 'secret://vault/api-token',
    });
  });

  test('redacts secret values from project exports', () => {
    const secret = {
      id: 'secret-1',
      projectId: 'project-1',
      name: 'api-token',
      type: 'secret' as const,
      value: 'plaintext-token',
      scope: 'process' as const,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    } satisfies ProcessVariable;

    const json = serializeProject(
      {
        id: 'project-1',
        name: 'Secrets',
        version: '1.0.0',
        main: 'main',
        diagrams: [],
        folders: [],
        settings: {
          defaultTimeout: 30000,
          screenshotOnError: true,
        },
      },
      {},
      { 'project-1': [secret] }
    );

    expect(json).not.toContain('plaintext-token');
    expect(JSON.parse(json).variables['project-1'][0].value).toBe('');
  });

  test('migrates legacy process template shape to the current model', () => {
    const result = deserializeDiagram(JSON.stringify({
      version: '1.0.0',
      templateType: 'process',
      metadata: { id: 'legacy-process', name: 'Legacy Process' },
      diagram: { nodes: [], edges: [] },
    }));

    expect(result.success).toBe(true);
    expect(result.diagram).toMatchObject({
      version: '1.1.0',
      metadata: {
        id: 'legacy-process',
        name: 'Legacy Process',
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:00.000Z',
      },
      nodes: [],
      edges: [],
      variables: [],
    });
  });

  test('migrates legacy project exports and rejects newer versions', () => {
    const legacy = deserializeProject(JSON.stringify({
      version: '1.0.0',
      project: { name: 'Legacy Project', version: '1.0.0', settings: {} },
      diagrams: {
        legacy: {
          metadata: { id: 'legacy', name: 'Legacy', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
          nodes: [],
          edges: [],
        },
      },
    }));

    expect(legacy.success).toBe(true);
    expect(legacy.project?.version).toBe('1.1.0');
    expect(legacy.project?.project.main).toBe('legacy');
    expect(legacy.project?.project.diagrams).toHaveLength(1);

    const future = deserializeProject(JSON.stringify({
      version: '1.2.0',
      project: {},
      diagrams: {},
    }));
    expect(future.success).toBe(false);
    expect(future.error).toContain('Unsupported project file version');
  });

  test('validates project manifests and rejects malformed legacy files', () => {
    const invalid = deserializeProjectManifest(JSON.stringify({
      version: '1.1.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
      project: {},
      diagrams: [],
      folders: [],
    }));
    expect(invalid.success).toBe(false);
    expect(invalid.error).toContain('Invalid project manifest schema');

    const future = deserializeProjectManifest(JSON.stringify({ version: '2.0.0' }));
    expect(future.success).toBe(false);
    expect(future.error).toContain('Unsupported project manifest file version');

    const historical = deserializeProjectManifest(JSON.stringify({
      version: '1.1.0',
      project: {
        id: 'project-1',
        name: 'Historical Folder Project',
        version: '1.0.0',
        settings: {},
      },
      diagrams: [{ path: 'Main.process', type: 'main', name: 'Main Process' }],
      folders: [],
    }));
    expect(historical.success).toBe(true);
    expect(historical.project?.project.main).toBe('migrated-Main Process');
  });
});
