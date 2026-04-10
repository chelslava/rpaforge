import { beforeEach, describe, expect, test } from 'vitest';
import { useFileStore } from './fileStore';

describe('fileStore', () => {
  beforeEach(() => {
    useFileStore.persist.clearStorage();
    useFileStore.setState({
      currentFile: null,
      recentFiles: [],
      isDirty: false,
      lastSaved: null,
    });
  });

  test('createNewFile generates unique file with correct defaults', () => {
    const store = useFileStore.getState();
    const file = store.createNewFile('Test Process');

    expect(file.name).toBe('Test Process');
    expect(file.id).toMatch(/^file_/);
    expect(file.content).toBe('');
    expect(file.createdAt).toBeDefined();
    expect(file.updatedAt).toBeDefined();
    expect(useFileStore.getState().currentFile).toEqual(file);
    expect(useFileStore.getState().isDirty).toBe(false);
  });

  test('markDirty sets isDirty flag', () => {
    const store = useFileStore.getState();
    store.createNewFile('Test');

    expect(useFileStore.getState().isDirty).toBe(false);

    store.markDirty(true);

    expect(useFileStore.getState().isDirty).toBe(true);
  });

  test('markDirty(false) clears dirty flag', () => {
    const store = useFileStore.getState();
    store.createNewFile('Test');
    store.markDirty(true);

    expect(useFileStore.getState().isDirty).toBe(true);

    store.markDirty(false);

    expect(useFileStore.getState().isDirty).toBe(false);
  });

  test('updateContent sets content and marks dirty', () => {
    const store = useFileStore.getState();
    const file = store.createNewFile('Test');

    expect(useFileStore.getState().isDirty).toBe(false);

    store.updateContent('new content');

    const updated = useFileStore.getState().currentFile;
    expect(updated?.content).toBe('new content');
    expect(updated?.id).toBe(file.id);
    expect(useFileStore.getState().isDirty).toBe(true);
  });

  test('setLastSaved clears dirty flag', () => {
    const store = useFileStore.getState();
    store.createNewFile('Test');
    store.markDirty(true);

    expect(useFileStore.getState().isDirty).toBe(true);

    store.setLastSaved(new Date().toISOString());

    expect(useFileStore.getState().isDirty).toBe(false);
    expect(useFileStore.getState().lastSaved).toBeDefined();
  });

  test('setCurrentFile resets dirty flag', () => {
    const store = useFileStore.getState();
    store.createNewFile('Test');
    store.markDirty(true);

    expect(useFileStore.getState().isDirty).toBe(true);

    const newFile = {
      id: 'file-new',
      name: 'New File',
      path: '/path/to/file.rpaforge',
      content: '{}',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.setCurrentFile(newFile);

    expect(useFileStore.getState().currentFile).toEqual(newFile);
    expect(useFileStore.getState().isDirty).toBe(false);
  });

  test('addRecentFile maintains max 10 recent files', () => {
    const store = useFileStore.getState();

    for (let i = 0; i < 15; i++) {
      store.addRecentFile({
        id: `file-${i}`,
        name: `File ${i}`,
        path: `/path/file-${i}`,
        lastOpened: new Date().toISOString(),
      });
    }

    const recent = useFileStore.getState().recentFiles;
    expect(recent).toHaveLength(10);
    expect(recent[0].id).toBe('file-14');
  });

  test('addRecentFile updates existing entry', () => {
    const store = useFileStore.getState();

    store.addRecentFile({
      id: 'file-1',
      name: 'File 1',
      path: '/path/file-1',
      lastOpened: '2024-01-01T00:00:00.000Z',
    });

    store.addRecentFile({
      id: 'file-1',
      name: 'File 1 Updated',
      path: '/path/file-1-updated',
      lastOpened: '2024-01-02T00:00:00.000Z',
    });

    const recent = useFileStore.getState().recentFiles;
    expect(recent).toHaveLength(1);
    expect(recent[0].name).toBe('File 1 Updated');
  });

  test('removeRecentFile removes by id', () => {
    const store = useFileStore.getState();

    store.addRecentFile({ id: 'file-1', name: 'File 1', path: '/p1', lastOpened: '' });
    store.addRecentFile({ id: 'file-2', name: 'File 2', path: '/p2', lastOpened: '' });

    expect(useFileStore.getState().recentFiles).toHaveLength(2);

    store.removeRecentFile('file-1');

    const recent = useFileStore.getState().recentFiles;
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe('file-2');
  });
});
