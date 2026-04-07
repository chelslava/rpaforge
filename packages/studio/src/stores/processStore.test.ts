import { beforeEach, describe, expect, test } from 'vitest';
import type { Node } from '@reactflow/core';
import { useProcessStore, type ProcessNodeData } from './processStore';
import { createDefaultBlockData } from '../types/blocks';

describe('processStore', () => {
  beforeEach(() => {
    useProcessStore.persist.clearStorage();
    useProcessStore.getState().clearProcess();
  });

  test('createProcess seeds exactly one Start node', () => {
    const store = useProcessStore.getState();

    store.createProcess('My Process');

    const nextState = useProcessStore.getState();
    expect(nextState.nodes).toHaveLength(1);
    expect(nextState.nodes[0].data.blockData?.type).toBe('start');
  });

  test('addNode blocks a second Start node', () => {
    const store = useProcessStore.getState();
    store.createProcess('My Process');

    const startId = 'start-second';
    const duplicateStart: Node<ProcessNodeData> = {
      id: startId,
      type: 'start',
      position: { x: 200, y: 200 },
      data: {
        blockData: createDefaultBlockData('start', startId),
        description: '',
        tags: [],
      },
    };

    expect(store.addNode(duplicateStart)).toBe(false);
    expect(
      useProcessStore
        .getState()
        .nodes.filter((node) => node.data.blockData?.type === 'start')
    ).toHaveLength(1);
  });

  test('removeNode blocks deleting the last Start node', () => {
    const store = useProcessStore.getState();
    store.createProcess('My Process');

    const startNode = useProcessStore
      .getState()
      .nodes.find((node) => node.data.blockData?.type === 'start');
    expect(startNode).toBeDefined();

    expect(store.removeNode(startNode!.id)).toBe(false);
    expect(
      useProcessStore.getState().nodes.find((node) => node.id === startNode!.id)
    ).toBeDefined();
  });

  test('loadProcess rejects diagrams without exactly one Start node', () => {
    const store = useProcessStore.getState();

    const ok = store.loadProcess(
      {
        id: 'proc-1',
        name: 'Broken',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      [
        {
          id: 'activity-1',
          type: 'activity',
          position: { x: 0, y: 0 },
          data: {
            description: '',
            tags: [],
          },
        },
      ],
      []
    );

    expect(ok).toBe(false);
    expect(useProcessStore.getState().validationMessage).toContain('exactly one Start');
  });

  test('addEdge preserves typed edge semantics in store', () => {
    const store = useProcessStore.getState();
    store.createProcess('My Process');

    store.addEdge({
      id: 'edge-1',
      source: 'start-1',
      target: 'node-2',
      sourceHandle: 'true',
      targetHandle: 'input',
      type: 'custom',
      data: { type: 'true' },
      style: { stroke: '#22C55E', strokeWidth: 2 },
    });

    expect(useProcessStore.getState().edges[0]).toMatchObject({
      id: 'edge-1',
      sourceHandle: 'true',
      targetHandle: 'input',
      type: 'custom',
      data: { type: 'true' },
      style: { stroke: '#22C55E', strokeWidth: 2 },
    });
  });
});
