/**
 * RPAForge Watch Panel (issue #836)
 *
 * List of SafeEvaluator watch expressions evaluated against the current
 * variables snapshot on every pause/step. Errors render inline, never
 * thrown. Watches persist per diagram (see watchStore).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiEye, FiPause, FiPlay, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useShallow } from 'zustand/shallow';

import { useDiagramStore } from '../../stores/diagramStore';
import { useEngine } from '../../hooks/useEngine';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useWatchStore } from '../../stores/watchStore';

const WatchPanel: React.FC = () => {
  const { t } = useTranslation('common');
  const activeDiagramId = useDiagramStore((s) => s.activeDiagramId);
  const isPaused = useDebuggerStore((s) => s.isPaused);
  const evaluationTick = useDebuggerStore((s) => s.evaluationTick);
  const { watchesByDiagram, addWatch, removeWatch, toggleWatch, setResults } =
    useWatchStore(
      useShallow((s) => ({
        watchesByDiagram: s.watchesByDiagram,
        addWatch: s.addWatch,
        removeWatch: s.removeWatch,
        toggleWatch: s.toggleWatch,
        setResults: s.setResults,
      })),
    );
  const { evaluateExpression } = useEngine();

  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const evaluatingRef = useRef(false);

  const diagramId = activeDiagramId ?? 'default';
  const watches = watchesByDiagram[diagramId] ?? [];

  // Reads the list via getState() on purpose: depending on `watches` would
  // recreate this callback on every setResults() and loop the effect forever
  // (same failure shape as the historic StoreUpdater infinite loop).
  const evaluateAll = useCallback(async () => {
    const enabled = (
      useWatchStore.getState().watchesByDiagram[diagramId] ?? []
    ).filter((w) => w.enabled);
    if (evaluatingRef.current) return;
    evaluatingRef.current = true;
    try {
      const results: Record<
        string,
        { status: 'ok' | 'error' | 'idle'; value?: string; valueType?: string; error?: string }
      > = {};
      for (const watch of enabled) {
        try {
          const outcome = await evaluateExpression(watch.expression);
          if (outcome.ok) {
            results[watch.id] = {
              status: 'ok',
              value:
                typeof outcome.value === 'string'
                  ? outcome.value
                  : JSON.stringify(outcome.value) ?? String(outcome.value),
              valueType: outcome.type,
            };
          } else {
            results[watch.id] = { status: 'error', error: outcome.error };
          }
        } catch (err) {
          results[watch.id] = {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
      setResults(diagramId, results);
    } finally {
      evaluatingRef.current = false;
    }
  }, [diagramId, evaluateExpression, setResults]);

  // Re-evaluate on every pause and step (issue #836): pause flips isPaused,
  // steps bump evaluationTick from Layout.refreshDebuggerState.
  useEffect(() => {
    if (isPaused) void evaluateAll();
  }, [isPaused, evaluationTick, evaluateAll]);

  const handleAdd = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addWatch(diagramId, trimmed);
    setDraft('');
    setDraftError(null);
    void evaluateAll();
  };

  const handleToggle = (id: string) => {
    toggleWatch(diagramId, id);
    void evaluateAll();
  };

  const handleRemove = (id: string) => {
    removeWatch(diagramId, id);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="watch-panel">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-xs font-medium text-ui-text-muted">
          {t('watch.title')}
        </span>
        <button
          type="button"
          className="rounded p-1 text-ui-text-muted hover:bg-ui-surface-hover hover:text-ui-text disabled:opacity-40"
          disabled={!isPaused || watches.length === 0}
          onClick={() => void evaluateAll()}
          title={t('watch.refresh')}
          aria-label={t('watch.refresh')}
        >
          <FiEye className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1 px-3 pb-2">
        <input
          type="text"
          className="min-w-0 flex-1 rounded border border-ui-border bg-ui-surface px-2 py-1 text-xs text-ui-text placeholder:text-ui-text-muted focus:border-ui-primary focus:outline-none"
          placeholder={t('watch.placeholder')}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDraftError(null);
          }}
          onKeyDown={handleKeyDown}
          aria-label={t('watch.placeholder')}
        />
        <button
          type="button"
          className="rounded p-1 text-ui-primary hover:bg-ui-surface-hover disabled:opacity-40"
          disabled={!draft.trim()}
          onClick={handleAdd}
          aria-label={t('watch.add')}
          title={t('watch.add')}
        >
          <FiPlus className="h-4 w-4" />
        </button>
      </div>
      {draftError && (
        <div className="px-3 pb-2 text-xs text-ui-danger">{draftError}</div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {watches.length === 0 ? (
          <div className="px-2 py-4 text-xs text-ui-text-muted">
            {t('watch.empty')}
          </div>
        ) : (
          <ul className="space-y-1">
            {watches.map((watch) => (
              <li
                key={watch.id}
                className="group rounded border border-ui-border bg-ui-surface px-2 py-1.5"
                data-testid={`watch-item-${watch.expression}`}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="rounded p-0.5 text-ui-text-muted hover:bg-ui-surface-hover hover:text-ui-text"
                    onClick={() => handleToggle(watch.id)}
                    aria-label={
                      watch.enabled ? t('watch.disable') : t('watch.enable')
                    }
                    title={
                      watch.enabled ? t('watch.disable') : t('watch.enable')
                    }
                  >
                    {watch.enabled ? (
                      <FiPause className="h-3 w-3" />
                    ) : (
                      <FiPlay className="h-3 w-3" />
                    )}
                  </button>
                  <code className="min-w-0 flex-1 truncate text-xs text-ui-text">
                    {watch.expression}
                  </code>
                  <button
                    type="button"
                    className="rounded p-0.5 text-ui-text-muted opacity-0 hover:bg-ui-surface-hover hover:text-ui-danger focus:opacity-100 group-hover:opacity-100"
                    onClick={() => handleRemove(watch.id)}
                    aria-label={t('watch.remove')}
                    title={t('watch.remove')}
                  >
                    <FiTrash2 className="h-3 w-3" />
                  </button>
                </div>
                {watch.enabled && (
                  <div className="mt-0.5 pl-6">
                    {watch.status === 'ok' && (
                      <span className="text-xs text-ui-success">
                        {watch.value}{' '}
                        <span className="text-ui-text-muted">
                          ({watch.valueType})
                        </span>
                      </span>
                    )}
                    {watch.status === 'error' && (
                      <span
                        className="block truncate text-xs text-ui-danger"
                        title={watch.error}
                      >
                        {watch.error}
                      </span>
                    )}
                    {watch.status === 'idle' && (
                      <span className="text-xs text-ui-text-muted">
                        {t('watch.notEvaluated')}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default WatchPanel;
