import { beforeEach, describe, expect, test } from 'vitest';
import type { Node } from '@xyflow/react';

import { useDiagramStore, type DiagramDocument } from './diagramStore';
import type { ProcessNodeData } from './processStore';
import { collectProblems, useProblemsStore } from './problemsStore';

function subCallNode(id: string, diagramId: string): Node<ProcessNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { blockData: { type: 'sub-diagram-call', diagramId } },
  } as unknown as Node<ProcessNodeData>;
}

function docWithNodes(nodes: Node<ProcessNodeData>[]): DiagramDocument {
  return { metadata: {} as DiagramDocument['metadata'], nodes, edges: [] };
}

function seedProject(mainNodeId: string | null) {
  const meta = {
    id: 'main-1',
    name: 'Main',
    type: 'main' as const,
    path: 'main.process',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  useDiagramStore.getState().loadProject(
    {
      name: 'P',
      version: '1.0.0',
      main: 'main-1',
      diagrams: [meta],
      folders: [],
      settings: { defaultTimeout: 30, screenshotOnError: false },
    },
    { 'main-1': docWithNodes(mainNodeId ? [subCallNode(mainNodeId, 'ghost-diagram')] : []) }
  );
}

describe('problemsStore', () => {
  beforeEach(() => {
    useProblemsStore.getState().clear();
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

  test('refresh clears problems and stamps time when no project is loaded', () => {
    useProblemsStore.setState({
      problems: [
        {
          id: 'stale',
          severity: 'error',
          code: 'missing_diagram',
          message: 'stale',
          source: 'project',
        },
      ],
    });

    useProblemsStore.getState().refresh();

    const state = useProblemsStore.getState();
    expect(state.problems).toEqual([]);
    expect(state.refreshedAt).not.toBeNull();
  });

  test('refresh collects missing sub-diagram reference with node id', () => {
    seedProject('node-1');

    useProblemsStore.getState().refresh();

    const problems = useProblemsStore.getState().problems;
    expect(problems.length).toBeGreaterThan(0);
    expect(
      problems.some(
        (p) => p.code === 'missing_diagram' && p.nodeId === 'node-1'
      )
    ).toBe(true);
    expect(problems.every((p) => p.severity === 'error')).toBe(true);
  });

  test('refresh reports no problems for a clean project', () => {
    seedProject(null);

    useProblemsStore.getState().refresh();

    expect(useProblemsStore.getState().problems).toEqual([]);
  });

  test('collectProblems deduplicates identical issues across sources', () => {
    seedProject('node-1');

    const problems = collectProblems(
      useDiagramStore.getState().project!.diagrams,
      useDiagramStore.getState().diagramDocuments,
      'main-1'
    );

    const matching = problems.filter(
      (p) => p.code === 'missing_diagram' && p.nodeId === 'node-1'
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].id).toBeTruthy();
  });

  test('clear resets problems and timestamp', () => {
    useProblemsStore.setState({
      problems: [
        {
          id: 'p1',
          severity: 'error',
          code: 'missing_diagram',
          message: 'x',
          source: 'project',
        },
      ],
      refreshedAt: 123,
    });

    useProblemsStore.getState().clear();

    const state = useProblemsStore.getState();
    expect(state.problems).toEqual([]);
    expect(state.refreshedAt).toBeNull();
  });
});
