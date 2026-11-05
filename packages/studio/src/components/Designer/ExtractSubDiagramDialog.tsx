import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { useBlockStore } from '../../stores/blockStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useProjectFsStore } from '../../stores/projectFsStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { extractSubDiagram } from '../../utils/extractSubDiagram';
import { generateGuid } from '../../utils/guid';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ExtractSubDiagramDialogProps {
  selectedIds: string[];
  onClose: () => void;
}

/**
 * Selection → sub-diagram extraction dialog (issue #851): shows the derived
 * variable contract for confirmation, creates the sub-diagram file, and
 * collapses the selection into a `sub-diagram-call` node.
 */
const ExtractSubDiagramDialog: React.FC<ExtractSubDiagramDialogProps> = ({
  selectedIds,
  onClose,
}) => {
  const { t } = useTranslation('common');
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
  const [name, setName] = useState('New Sub-diagram');
  const [isWorking, setIsWorking] = useState(false);
  const nodes = useBlockStore(useShallow((s) => s.nodes));
  const edges = useBlockStore(useShallow((s) => s.edges));
  const addNode = useBlockStore((s) => s.addNode);
  const addEdge = useBlockStore((s) => s.addEdge);
  const removeEdge = useBlockStore((s) => s.removeEdge);
  const removeNode = useBlockStore((s) => s.removeNode);
  const pushHistory = useHistoryStore((s) => s.pushHistory);
  const setSelectedNode = useSelectionStore((s) => s.setSelectedNode);
  const addDiagram = useDiagramStore((s) => s.addDiagram);
  const createFile = useProjectFsStore((s) => s.createFile);

  const preview = useMemo(() => {
    try {
      return {
        result: extractSubDiagram(nodes, edges, selectedIds, name, generateGuid()),
        error: null as string | null,
      };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [nodes, edges, selectedIds, name]);

  const handleConfirm = async () => {
    const result = preview.result;
    if (!result) return;
    setIsWorking(true);
    const relativePath = `${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}.process`;
    const diagram = addDiagram({
      name,
      type: 'sub-diagram',
      path: relativePath,
      folder: '',
    });
    try {
      await createFile(
        relativePath,
        JSON.stringify(
          { ...result.document, metadata: { ...result.document.metadata, id: diagram.id } },
          null,
          2
        )
      );
      pushHistory(nodes, edges);
      for (const edgeId of result.removedEdgeIds) removeEdge(edgeId);
      for (const nodeId of result.removedNodeIds) removeNode(nodeId);
      addNode(result.callNode as never);
      for (const edge of result.rewiredEdges) addEdge(edge as never);
      setSelectedNode(result.callNode.id);
      toast.success(t('canvas.extractSubDiagram.success', { name }));
      onClose();
    } catch (err) {
      toast.error(
        t('canvas.extractSubDiagram.failed', {
          message: err instanceof Error ? err.message : String(err),
        })
      );
      setIsWorking(false);
    }
  };

  const errorKey = preview.error
    ? `canvas.extractSubDiagram.errors.${preview.error}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-ui-overlay" onClick={onClose} />
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('canvas.extractSubDiagram.title')}
        className="relative rounded-lg bg-ui-surface p-4 shadow-xl w-full max-w-md mx-4"
      >
        <h2 className="text-sm font-semibold text-ui-text mb-2">
          {t('canvas.extractSubDiagram.title')}
        </h2>
        {errorKey ? (
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{t(errorKey)}</p>
        ) : (
          <div className="space-y-2 mb-3">
            <p className="text-xs text-ui-text-muted">
              {t('canvas.extractSubDiagram.summary', { nodes: selectedIds.length })}
            </p>
            <div>
              <label className="block text-xs text-ui-text-muted" htmlFor="extract-sub-name">
                {t('canvas.extractSubDiagram.nameLabel')}
              </label>
              <input
                id="extract-sub-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded border border-ui-border bg-ui-surface px-2 py-1 text-sm text-ui-text"
              />
            </div>
            <p className="text-xs text-ui-text-muted">
              {t('canvas.extractSubDiagram.inputs', {
                names: preview.result?.contract.inputs.join(', ') || '—',
              })}
            </p>
            <p className="text-xs text-ui-text-muted">
              {t('canvas.extractSubDiagram.outputs', {
                names: preview.result?.contract.outputs.join(', ') || '—',
              })}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 text-sm text-ui-text-muted hover:text-ui-text">
            {t('actions.cancel')}
          </button>
          <button
            disabled={!!preview.error || isWorking || !name.trim()}
            onClick={() => void handleConfirm()}
            className="rounded bg-ui-primary px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {t('canvas.extractSubDiagram.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExtractSubDiagramDialog;
