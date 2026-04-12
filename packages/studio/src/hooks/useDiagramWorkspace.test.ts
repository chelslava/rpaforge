import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

import { useDiagramWorkspace } from './useDiagramWorkspace';
import { useDiagramStore } from '../stores/diagramStore';
import { useProcessStore } from '../stores/processStore';
import { createDefaultBlockData } from '../types/blocks';

function makeNode(id: string) {
  return {
    id,
    type: 'assign',
    position: { x: 200, y: 120 },
    data: {
      blockData: {
        ...createDefaultBlockData('assign', id),
        variableName: '${value}',
        expression: '1',
      },
      description: '',
      tags: [],
    },
  };
}

describe('useDiagramWorkspace', () => {
  beforeEach(() => {
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
  });

  test('switching diagrams preserves each diagram workspace state', async () => {
    useDiagramStore.getState().createProject('My Project');
    const mainDiagramId = useDiagramStore.getState().activeDiagramId;
    if (!mainDiagramId) {
      throw new Error('Expected project creation to set an active main diagram');
    }

    const subDiagram = useDiagramStore.getState().addDiagram({
      name: 'Login Flow',
      type: 'sub-diagram',
      path: 'processes/auth/login.flow.diagram.json',
      folder: 'auth',
    });

    renderHook(() => useDiagramWorkspace());

    await waitFor(() => {
      expect(useProcessStore.getState().metadata?.id).toBe(mainDiagramId);
    });

    act(() => {
      useProcessStore.getState().addNode(makeNode('main-node'));
    });

    await waitFor(() => {
      expect(
        useDiagramStore.getState().getDiagramDocument(mainDiagramId)?.nodes
      ).toHaveLength(2);
    });

    act(() => {
      useDiagramStore.getState().openDiagram(subDiagram.id);
    });

    await waitFor(() => {
      expect(useProcessStore.getState().metadata?.id).toBe(subDiagram.id);
    });

    expect(useProcessStore.getState().nodes).toHaveLength(1);
    expect(useProcessStore.getState().nodes[0].data.blockData?.type).toBe('start');

    act(() => {
      useProcessStore.getState().addNode(makeNode('sub-node'));
    });

    await waitFor(() => {
      expect(
        useDiagramStore.getState().getDiagramDocument(subDiagram.id)?.nodes
      ).toHaveLength(2);
    });

    act(() => {
      useDiagramStore.getState().openDiagram(mainDiagramId);
    });

    await waitFor(() => {
      expect(useProcessStore.getState().metadata?.id).toBe(mainDiagramId);
    });

    expect(useProcessStore.getState().nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(['main-node'])
    );
    expect(useProcessStore.getState().nodes.map((node) => node.id)).not.toEqual(
      expect.arrayContaining(['sub-node'])
    );
  });
});
