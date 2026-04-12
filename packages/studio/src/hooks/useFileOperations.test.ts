import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useDiagramStore } from '../stores/diagramStore';
import { useFileStore } from '../stores/fileStore';
import { useProcessStore } from '../stores/processStore';
import { serializeProject } from '../utils/fileUtils';
import { useFileOperations } from './useFileOperations';

const downloadFileMock = vi.fn();
const readFileAsTextMock = vi.fn<() => Promise<string>>();
const generateFilenameMock = vi.fn((name: string, extension: string) => `${name}.${extension}`);

vi.mock('../utils/fileUtils', async () => {
  const actual = await vi.importActual<typeof import('../utils/fileUtils')>('../utils/fileUtils');
  return {
    ...actual,
    downloadFile: (...args: unknown[]) => downloadFileMock(...args),
    readFileAsText: (...args: unknown[]) => readFileAsTextMock(...args),
    generateFilename: (...args: [string, string]) => generateFilenameMock(...args),
  };
});

describe('useFileOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useDiagramStore.persist.clearStorage();
    useDiagramStore.setState({
      project: null,
      activeDiagramId: null,
      openDiagramIds: [],
      recentDiagrams: [],
      folders: [],
      diagramDocuments: {},
    });

    useProcessStore.persist.clearStorage();
    useProcessStore.getState().clearProcess();

    useFileStore.persist.clearStorage();
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

    useProcessStore.getState().loadProcess(
      subDiagramDocument.metadata,
      subDiagramDocument.nodes,
      subDiagramDocument.edges
    );

    useFileStore.getState().createNewFile('Nested Project');

    const { result } = renderHook(() => useFileOperations());

    await act(async () => {
      await result.current.save();
    });

    expect(downloadFileMock).toHaveBeenCalledWith(
      expect.stringContaining('"diagrams"'),
      'Nested Project.rpaforge-project'
    );
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
          path: 'processes/main.diagram.json',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      settings: {
        defaultTimeout: 30000,
        screenshotOnError: true,
      },
    };

    const exportedDocuments = {
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

    const file = new File(['project'], 'imported.rpaforge-project', {
      type: 'application/json',
    });

    const { result } = renderHook(() => useFileOperations());

    await act(async () => {
      const success = await result.current.open(file);
      expect(success).toBe(true);
    });

    expect(useDiagramStore.getState().project?.name).toBe('Imported Project');
    expect(useDiagramStore.getState().activeDiagramId).toBe('main-diagram');
    expect(useProcessStore.getState().metadata?.id).toBe('main-diagram');
    expect(useFileStore.getState().currentFile?.name).toBe('Imported Project');
  });
});
