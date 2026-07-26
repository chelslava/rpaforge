import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';
import { useBlockStore } from '../stores/blockStore';
import { useProcessMetadataStore } from '../stores/processMetadataStore';
import { useFileStore } from '../stores/fileStore';
import { useDiagramStore } from '../stores/diagramStore';
import { useVariableStore } from '../stores/variableStore';
import { idb } from '../utils/db';

vi.mock('../stores/blockStore', () => ({
  useBlockStore: vi.fn(),
}));

vi.mock('../stores/processMetadataStore', () => ({
  useProcessMetadataStore: vi.fn(),
}));

vi.mock('../stores/fileStore', () => ({
  useFileStore: vi.fn(),
}));

vi.mock('../stores/diagramStore', () => ({
  useDiagramStore: vi.fn(),
}));

vi.mock('../stores/variableStore', () => ({
  useVariableStore: vi.fn(),
}));

vi.mock('../utils/db', () => ({
  idb: {
    autosave: {
      save: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      clear: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue([]),
    },
  },
}));

interface MockMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface MockNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface MockBlockStore {
  nodes: MockNode[];
  edges: unknown[];
}

interface MockMetadataStore {
  metadata: MockMetadata | null;
}

interface MockFileStore {
  isDirty: boolean;
  markDirty: ReturnType<typeof vi.fn>;
  setLastSaved: ReturnType<typeof vi.fn>;
}

interface MockDiagramStore {
  project: { id: string } | null;
  activeDiagramId: string | null;
  saveDiagramDocument: ReturnType<typeof vi.fn>;
}

interface MockVariableStore {
  variables: Array<{
    id: string;
    projectId: string;
    name: string;
    type: 'secret';
    value: string;
    scope: 'process';
    createdAt: string;
    updatedAt: string;
  }>;
}

const mockBlockStore: MockBlockStore = {
  nodes: [],
  edges: [],
};

const mockMetadataStore: MockMetadataStore = {
  metadata: null,
};

const mockFileStore: MockFileStore = {
  isDirty: false,
  markDirty: vi.fn(),
  setLastSaved: vi.fn(),
};

const mockDiagramStore: MockDiagramStore = {
  project: null,
  activeDiagramId: null,
  saveDiagramDocument: vi.fn(),
};

