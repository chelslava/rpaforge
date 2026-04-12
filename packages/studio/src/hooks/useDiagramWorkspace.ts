import { useEffect, useRef } from 'react';

import { useDiagramStore } from '../stores/diagramStore';
import { useProcessStore } from '../stores/processStore';

export function useDiagramWorkspace(): void {
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const getDiagramDocument = useDiagramStore((state) => state.getDiagramDocument);
  const ensureDiagramDocument = useDiagramStore((state) => state.ensureDiagramDocument);
  const saveDiagramDocument = useDiagramStore((state) => state.saveDiagramDocument);

  const metadata = useProcessStore((state) => state.metadata);
  const nodes = useProcessStore((state) => state.nodes);
  const edges = useProcessStore((state) => state.edges);
  const loadProcess = useProcessStore((state) => state.loadProcess);

  const loadedDiagramIdRef = useRef<string | null>(null);
  const latestProcessStateRef = useRef({
    metadata,
    nodes,
    edges,
  });

  useEffect(() => {
    latestProcessStateRef.current = {
      metadata,
      nodes,
      edges,
    };
  }, [edges, metadata, nodes]);

  useEffect(() => {
    if (!activeDiagramId) {
      loadedDiagramIdRef.current = null;
      return;
    }

    const previousDiagramId = loadedDiagramIdRef.current;
    if (
      previousDiagramId &&
      latestProcessStateRef.current.metadata &&
      previousDiagramId !== activeDiagramId
    ) {
      saveDiagramDocument(previousDiagramId, {
        metadata: latestProcessStateRef.current.metadata,
        nodes: latestProcessStateRef.current.nodes,
        edges: latestProcessStateRef.current.edges,
      });
    }

    const nextDocument =
      getDiagramDocument(activeDiagramId) || ensureDiagramDocument(activeDiagramId);

    if (!nextDocument) {
      return;
    }

    loadProcess(nextDocument.metadata, nextDocument.nodes, nextDocument.edges);
    loadedDiagramIdRef.current = activeDiagramId;
  }, [
    activeDiagramId,
    ensureDiagramDocument,
    getDiagramDocument,
    loadProcess,
    saveDiagramDocument,
  ]);

  useEffect(() => {
    if (!activeDiagramId || loadedDiagramIdRef.current !== activeDiagramId || !metadata) {
      return;
    }

    saveDiagramDocument(activeDiagramId, {
      metadata,
      nodes,
      edges,
    });
  }, [activeDiagramId, edges, metadata, nodes, saveDiagramDocument]);
}

export default useDiagramWorkspace;
