import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';
import { useBlockStore } from '../stores/blockStore';
import { useProcessMetadataStore } from '../stores/processMetadataStore';
import { useFileStore } from '../stores/fileStore';

vi.mock('../stores/blockStore', () => ({
  useBlockStore: vi.fn(),
}));

vi.mock('../stores/processMetadataStore', () => ({
  useProcessMetadataStore: vi.fn(),
}));

vi.mock('../stores/fileStore', () => ({
  useFileStore: vi.fn(),
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

  test('saves when dirty and interval elapses', () => {
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

    act(() => {
      vi.advanceTimersByTime(1500);
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

  test('forceSave triggers immediate save', () => {
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
      useAutoSave({ enabled: true, intervalMs: 10000 })
    );

    act(() => {
      result.current.forceSave();
    });

    expect(mockFileStore.setLastSaved).toHaveBeenCalled();
  });

  test('clearBackup removes backup from localStorage', () => {
    localStorage.setItem('rpaforge-autosave-backup', 'test-backup');

    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    act(() => {
      result.current.clearBackup();
    });

    expect(localStorage.getItem('rpaforge-autosave-backup')).toBeNull();
  });

  test('hasBackup returns true when backup exists', () => {
    localStorage.setItem('rpaforge-autosave-backup', 'test-backup');

    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    expect(result.current.hasBackup()).toBe(true);
  });

  test('hasBackup returns false when no backup', () => {
    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    expect(result.current.hasBackup()).toBe(false);
  });

  test('restoreBackup returns parsed backup data', () => {
    const backupData = {
      metadata: { id: 'test', name: 'Test' },
      nodes: [{ id: 'node-1' }],
      edges: [],
    };
    localStorage.setItem('rpaforge-autosave-backup', JSON.stringify(backupData));

    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    let restored;
    act(() => {
      restored = result.current.restoreBackup();
    });

    expect(restored).toEqual(backupData);
  });

  test('restoreBackup returns null when no backup', () => {
    const { result } = renderHook(() => useAutoSave({ enabled: false }));

    let restored;
    act(() => {
      restored = result.current.restoreBackup();
    });

    expect(restored).toBeNull();
  });

  test('calls onSave callback after successful save', () => {
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

    act(() => {
      result.current.forceSave();
    });

    expect(onSave).toHaveBeenCalled();
  });
});
