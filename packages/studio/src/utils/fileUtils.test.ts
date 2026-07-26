import { describe, expect, test } from 'vitest';
import {
  CURRENT_FILE_FORMAT_VERSION,
  deserializeDiagram,
  deserializeProjectManifest,
  deserializeProject,
  serializeDiagram,
  serializeProjectManifest,
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

  test('migrates the supported legacy nested process shape deterministically', () => {
    const legacyProcess = {
      version: '1.0.0',
      metadata: {
        id: 'legacy-process',
        name: 'Legacy Process',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      diagram: {
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            position: { x: 0, y: 0 },
            data: { blockData: { type: 'start' } },
          },
        ],
        edges: [],
      },
    };

    const result = deserializeDiagram(JSON.stringify(legacyProcess));

    expect(result).toMatchObject({ success: true });
    expect(result.diagram?.version).toBe(CURRENT_FILE_FORMAT_VERSION);
    expect(result.diagram?.nodes).toHaveLength(1);
    expect(result.diagram?.variables).toEqual([]);
  });

  test('rejects malformed and future process versions before returning data', () => {
    expect(deserializeDiagram(JSON.stringify({ version: '1.1.0', metadata: {}, nodes: [] }))).toMatchObject({
      success: false,
      error: 'Invalid process file format',
    });

    expect(deserializeDiagram(JSON.stringify({ version: '9.0.0' }))).toMatchObject({
      success: false,
      error: 'Unsupported process file version: 9.0.0',
    });
  });

  test('migrates a legacy project and canonical folder manifest', () => {
    const legacyProject = {
      version: '1.0.0',
      project: {
        name: 'Legacy Project',
        version: '1.0.0',
        main: 'main-diagram',
        diagrams: [],
        folders: [],
        settings: { defaultTimeout: 30000, screenshotOnError: true },
      },
      diagrams: {},
    };
    const projectResult = deserializeProject(JSON.stringify(legacyProject));

    expect(projectResult.success).toBe(true);
    expect(projectResult.project?.version).toBe(CURRENT_FILE_FORMAT_VERSION);
    expect(projectResult.project?.variables).toEqual({});

    const manifestJson = serializeProjectManifest({
      id: 'project-1',
      name: 'Folder Project',
      version: '1.0.0',
      main: 'main-diagram',
      diagrams: [
        {
          id: 'main-diagram',
          name: 'Main Process',
          type: 'main',
          path: 'Main.process',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      folders: [],
      settings: { defaultTimeout: 30000, screenshotOnError: true },
    });
    const manifestResult = deserializeProjectManifest(manifestJson);

    expect(manifestResult.success).toBe(true);
    expect(manifestResult.manifest?.version).toBe(CURRENT_FILE_FORMAT_VERSION);
    expect(manifestResult.manifest?.diagrams[0].path).toBe('Main.process');
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
});
