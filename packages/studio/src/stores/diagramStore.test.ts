import { beforeEach, describe, expect, test } from 'vitest';

import { useDiagramStore } from './diagramStore';

describe('diagramStore', () => {
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
  });

  test('createProject seeds a main diagram document', () => {
    useDiagramStore.getState().createProject('My Project');

    const state = useDiagramStore.getState();
    const mainDiagram = state.project?.diagrams[0];

    expect(mainDiagram).toBeDefined();
    if (!mainDiagram) {
      throw new Error('Expected main diagram to exist after project creation');
    }

    expect(state.activeDiagramId).toBe(mainDiagram.id);
    expect(state.diagramDocuments[mainDiagram.id]).toBeDefined();
    expect(state.diagramDocuments[mainDiagram.id].metadata.name).toBe('Main Process');
    expect(state.diagramDocuments[mainDiagram.id].nodes).toHaveLength(1);
    expect(
      state.diagramDocuments[mainDiagram.id].nodes[0].data.blockData?.type
    ).toBe('start');
  });

  test('addDiagram seeds a sub-diagram document', () => {
    useDiagramStore.getState().createProject('My Project');

    const diagram = useDiagramStore.getState().addDiagram({
      name: 'Login Flow',
      type: 'sub-diagram',
      path: 'processes/auth/login.flow.diagram.json',
      folder: 'auth',
      inputs: ['username', 'password'],
      outputs: ['success'],
    });

    const document = useDiagramStore.getState().diagramDocuments[diagram.id];

    expect(document).toBeDefined();
    expect(document.metadata.id).toBe(diagram.id);
    expect(document.metadata.name).toBe('Login Flow');
    expect(document.nodes).toHaveLength(1);
    expect(document.edges).toEqual([]);
  });
});
