import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  diffDiagrams,
  isDiffEmpty,
  mergeDiagrams,
  nodeStatusMap,
  type DiagramDocLike,
  type MergeConflict,
  type Resolution,
} from '../../utils/diagramDiff';
import { deserializeDiagram, serializeDiagram } from '../../utils/fileUtils';
import type { ProcessFile } from '../../utils/fileUtils';
import { createLogger } from '../../utils/logger';
import { DiagramMiniCanvas, type MiniNodeStatus } from './DiagramMiniCanvas';

const logger = createLogger('DiagramMergeView');

interface DiagramMergeViewProps {
  filePath: string;
  onClose: () => void;
}

const EMPTY_DOC: DiagramDocLike = { metadata: {}, nodes: [], edges: [], variables: [] };

function parseStage(text: string | null): DiagramDocLike {
  if (text === null) return { ...EMPTY_DOC };
  const result = deserializeDiagram(text);
  return result.success && result.diagram
    ? (result.diagram as unknown as DiagramDocLike)
    : { ...EMPTY_DOC };
}

const DiagramMergeView: React.FC<DiagramMergeViewProps> = ({ filePath, onClose }) => {
  const { t } = useTranslation('common');
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [base, setBase] = useState<DiagramDocLike>(EMPTY_DOC);
  const [ours, setOurs] = useState<DiagramDocLike>(EMPTY_DOC);
  const [theirs, setTheirs] = useState<DiagramDocLike>(EMPTY_DOC);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const git = window.rpaforge?.git;
        const stages = (await git?.conflictStages(filePath)) ?? {
          base: null,
          ours: null,
          theirs: null,
        };
        if (cancelled) return;
        setBase(parseStage(stages.base));
        setOurs(parseStage(stages.ours));
        setTheirs(parseStage(stages.theirs));
        setLoading(false);
      } catch (err) {
        logger.error('Failed to load merge stages', err);
        if (!cancelled) {
          setLoadFailed(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const { conflicts, autoDiff } = useMemo(() => {
    const result = mergeDiagrams(base, ours, theirs, resolutions);
    const merged = result.merged;
    const auto = diffDiagrams(base, merged);
    return { conflicts: result.conflicts, autoDiff: auto };
  }, [base, ours, theirs, resolutions]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const label = (doc: DiagramDocLike, id: string): string => {
    const node = doc.nodes.find((n) => n.id === id);
    const data = (node?.data ?? {}) as Record<string, unknown>;
    return String(data.label ?? data.name ?? id);
  };

  const conflictLabel = (conflict: MergeConflict): string => {
    switch (conflict.kind) {
      case 'node-field':
        return `${label(ours, conflict.nodeId ?? '')} · ${conflict.field}`;
      case 'node-add':
      case 'node-delete':
        return label(base, conflict.nodeId ?? '') || label(ours, conflict.nodeId ?? '') || (conflict.nodeId ?? '');
      case 'edge':
        return `${conflict.source} → ${conflict.target}`;
      case 'metadata':
      case 'variable':
        return conflict.field ?? '';
      default:
        return conflict.key;
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const result = mergeDiagrams(base, ours, theirs, resolutions);
      const oursFile = ours as unknown as ProcessFile;
      const serialized = serializeDiagram(
        result.merged.nodes as unknown as ProcessFile['nodes'],
        result.merged.edges as unknown as ProcessFile['edges'],
        result.merged.metadata as unknown as ProcessFile['metadata'],
        oursFile.viewport,
        (result.merged.variables as unknown as ProcessFile['variables']) ?? []
      );
      const git = window.rpaforge?.git;
      if (!git) {
        throw new Error('Bridge APIs unavailable');
      }
      await git.writeWorktreeFile(filePath, serialized);
      await git.stage([filePath]);
      setApplied(true);
    } catch (err) {
      logger.error('Failed to apply merge resolution', err);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-ui-overlay" onClick={onClose} />
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('gitSourceControl.mergeToolTitle')}
        className="relative bg-ui-surface dark:bg-ui-surface rounded-lg shadow-xl w-full max-w-6xl h-[85vh] mx-4 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-ui-border flex-shrink-0">
          <h2 className="text-sm font-semibold text-ui-text truncate" title={filePath}>
            {t('gitSourceControl.mergeToolTitle')} — {filePath}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-ui-text-muted hover:text-ui-text rounded"
            aria-label={t('actions.cancel')}
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-ui-text-muted">…</div>
        ) : loadFailed ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              {t('gitSourceControl.mergeLoadFailed')}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-1 min-h-0">
              <div className="flex flex-col flex-1 min-w-0 border-r border-ui-border">
                <DiagramMiniCanvas
                  doc={theirs}
                  nodeStatus={(() => {
                    const statuses = new Map<string, MiniNodeStatus>();
                    for (const [id, kind] of nodeStatusMap(autoDiff))
                      statuses.set(id, kind === 'removed' ? 'ghost' : kind);
                    return statuses;
                  })()}
                  edgeStatus={new Map()}
                />
              </div>
              <div className="w-80 flex-shrink-0 overflow-y-auto border-l border-ui-border">
                <div className="px-3 py-2">
                  <p className="text-xs font-medium text-ui-text-muted uppercase mb-2">
                    {t('gitSourceControl.mergeAutoMerged')}
                  </p>
                  <p className="text-xs text-ui-text-muted">
                    {isDiffEmpty(autoDiff)
                      ? t('gitSourceControl.diagramDiffNoChanges')
                      : t('gitSourceControl.mergeAutoSummary', {
                          nodes: autoDiff.nodeChanges.length,
                          edges: autoDiff.edgeChanges.length,
                        })}
                  </p>
                </div>
                <div className="px-3 py-2 border-t border-ui-border">
                  <p className="text-xs font-medium text-ui-text-muted uppercase mb-2">
                    {t('gitSourceControl.mergeConflictsSection', { count: conflicts.length })}
                  </p>
                  {conflicts.length === 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {t('gitSourceControl.mergeNoConflicts')}
                    </p>
                  )}
                  {conflicts.map((conflict) => (
                    <div
                      key={conflict.key}
                      className="mb-2 p-2 rounded border border-ui-border text-xs"
                    >
                      <p className="text-ui-text mb-1" title={conflict.key}>
                        {t(`gitSourceControl.mergeConflict_${conflict.kind}`)}:{' '}
                        {conflictLabel(conflict)}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            setResolutions((prev) => ({ ...prev, [conflict.key]: 'ours' }))
                          }
                          className={`px-2 py-0.5 rounded border ${
                            (resolutions[conflict.key] ?? 'ours') === 'ours'
                              ? 'border-ui-primary text-ui-primary'
                              : 'border-ui-border text-ui-text-muted'
                          }`}
                        >
                          {t('gitSourceControl.mergeKeepOurs')}
                        </button>
                        <button
                          onClick={() =>
                            setResolutions((prev) => ({ ...prev, [conflict.key]: 'theirs' }))
                          }
                          className={`px-2 py-0.5 rounded border ${
                            resolutions[conflict.key] === 'theirs'
                              ? 'border-ui-primary text-ui-primary'
                              : 'border-ui-border text-ui-text-muted'
                          }`}
                        >
                          {t('gitSourceControl.mergeKeepTheirs')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-t border-ui-border flex-shrink-0">
              <span className="text-xs text-ui-text-muted">
                {applied ? t('gitSourceControl.mergeApplied') : ''}
              </span>
              <button
                onClick={() => void handleApply()}
                disabled={applying || applied}
                className="px-3 py-1 rounded bg-ui-primary text-white text-xs disabled:opacity-50"
              >
                {applied
                  ? t('gitSourceControl.mergeApplied')
                  : t('gitSourceControl.mergeApplyResolved')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DiagramMergeView;
