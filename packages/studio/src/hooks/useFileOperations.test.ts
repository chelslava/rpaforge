import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { DiagramDocument } from '../stores/diagramStore';
import { useDiagramStore } from '../stores/diagramStore';
import { useFileStore } from '../stores/fileStore';
import { useBlockStore } from '../stores/blockStore';
import { useProcessMetadataStore } from '../stores/processMetadataStore';
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
  });

  test('save exports the whole project when nested diagrams are present', async () => {
    useDiagramStore.getState().createProject('Nested Project');
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
});