const mockVariableStore: MockVariableStore = {
  variables: [],
};

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();

    (useBlockStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: typeof mockBlockStore) => unknown) => selector(mockBlockStore)
    );
    (useProcessMetadataStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: typeof mockMetadataStore) => unknown) => selector(mockMetadataStore)
    );
    (useFileStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: typeof mockFileStore) => unknown) => selector(mockFileStore)
    );
    (useDiagramStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: typeof mockDiagramStore) => unknown) => selector(mockDiagramStore)
    );
    (useVariableStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: typeof mockVariableStore) => unknown) => selector(mockVariableStore)
    );
    mockDiagramStore.project = null;
    mockDiagramStore.activeDiagramId = null;
    mockVariableStore.variables = [];

    vi.mocked(idb.autosave.get).mockResolvedValue(undefined);
    vi.mocked(idb.autosave.save).mockResolvedValue(undefined);
    vi.mocked(idb.autosave.clear).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('does not save when no metadata', () => {
    mockMetadataStore.metadata = null;
    mockBlockStore.nodes = [];

    renderHook(() => useAutoSave({ enabled: true, intervalMs: 1000 }));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockFileStore.setLastSaved).not.toHaveBeenCalled();
  });

  test('does not save when no nodes', () => {
    (mockMetadataStore as { metadata: MockMetadata | null }).metadata = {
      id: 'test-id',
      name: 'Test',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    mockBlockStore.nodes = [];

    renderHook(() => useAutoSave({ enabled: true, intervalMs: 1000 }));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockFileStore.setLastSaved).not.toHaveBeenCalled();
  });

  test('saves when dirty and interval elapses', async () => {
    (mockMetadataStore as { metadata: MockMetadata | null }).metadata = {
      id: 'test-id',
      name: 'Test',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    (mockBlockStore as { nodes: MockNode[] }).nodes = [
      { id: 'node-1', type: 'start', position: { x: 0, y: 0 }, data: {} },
    ];
    mockBlockStore.edges = [];
    mockFileStore.isDirty = true;

    renderHook(() => useAutoSave({ enabled: true, intervalMs: 1000 }));

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(mockFileStore.setLastSaved).toHaveBeenCalled();
    expect(mockFileStore.markDirty).toHaveBeenCalledWith(false);
  });

  test('does not save when not dirty', () => {
    (mockMetadataStore as { metadata: MockMetadata | null }).metadata = {
      id: 'test-id',
      name: 'Test',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    (mockBlockStore as { nodes: MockNode[] }).nodes = [
      { id: 'node-1', type: 'start', position: { x: 0, y: 0 }, data: {} },
    ];
    mockFileStore.isDirty = false;

    renderHook(() => useAutoSave({ enabled: true, intervalMs: 1000 }));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockFileStore.setLastSaved).not.toHaveBeenCalled();
  });

  test('forceSave triggers immediate save', async () => {
    (mockMetadataStore as { metadata: MockMetadata | null }).metadata = {
      id: 'test-id',
      name: 'Test',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    (mockBlockStore as { nodes: MockNode[] }).nodes = [
      { id: 'node-1', type: 'start', position: { x: 0, y: 0 }, data: {} },
    ];
    mockBlockStore.edges = [];

    const { result } = renderHook(() =>
      useAutoSave({ enabled: false, intervalMs: 10000 })
    );

    await act(async () => {
      await result.current.forceSave();
    });

    expect(mockFileStore.setLastSaved).toHaveBeenCalled();
  });

  test('autosave persists only redacted secret values', async () => {
    (mockMetadataStore as { metadata: MockMetadata | null }).metadata = {
      id: 'test-id',
      name: 'Secrets',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    (mockBlockStore as { nodes: MockNode[] }).nodes = [
      { id: 'node-1', type: 'start', position: { x: 0, y: 0 }, data: {} },
    ];
    mockBlockStore.edges = [];
    mockFileStore.isDirty = true;
    mockDiagramStore.project = { id: 'project-1' };
    mockDiagramStore.activeDiagramId = 'diagram-1';
    mockVariableStore.variables = [{
      id: 'secret-1',
      projectId: 'project-1',
      name: 'api-token',
      type: 'secret',
      value: 'plaintext-token',
      scope: 'process',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }];

    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    await act(async () => {
      await result.current.forceSave();
    });

    const [, content] = vi.mocked(idb.autosave.save).mock.calls[0];
    expect(content).not.toContain('plaintext-token');
    expect(JSON.parse(content).variables[0].value).toBe('');
  });

  test('clearBackup removes backup from localStorage', () => {
    localStorage.setItem('rpaforge-autosave-backup', 'test-backup');

    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    act(() => {
      result.current.clearBackup();
    });

    expect(localStorage.getItem('rpaforge-autosave-backup')).toBeNull();
  });

  test('hasBackup returns true when backup exists', async () => {
    vi.mocked(idb.autosave.get).mockResolvedValue({
      content: JSON.stringify({ metadata: { id: 'test', name: 'Test' }, nodes: [], edges: [] }),
      hash: 'abc123',
      timestamp: Date.now(),
    });

    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    await act(async () => {
      const has = await result.current.hasBackup();
      expect(has).toBe(true);
    });
  });

  test('hasBackup returns false when no backup', async () => {
    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    await act(async () => {
      const has = await result.current.hasBackup();
      expect(has).toBe(false);
    });
  });

  test('restoreBackup returns parsed backup data', async () => {
    const backupData = {
      metadata: { id: 'test', name: 'Test' },
      nodes: [{ id: 'node-1' }],
      edges: [],
    };
    vi.mocked(idb.autosave.get).mockResolvedValue({
      content: JSON.stringify(backupData),
      hash: 'abc123',
      timestamp: Date.now(),
    });

    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    let restored;
    await act(async () => {
      restored = await result.current.restoreBackup();
    });

    expect(restored).toEqual(backupData);
  });

  test('restoreBackup returns null when no backup', async () => {
    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    let restored;
    await act(async () => {
      restored = await result.current.restoreBackup();
    });

    expect(restored).toBeNull();
  });

  test('surfaces a valid backup after an interrupted session', async () => {
    localStorage.setItem('rpaforge-session-state', 'active');
    vi.mocked(idb.autosave.get).mockResolvedValue({
      content: JSON.stringify({
        metadata: { id: 'test', name: 'Recovered', updatedAt: '2024-01-01T00:00:00.000Z' },
        nodes: [{ id: 'start', data: { blockData: { type: 'start' } } }],
        edges: [],
        variables: [],
      }),
      hash: 'recovery-hash',
      timestamp: Date.now(),
    });

    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.recoveryBackup?.metadata.name).toBe('Recovered');
  });

  test('does not prompt after a clean shutdown marker', async () => {
    localStorage.setItem('rpaforge-session-state', 'clean');
    vi.mocked(idb.autosave.get).mockResolvedValue({
      content: JSON.stringify({
        metadata: { id: 'test', name: 'Recovered' },
        nodes: [{ id: 'start' }],
        edges: [],
      }),
      hash: 'recovery-hash',
      timestamp: Date.now(),
    });

    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.recoveryBackup).toBeNull();
  });

  test('calls onSave callback after successful save', async () => {
    const onSave = vi.fn();
    (mockMetadataStore as { metadata: MockMetadata | null }).metadata = {
      id: 'test-id',
      name: 'Test',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    (mockBlockStore as { nodes: MockNode[] }).nodes = [
      { id: 'node-1', type: 'start', position: { x: 0, y: 0 }, data: {} },
    ];
    mockBlockStore.edges = [];

    const { result } = renderHook(() =>
      useAutoSave({ enabled: false, onSave })
    );

    await act(async () => {
      await result.current.forceSave();
    });

    expect(onSave).toHaveBeenCalled();
  });
});
