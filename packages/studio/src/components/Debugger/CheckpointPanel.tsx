import React, { useCallback, useEffect, useState } from 'react';
import { FiRotateCcw, FiRefreshCw, FiFastForward, FiAlertTriangle } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useEngine } from '../../hooks/useEngine';
import { useDiagramStore } from '../../stores/diagramStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useShallow } from 'zustand/shallow';

interface CheckpointSummary {
  checkpoint_id: string;
  timestamp: string;
  current_node_id: string;
  current_task_name: string;
  activity_count: number;
  variable_count: number;
  state: string;
}

interface HotReloadSummary {
  paused_node_id?: string;
  added_nodes?: string[];
  removed_nodes?: string[];
  modified_nodes?: string[];
  changed_params?: Record<string, string[]>;
}

interface CheckpointPanelProps {
  onRestartRun: () => void | Promise<void>;
}

const CheckpointPanel: React.FC<CheckpointPanelProps> = ({ onRestartRun }) => {
  const { t } = useTranslation('common');
  const { listCheckpoints, rewindToCheckpoint, applyHotReload } = useEngine();
  const { isPaused } = useDebuggerStore(
    useShallow((s) => ({ isPaused: s.isPaused }))
  );
  const activeDiagramId = useDiagramStore((s) => s.activeDiagramId);
  const diagramDocuments = useDiagramStore((s) => s.diagramDocuments);

  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadBusy, setReloadBusy] = useState(false);
  const [lastSummary, setLastSummary] = useState<HotReloadSummary | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCheckpoints();
      setCheckpoints(list as unknown as CheckpointSummary[]);
    } catch {
      setCheckpoints([]);
    } finally {
      setLoading(false);
    }
  }, [listCheckpoints]);

  useEffect(() => {
    // Defer out of the effect tick: refresh() sets loading state and the
    // react-hooks lint forbids synchronous setState inside effects.
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh, isPaused]);

  const activeDocument = activeDiagramId
    ? diagramDocuments[activeDiagramId]
    : null;

  const handleRewind = useCallback(
    async (checkpointId: string) => {
      setBusyId(checkpointId);
      try {
        await rewindToCheckpoint(checkpointId);
        await onRestartRun();
        toast.success(t('debugger.checkpoints.rewindStarted'));
      } catch (err) {
        toast.error(
          t('debugger.checkpoints.rewindFailed'),
          { description: err instanceof Error ? err.message : String(err) }
        );
      } finally {
        setBusyId(null);
      }
    },
    [rewindToCheckpoint, onRestartRun, t]
  );

  const handleApplyContinue = useCallback(async () => {
    if (!activeDocument) {
      toast.error(t('debugger.checkpoints.noDiagram'));
      return;
    }
    setReloadBusy(true);
    setReloadError(null);
    try {
      const summary = (await applyHotReload({
        nodes: activeDocument.nodes,
        edges: activeDocument.edges,
        metadata: activeDocument.metadata,
        variables: [],
      })) as HotReloadSummary;
      setLastSummary(summary);
      await onRestartRun();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setReloadError(message);
      toast.error(t('debugger.checkpoints.reloadRejected'), { description: message });
    } finally {
      setReloadBusy(false);
    }
  }, [activeDocument, applyHotReload, onRestartRun, t]);

  return (
    <div className="h-full overflow-y-auto p-2 text-sm" data-testid="checkpoint-panel">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{t('debugger.checkpoints.title')}</span>
        <button
          type="button"
          className="p-1 rounded hover:bg-ui-surface-hover"
          aria-label={t('debugger.checkpoints.refresh')}
          onClick={() => void refresh()}
          disabled={loading}
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isPaused && (
        <div className="mb-3 p-2 border border-ui-border rounded">
          <button
            type="button"
            className="w-full px-3 py-1.5 bg-ui-primary text-ui-text-inverse rounded text-sm hover:bg-ui-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            disabled={reloadBusy || !activeDocument}
            onClick={() => void handleApplyContinue()}
          >
            <FiFastForward className="w-4 h-4" />
            {t('debugger.checkpoints.applyContinue')}
          </button>
          {lastSummary && (
            <ul className="mt-2 text-xs text-ui-text-muted list-disc pl-4">
              <li>
                {t('debugger.checkpoints.summaryAdded')}: {(lastSummary.added_nodes || []).length}
              </li>
              <li>
                {t('debugger.checkpoints.summaryRemoved')}: {(lastSummary.removed_nodes || []).length}
              </li>
              <li>
                {t('debugger.checkpoints.summaryModified')}: {(lastSummary.modified_nodes || []).length}
              </li>
            </ul>
          )}
          {reloadError && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400 flex gap-1" role="alert">
              <FiAlertTriangle className="mt-0.5 flex-shrink-0" />
              <span>{reloadError}</span>
            </div>
          )}
        </div>
      )}

      {checkpoints.length === 0 && !loading && (
        <p className="text-xs text-ui-text-muted p-2">
          {t('debugger.checkpoints.empty')}
        </p>
      )}

      <ul className="space-y-1">
        {checkpoints.map((cp) => (
          <li
            key={cp.checkpoint_id}
            className="flex items-center justify-between gap-2 p-2 rounded hover:bg-ui-surface-hover border border-ui-border"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">
                {t('debugger.checkpoints.node')}: {cp.current_node_id || '—'}
              </div>
              <div className="text-xs text-ui-text-muted">
                {t('debugger.checkpoints.activities', { count: cp.activity_count })} ·{' '}
                {cp.timestamp ? new Date(cp.timestamp).toLocaleTimeString() : ''}
              </div>
            </div>
            <button
              type="button"
              className="p-1.5 rounded bg-ui-secondary text-ui-text-inverse hover:bg-ui-secondary-hover disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              aria-label={t('debugger.checkpoints.rewind')}
              title={t('debugger.checkpoints.rewind')}
              disabled={busyId !== null || cp.activity_count === 0}
              onClick={() => void handleRewind(cp.checkpoint_id)}
            >
              <FiRotateCcw />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CheckpointPanel;
