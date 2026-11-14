import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import Editor from '@monaco-editor/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useResolvedTheme } from '../../hooks/useTheme';
import {
  diffDiagrams,
  edgeStatusMap,
  isDiffEmpty,
  nodeStatusMap,
  type DiagramDocLike,
} from '../../utils/diagramDiff';
import { deserializeDiagram } from '../../utils/fileUtils';
import { createLogger } from '../../utils/logger';
import { DiagramMiniCanvas, type MiniNodeStatus } from './DiagramMiniCanvas';
import { toDisplayString } from '../../utils/toDisplayString';

const logger = createLogger('DiagramDiffViewer');

interface DiagramDiffViewerProps {
  filePath: string;
  staged: boolean;
  onClose: () => void;
}

interface LoadState {
  loading: boolean;
  base: DiagramDocLike | null;
  target: DiagramDocLike | null;
  fallbackTextDiff: string | null;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function parseDoc(text: string | null): DiagramDocLike | null {
  if (text === null) return null;
  const result = deserializeDiagram(text);
  return result.success && result.diagram ? (result.diagram as unknown as DiagramDocLike) : null;
}

const DiagramDiffViewer: React.FC<DiagramDiffViewerProps> = ({ filePath, staged, onClose }) => {
  const { t } = useTranslation('common');
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
  const resolvedTheme = useResolvedTheme();
  const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs';
  const [mode, setMode] = useState<'side' | 'overlay'>('side');
  const [state, setState] = useState<LoadState>({
    loading: true,
    base: null,
    target: null,
    fallbackTextDiff: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const git = window.rpaforge?.git;
      try {
        const baseText = (await git?.showBlob('HEAD', filePath)) ?? null;
        const targetText =
          staged
            ? ((await git?.showBlob(':0:', filePath)) ?? null)
            : ((await git?.readWorktreeFile(filePath)) ?? null);
        const base = parseDoc(baseText);
        const target = parseDoc(targetText);
        if (cancelled) return;
        if (!base || !target) {
          // Unparseable (non-diagram content, new file, legacy garbage):
          // fall back to the plain text diff per issue #850.
          const rawDiff = (await git?.diff(filePath, staged)) ?? '';
          if (!cancelled) setState({ loading: false, base: null, target: null, fallbackTextDiff: rawDiff });
          return;
        }
        if (!cancelled) setState({ loading: false, base, target, fallbackTextDiff: null });
      } catch (err) {
        logger.error('Failed to load diagram revisions', err);
        let rawDiff = '';
        try {
          rawDiff = (await window.rpaforge?.git.diff(filePath, staged)) ?? '';
        } catch {
          // Keep the empty fallback content.
        }
        if (!cancelled) setState({ loading: false, base: null, target: null, fallbackTextDiff: rawDiff });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath, staged]);

  const diff = useMemo(
    () => (state.base && state.target ? diffDiagrams(state.base, state.target) : null),
    [state.base, state.target]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const nodeById = (doc: DiagramDocLike | null, id: string): string => {
    const node = doc?.nodes.find((n) => n.id === id);
    if (!node) return id;
    const data = (node.data ?? {}) as Record<string, unknown>;
    return toDisplayString(data.label ?? data.name ?? id);
  };

  const renderChangeList = () => {
    if (!diff || isDiffEmpty(diff)) {
      return <p className="text-xs text-ui-text-muted px-3 py-2">{t('gitSourceControl.diagramDiffNoChanges')}</p>;
    }
    // Added nodes only exist in the target revision; removed only in base —
    // resolve labels across both.
    const label = (id: string) => {
      const fromBase = nodeById(state.base, id);
      return fromBase !== id ? fromBase : nodeById(state.target, id);
    };
    return (
      <div className="px-3 py-2 space-y-1 overflow-y-auto max-h-40 border-t border-ui-border">
        {diff.nodeChanges.map((change) => (
          <p key={`${change.kind}:${change.nodeId}`} className="text-xs">
            <span
              className={
                change.kind === 'added'
                  ? 'text-green-600 dark:text-green-400'
                  : change.kind === 'removed'
                    ? 'text-red-600 dark:text-red-400'
                    : change.kind === 'moved'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-amber-600 dark:text-amber-400'
              }
            >
              ●
            </span>{' '}
            <span className="text-ui-text">
              {t(`gitSourceControl.diagramDiffKind_${change.kind}`, {
                node: label(change.nodeId),
              })}
            </span>
            {change.kind === 'modified' &&
              change.changes.map((field) => (
                <span key={field.field} className="text-ui-text-muted">
                  {' '}
                  · {field.field}
                </span>
              ))}
            {diff.subDiagramChanges
              .filter((ref) => ref.nodeId === change.nodeId)
              .map((ref) => (
                <span key={ref.field} className="text-ui-text-muted">
                  {' '}
                  · {t('gitSourceControl.diagramDiffSubDiagramRef', {
                    field: ref.field,
                    base: toDisplayString(ref.base ?? ''),
                    target: toDisplayString(ref.target ?? ''),
                  })}
                </span>
              ))}
            {diff.structuralHints
              .filter((hint) => hint.nodeId === change.nodeId)
              .map((hint) => (
                <span key={hint.kind} className="text-ui-text-muted italic">
                  {' '}
                  ·{' '}
                  {t(
                    hint.kind === 'inserted-between'
                      ? 'gitSourceControl.diagramDiffHintInserted'
                      : 'gitSourceControl.diagramDiffHintRejoin',
                    { a: label(hint.neighbors[0]), b: label(hint.neighbors[1]) }
                  )}
                </span>
              ))}
          </p>
        ))}
        {diff.edgeChanges.map((change) => (
          <p
            key={`edge:${change.kind}:${change.source}->${change.target}`}
            className="text-xs text-ui-text-muted"
          >
            {t(`gitSourceControl.diagramDiffEdge_${change.kind}`, {
              source: label(change.source),
              target: label(change.target),
              prevSource: change.prevSource ? label(change.prevSource) : '',
              prevTarget: change.prevTarget ? label(change.prevTarget) : '',
            })}
          </p>
        ))}
        {diff.metadataChanges.map((change) => (
          <p key={`meta:${change.field}`} className="text-xs text-ui-text-muted">
            {t('gitSourceControl.diagramDiffMetadata', {
              field: change.field,
              base: toDisplayString(change.base ?? ''),
              target: toDisplayString(change.target ?? ''),
            })}
          </p>
        ))}
        {diff.variableChanges.map((change) => (
          <p key={`var:${change.field}`} className="text-xs text-ui-text-muted">
            {t('gitSourceControl.diagramDiffVariable', { name: change.field })}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-ui-overlay" onClick={onClose} />
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('gitSourceControl.diagramDiffTitle')}
        className="relative bg-ui-surface dark:bg-ui-surface rounded-lg shadow-xl w-full max-w-6xl h-[85vh] mx-4 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-ui-border flex-shrink-0">
          <h2 className="text-sm font-semibold text-ui-text truncate" title={filePath}>
            {basename(filePath)} — {t('gitSourceControl.diagramDiffTitle')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode(mode === 'side' ? 'overlay' : 'side')}
              className="text-xs text-ui-primary hover:underline"
            >
              {mode === 'side'
                ? t('gitSourceControl.diagramDiffModeOverlay')
                : t('gitSourceControl.diagramDiffModeSide')}
            </button>
            <button
              onClick={onClose}
              className="p-1 text-ui-text-muted hover:text-ui-text rounded"
              aria-label={t('actions.cancel')}
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>
        {state.loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-ui-text-muted">
            …
          </div>
        ) : state.fallbackTextDiff !== null ? (
          <div className="flex-1 min-h-0">
            <Editor
              value={state.fallbackTextDiff}
              language="diff"
              theme={editorTheme}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        ) : (
          <>
            {mode === 'side' ? (
              <div className="flex flex-1 min-h-0">
                <div className="flex flex-col flex-1 min-w-0 border-r border-ui-border">
                  <p className="px-3 py-1 text-xs font-medium text-ui-text-muted border-b border-ui-border">
                    {t('gitSourceControl.diagramDiffPaneBase')}
                  </p>
                  <DiagramMiniCanvas
                    doc={state.base}
                    nodeStatus={(() => {
                      const statuses = new Map<string, MiniNodeStatus>();
                      if (diff)
                        for (const [id, kind] of nodeStatusMap(diff))
                          statuses.set(id, kind === 'added' ? 'ghost' : kind === 'moved' ? 'ghost' : kind);
                      return statuses;
                    })()}
                    edgeStatus={(() => {
                      const m = new Map<string, 'added' | 'removed'>();
                      if (diff)
                        for (const [key, value] of edgeStatusMap(diff))
                          if (value === 'removed') m.set(key, value);
                      return m;
                    })()}
                  />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <p className="px-3 py-1 text-xs font-medium text-ui-text-muted border-b border-ui-border">
                    {t('gitSourceControl.diagramDiffPaneTarget')}
                  </p>
                  <DiagramMiniCanvas
                    doc={state.target}
                    nodeStatus={(() => {
                      const statuses = new Map<string, MiniNodeStatus>();
                      if (diff)
                        for (const [id, kind] of nodeStatusMap(diff))
                          statuses.set(id, kind === 'removed' ? 'ghost' : kind);
                      return statuses;
                    })()}
                    edgeStatus={(() => {
                      const m = new Map<string, 'added' | 'removed'>();
                      if (diff)
                        for (const [key, value] of edgeStatusMap(diff))
                          if (value === 'added') m.set(key, value);
                      return m;
                    })()}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                <DiagramMiniCanvas
                  doc={state.target}
                  overlayBase={state.base}
                  nodeStatus={(() => {
                    const statuses = new Map<string, MiniNodeStatus>();
                    if (diff)
                      for (const [id, kind] of nodeStatusMap(diff))
                        statuses.set(id, kind === 'removed' ? 'ghost' : kind);
                    return statuses;
                  })()}
                  edgeStatus={(() => {
                    const m = new Map<string, 'added' | 'removed'>();
                    if (diff)
                      for (const [key, value] of edgeStatusMap(diff)) m.set(key, value);
                    return m;
                  })()}
                />
              </div>
            )}
            {renderChangeList()}
          </>
        )}
      </div>
    </div>
  );
};

export default DiagramDiffViewer;
