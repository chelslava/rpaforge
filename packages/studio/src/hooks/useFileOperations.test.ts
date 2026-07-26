import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { DiagramDocument } from '../stores/diagramStore';
import { useDiagramStore } from '../stores/diagramStore';
import { useFileStore } from '../stores/fileStore';
import { useBlockStore } from '../stores/blockStore';
import { useProcessMetadataStore } from '../stores/processMetadataStore';
import { useVariableStore } from '../stores/variableStore';
import { useProjectFsStore } from '../stores/projectFsStore';
import { serializeProject } from '../utils/fileUtils';
import { useFileOperations } from './useFileOperations';

const downloadFileMock = vi.fn();
const readFileAsTextMock = vi.fn();
const generateFilenameMock = vi.fn((name: string, extension: string) => `${name}.${extension}`);

vi.mock('../utils/fileUtils', async () => {
  const actual = await vi.importActual<typeof import('../utils/fileUtils')>('../utils/fileUtils');
  return {
    ...actual,
    downloadFile: (...args: unknown[]) => downloadFileMock(...args),
    readFileAsText: (file: File) => readFileAsTextMock(file) as Promise<string>,
    generateFilename: (...args: [string, string]) => generateFilenameMock(...args),
  };
});

describe('useFileOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useDiagramStore.setState({
      project: null,
      activeDiagramId: null,
      openDiagramIds: [],
      recentDiagrams: [],
      folders: [],
      diagramDocuments: {},
    });

    useBlockStore.setState({
      nodes: [],
      edges: [],
    });

    useProcessMetadataStore.setState({
      mode: 'standalone',
      orchestratorUrl: null,
      isConnected: false,
      metadata: null,
      validationMessage: null,
    });

    useFileStore.setState({
      currentFile: null,
      recentFiles: [],
      isDirty: false,
      lastSaved: null,
    });

    useVariableStore.setState({ variables: [] });
    useProjectFsStore.setState({
      projectPath: null,
      writeFile: async () => undefined,
    });
  });

  test('save exports the whole project when nested diagrams are present', async () => {
    useDiagramStore.getState().createProject('Nested Project');
    const projectId = useDiagramStore.getState().project?.id;
    if (!projectId) {
      throw new Error('Expected project to be created');
    }
    useVariableStore.getState().addVariable({
      name: 'api-token',
      type: 'secret',
      value: 'plaintext-token',
      scope: 'process',
    }, projectId);
    const subDiagram = useDiagramStore.getState().addDiagram({
      name: 'Login Flow',
      type: 'sub-diagram',
      path: 'processes/auth/login.flow.diagram.json',
      folder: 'auth',
    });
    useDiagramStore.getState().openDiagram(subDiagram.id);

    const subDiagramDocument = useDiagramStore
      .getState()
      .getDiagramDocument(subDiagram.id);
    if (!subDiagramDocument) {
      throw new Error('Expected sub-diagram document to be created');
    }

    useBlockStore.getState().setNodes(subDiagramDocument.nodes);
    useBlockStore.getState().setEdges(subDiagramDocument.edges);
    useProcessMetadataStore.getState().setMetadata(subDiagramDocument.metadata);

    useFileStore.getState().createNewFile('Nested Project');

    const { result } = renderHook(() => useFileOperations());

    await act(async () => {
      await result.current.save();
    });

    const exportedJson = downloadFileMock.mock.calls[0][0] as string;
    const exportedData = JSON.parse(exportedJson);
    expect(exportedData.project).toBeDefined();
    expect(exportedData.project.diagrams).toHaveLength(2);
    expect(exportedData.diagrams).toBeDefined();
    expect(exportedJson).not.toContain('plaintext-token');
    expect(Object.values(exportedData.variables as Record<string, Array<{ name: string; value: string }>>).some((vars) => vars.some(
      (variable: { name: string; value: string }) => variable.name === 'api-token' && variable.value === ''
    ))).toBe(true);
  });

  test('save to a project folder redacts secret variables in every persisted file', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const timestamp = '2024-01-01T00:00:00.000Z';
    const metadata = {
      id: 'main-diagram',
      name: 'Main Process',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const diagram = {
      id: 'main-diagram',
      name: 'Main Process',
      type: 'main' as const,
      path: 'Main.process',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const secret = {
      id: 'secret-1',
      projectId: 'project-1',
      name: 'api-token',
      type: 'secret' as const,
      value: 'plaintext-token',
      scope: 'process' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    useDiagramStore.setState({
      project: {
        id: 'project-1',
        name: 'Secrets',
        version: '1.0.0',
        main: 'main-diagram',
        diagrams: [diagram],
        folders: [],
        settings: { defaultTimeout: 30000, screenshotOnError: true },
      },
      activeDiagramId: 'main-diagram',
      diagramDocuments: {
        'main-diagram': { metadata, nodes: [], edges: [] },
      },
    });
    useProcessMetadataStore.setState({ metadata });
    useVariableStore.setState({ variables: [secret] });
    useProjectFsStore.setState({ projectPath: 'project-folder', writeFile });

    const { result } = renderHook(() => useFileOperations());

    await act(async () => {
      await result.current.save();
    });

    expect(writeFile).toHaveBeenCalled();
    for (const [, content] of writeFile.mock.calls) {
      expect(content).not.toContain('plaintext-token');
    }
    const projectContent = JSON.parse(writeFile.mock.calls[0][1]);
    expect(projectContent.variables['main-diagram'][0].value).toBe('');
  });

  test('open loads a project file and restores its main diagram', async () => {
    const exportedProject = {
      name: 'Imported Project',
      version: '1.0.0',
      main: 'main-diagram',
      diagrams: [
        {
          id: 'main-diagram',
          name: 'Main Process',
          type: 'main' as const,
          path: 'Main.process',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      folders: [],
      settings: {
        defaultTimeout: 30000,
        screenshotOnError: true,
      },
    };

    const exportedDocuments: Record<string, DiagramDocument> = {
      'main-diagram': {
        metadata: {
          id: 'main-diagram',
          name: 'Main Process',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        nodes: [
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
                processName: 'Main Process',
              },
              description: '',
              tags: [],
            },
          },
        ],
        edges: [],
      },
    };

    readFileAsTextMock.mockResolvedValue(
      serializeProject(exportedProject, exportedDocuments)
    );

    const file = new File(['project'], 'imported.rpaforge', {
      type: 'application/json',
    });

    const { result } = renderHook(() => useFileOperations());

    await act(async () => {
      const success = await result.current.open(file);
      expect(success).toBe(true);
    });

    expect(useDiagramStore.getState().project?.name).toBe('Imported Project');
    expect(useDiagramStore.getState().activeDiagramId).toBe('main-diagram');
    expect(useProcessMetadataStore.getState().metadata?.id).toBe('main-diagram');
    expect(useFileStore.getState().currentFile?.name).toBe('Imported Project');
  });

  test('applyAiDiagram registers new variable names and skips ones that already exist', async () => {
    useProcessMetadataStore.setState({
      mode: 'standalone',
      orchestratorUrl: null,
      isConnected: false,
      metadata: { id: 'proc-1', name: 'Test Process', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      validationMessage: null,
    });
    useVariableStore.getState().addVariable({ name: 'counter', type: 'any', value: '0', scope: 'process' }, '');

    const { result } = renderHook(() => useFileOperations());

    act(() => {
      const success = result.current.applyAiDiagram([], [], ['counter', 'orders']);
      expect(success).toBe(true);
    });

    const names = useVariableStore.getState().variables.map((v) => v.name).sort();
    expect(names).toEqual(['counter', 'orders']);
  });

  test('applyAiDiagram fails without an active process and does not create variables', () => {
    const { result } = renderHook(() => useFileOperations());

    act(() => {
      const success = result.current.applyAiDiagram([], [], ['orders']);
      expect(success).toBe(false);
    });

    expect(useVariableStore.getState().variables).toHaveLength(0);
  });
});
