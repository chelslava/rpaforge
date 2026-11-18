import { create } from 'zustand';
import type { Node } from '@xyflow/react';

import {
  validateDiagram,
  validateProjectDiagramState,
} from '../utils/diagramValidation';
import type { ValidationError } from '../utils/diagramValidation';
import type { DiagramDocument, DiagramMetadata } from './diagramStore';
import { useDiagramStore } from './diagramStore';
import type { ProcessNodeData } from './processStore';

export type ProblemSeverity = 'error' | 'warning' | 'info';

export type ProblemSource = 'diagram' | 'project';

export interface ProblemItem {
  /** Stable identity within one refresh pass. */
  id: string;
  severity: ProblemSeverity;
  /** Validation issue type (circular_reference, missing_diagram, ...). */
  code: string;
  message: string;
  diagramId?: string;
  nodeId?: string;
  source: ProblemSource;
}

interface ProblemsState {
  problems: ProblemItem[];
  /** Unix-ms timestamp of the last refresh; null before the first one. */
  refreshedAt: number | null;
  refresh: () => void;
  clear: () => void;
}

const SEVERITY_BY_CODE: Record<string, ProblemSeverity> = {
  circular_reference: 'error',
  missing_diagram: 'error',
  invalid_parameter: 'error',
  max_depth: 'error',
};

/**
 * Aggregate the existing validation flows for one workspace snapshot:
 * project-level diagram-state validation plus the active diagram's own
 * structural checks, deduplicated by (code, diagram, node, message).
 */
export function collectProblems(
  diagrams: DiagramMetadata[],
  documents: Record<string, DiagramDocument>,
  activeDiagramId: string
): ProblemItem[] {
  const nodesMap = new Map<string, Node<ProcessNodeData>[]>();
  for (const [id, doc] of Object.entries(documents)) {
    nodesMap.set(id, doc.nodes);
  }

  const items: ProblemItem[] = [];
  const seen = new Set<string>();
  let seq = 0;
  const push = (error: ValidationError, source: ProblemSource) => {
    const key = `${error.type}|${error.diagramId ?? activeDiagramId}|${error.nodeId ?? ''}|${error.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    seq += 1;
    items.push({
      id: `${source}-${seq}`,
      severity: SEVERITY_BY_CODE[error.type] ?? 'error',
      code: error.type,
      message: error.message,
      diagramId: error.diagramId ?? activeDiagramId,
      nodeId: error.nodeId,
      source,
    });
  };

  for (const error of validateProjectDiagramState(activeDiagramId, diagrams, documents)) {
    push(error, 'project');
  }
  const activeDoc = documents[activeDiagramId];
  if (activeDoc) {
    for (const error of validateDiagram(activeDiagramId, activeDoc.nodes, diagrams, nodesMap)) {
      push(error, 'diagram');
    }
  }
  return items;
}

export const useProblemsStore = create<ProblemsState>((set) => ({
  problems: [],
  refreshedAt: null,

  refresh: () => {
    const { project, diagramDocuments, activeDiagramId } = useDiagramStore.getState();
    const problems =
      project && activeDiagramId
        ? collectProblems(project.diagrams, diagramDocuments, activeDiagramId)
        : [];
    set({ problems, refreshedAt: Date.now() });
  },

  clear: () => set({ problems: [], refreshedAt: null }),
}));
