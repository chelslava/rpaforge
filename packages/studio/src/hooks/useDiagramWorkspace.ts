import { useEffect, useRef } from 'react';

import { useDiagramStore } from '../stores/diagramStore';
import { useProcessStore } from '../stores/processStore';

export function useDiagramWorkspace(): void {
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const getDiagramDocument = useDiagramStore((state) => state.getDiagramDocument);
  const ensureDiagramDocument = useDiagramStore((state) => state.ensureDiagramDocument);
  const saveDiagramDocument = useDiagramStore((state) => state.saveDiagramDocument);
  const markDiagramDirty = useDiagramStore((state) => state.markDiagramDirty);

  const metadata = useProcessStore((state) => state.metadata);
  const nodes = useProcessStore((state) => state.nodes);
  const edges = useProcessStore((state) => state.edges);
  const loadProcess = useProcessStore((state) => state.loadProcess);

  const loadedDiagramIdRef = useRef<string | null>(null);
  const initialStateRef = useRef<{ nodes: typeof nodes; edges: typeof edges } | null>(null);
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
    markDiagramDirty(activeDiagramId, false);
    initialStateRef.current = { nodes: nextDocument.nodes, edges: nextDocument.edges };
    loadedDiagramIdRef.current = activeDiagramId;
  }, [
    activeDiagramId,
    ensureDiagramDocument,
    getDiagramDocument,
    loadProcess,
    saveDiagramDocument,
    markDiagramDirty,
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

    if (initialStateRef.current) {
      const nodesChanged =
        nodes.length !== initialStateRef.current.nodes.length ||
        JSON.stringify(nodes.map(n => ({ id: n.id, position: n.position, data: n.data }))) !==
        JSON.stringify(initialStateRef.current.nodes.map(n => ({ id: n.id, position: n.position, data: n.data })));
      const edgesChanged =
        edges.length !== initialStateRef.current.edges.length ||
        JSON.stringify(edges.map(e => ({ id: e.id, source: e.source, target: e.target }))) !==
        JSON.stringify(initialStateRef.current.edges.map(e => ({ id: e.id, source: e.source, target: e.target })));

      markDiagramDirty(activeDiagramId, nodesChanged || edgesChanged);
    }
  }, [activeDiagramId, edges, metadata, nodes, saveDiagramDocument, markDiagramDirty]);
}

export default useDiagramWorkspace;
