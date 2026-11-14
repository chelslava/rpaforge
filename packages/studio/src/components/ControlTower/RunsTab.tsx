import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlay, FiRefreshCw } from 'react-icons/fi';
import { useOrchestratorStore, type ServeRun } from '../../stores/orchestratorStore';
import LogTail from './LogTail';
import { toDisplayString } from '../../utils/toDisplayString';

const STATUS_OPTIONS = ['', 'running', 'success', 'failed', 'cancelled'] as const;

function statusChipClass(status: string): string {
  switch (status) {
    case 'success':
      return 'bg-green-600/20 text-green-500';
    case 'failed':
      return 'bg-red-600/20 text-red-500';
    case 'running':
      return 'bg-blue-600/20 text-blue-400';
    case 'cancelled':
      return 'bg-gray-600/20 text-gray-400';
    default:
      return 'bg-gray-600/20 text-gray-400';
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function RunRow({
  run,
  selected,
  onSelect,
}: {
  run: ServeRun;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation('common');
  const cancelRun = useOrchestratorStore((s) => s.cancelRun);
  const refreshRuns = useOrchestratorStore((s) => s.refreshRuns);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancellable = run.status === 'running' || run.status === 'queued' || run.status === 'new';

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelRun(run.item_id);
      void refreshRuns();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-ui-border py-2 text-xs last:border-0">
      <button
        type="button"
        onClick={onSelect}
        className={`min-w-0 flex-1 text-left ${selected ? 'font-semibold text-accent-primary' : 'text-ui-text hover:text-accent-primary'}`}
      >
        <span data-testid="orchestrator-run-status" className={`mr-2 rounded px-1.5 py-0.5 ${statusChipClass(run.status)}`}>
          {run.status}
        </span>
        <span className="font-mono">{run.diagram_path ?? run.item_id}</span>
        <span className="ml-2 text-ui-text-muted">{formatTime(run.started_at)}</span>
        {run.exit_code !== null && (
          <span className="ml-2 text-ui-text-muted">exit {run.exit_code}</span>
        )}
      </button>
      {cancellable && (
        <button
          type="button"
          data-testid="orchestrator-cancel-run"
          disabled={cancelling}
          onClick={() => void handleCancel()}
          className="rounded bg-red-600/20 px-2 py-1 text-red-500 hover:bg-red-600/30 disabled:opacity-50"
          aria-label={t('orchestrator.runs.cancel')}
        >
          {t('orchestrator.runs.cancel')}
        </button>
      )}
      {cancelError && <span className="text-red-500">{cancelError}</span>}
    </div>
  );
}

const RunsTab: React.FC = () => {
  const { t } = useTranslation('common');
  const runs = useOrchestratorStore((s) => s.runs);
  const runsLoading = useOrchestratorStore((s) => s.runsLoading);
  const runsError = useOrchestratorStore((s) => s.runsError);
  const runsFilter = useOrchestratorStore((s) => s.runsFilter);
  const setRunsFilter = useOrchestratorStore((s) => s.setRunsFilter);
  const refreshRuns = useOrchestratorStore((s) => s.refreshRuns);
  const fetchRunDetail = useOrchestratorStore((s) => s.fetchRunDetail);
  const runDetail = useOrchestratorStore((s) => s.runDetail);
  const runDetailLoading = useOrchestratorStore((s) => s.runDetailLoading);
  const triggerRun = useOrchestratorStore((s) => s.triggerRun);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runFormOpen, setRunFormOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<'off' | '5' | '15'>('off');
  const [diagramPath, setDiagramPath] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [queuedItemId, setQueuedItemId] = useState<string | null>(null);

  useEffect(() => {
    void refreshRuns();
    // Initial load only — the filter select re-fetches explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoRefresh === 'off') return;
    const timer = window.setInterval(() => {
      // Skip a tick while a request is still in flight — no overlapping fetches.
      if (useOrchestratorStore.getState().runsLoading) return;
      void refreshRuns();
    }, Number(autoRefresh) * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refreshRuns]);

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerError(null);
    try {
      const result = await triggerRun(diagramPath);
      setQueuedItemId(result.item_id);
      setDiagramPath('');
      void refreshRuns();
    } catch (error) {
      setTriggerError(error instanceof Error ? error.message : 'trigger failed');
    } finally {
      setTriggering(false);
    }
  };

  const steps = useMemo(() => runDetail?.steps ?? [], [runDetail]);

  return (
    <div className="flex h-full gap-4">
      <div className="flex w-1/2 flex-col">
        <div className="mb-2 flex items-center gap-2">
          <select
            aria-label={t('orchestrator.runs.filter')}
            value={runsFilter ?? ''}
            onChange={(event) => setRunsFilter(event.target.value || null)}
            className="rounded border border-ui-border bg-ui-surface px-2 py-1 text-xs text-ui-text"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option ? option : t('orchestrator.runs.filterAll')}
              </option>
            ))}
          </select>
          <select
            aria-label={t('orchestrator.runs.autoRefresh')}
            value={autoRefresh}
            onChange={(event) =>
              setAutoRefresh(event.target.value as 'off' | '5' | '15')
            }
            className="rounded border border-ui-border bg-ui-surface px-2 py-1 text-xs text-ui-text"
          >
            <option value="off">{t('orchestrator.runs.autoRefreshOff')}</option>
            <option value="5">{t('orchestrator.runs.autoRefresh5')}</option>
            <option value="15">{t('orchestrator.runs.autoRefresh15')}</option>
          </select>
          <button
            type="button"
            onClick={() => void refreshRuns()}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ui-text-muted hover:bg-ui-surface-hover"
            aria-label={t('orchestrator.runs.refresh')}
          >
            <FiRefreshCw className={`h-3 w-3 ${runsLoading ? 'animate-spin' : ''}`} />
            {t('orchestrator.runs.refresh')}
          </button>
          <button
            type="button"
            data-testid="orchestrator-run-toggle"
            aria-label={t('orchestrator.runs.runNow')}
            aria-expanded={runFormOpen}
            onClick={() => setRunFormOpen((open) => !open)}
            className={`ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs ${
              runFormOpen
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-ui-text-muted hover:bg-ui-surface-hover'
            }`}
          >
            <FiPlay className="h-3 w-3" />
            {t('orchestrator.runs.runNow')}
          </button>
        </div>
        {runFormOpen && (
          <form
            className="mb-2 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleTrigger();
            }}
          >
            <input
              value={diagramPath}
              onChange={(event) => setDiagramPath(event.target.value)}
              placeholder={t('orchestrator.runs.runFormPath')}
              aria-label={t('orchestrator.runs.runFormPath')}
              data-testid="orchestrator-run-path-input"
              className="min-w-0 flex-1 rounded border border-ui-border bg-ui-surface px-2 py-1 text-xs text-ui-text"
            />
            <button
              type="submit"
              data-testid="orchestrator-run-submit"
              disabled={triggering || !diagramPath.trim()}
              className="rounded bg-blue-600/20 px-2 py-1 text-xs text-blue-400 hover:bg-blue-600/30 disabled:opacity-50"
            >
              {t('orchestrator.runs.runFormSubmit')}
            </button>
          </form>
        )}
        {queuedItemId && (
          <div
            className="mb-2 text-xs text-green-500"
            data-testid="orchestrator-run-queued"
            role="status"
          >
            {t('orchestrator.runs.triggerQueued', { itemId: queuedItemId })}
          </div>
        )}
        {triggerError && <div className="mb-2 text-xs text-red-500">{triggerError}</div>}
        {runsError && <div className="mb-2 text-xs text-red-500">{runsError}</div>}
        <div className="min-h-0 flex-1 overflow-auto rounded bg-ui-surface-muted p-2">
          {!runs.length && !runsLoading ? (
            <div className="p-2 text-xs text-ui-text-muted">{t('orchestrator.runs.empty')}</div>
          ) : (
            runs.map((run) => (
              <RunRow
                key={run.item_id}
                run={run}
                selected={selectedId === run.item_id}
                onSelect={() => {
                  setSelectedId(run.item_id);
                  void fetchRunDetail(run.item_id);
                }}
              />
            ))
          )}
        </div>
      </div>

      <div className="flex w-1/2 flex-col gap-3">
        {!selectedId ? (
          <div className="p-2 text-xs text-ui-text-muted">{t('orchestrator.runs.selectHint')}</div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-auto rounded bg-ui-surface-muted p-2 text-xs">
              {runDetailLoading && !runDetail ? (
                <div className="text-ui-text-muted">{t('orchestrator.runs.loadingDetail')}</div>
              ) : (
                <>
                  <div className="mb-2 font-semibold text-ui-text">{t('orchestrator.runs.stepsTitle')}</div>
                  {steps.length === 0 ? (
                    <div className="text-ui-text-muted">{t('orchestrator.runs.stepsEmpty')}</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-ui-text-muted">
                          <th className="pr-2">{t('orchestrator.runs.stepActivity')}</th>
                          <th className="pr-2">{t('orchestrator.runs.stepStatus')}</th>
                          <th>{t('orchestrator.runs.stepDuration')}</th>
                        </tr>
                      </thead>
                      <tbody data-testid="orchestrator-run-steps">
                        {steps.map((step, index) => (
                          <tr key={index} className="border-t border-ui-border">
                            <td className="pr-2 py-1 font-mono">{toDisplayString(step.activity ?? '')}</td>
                            <td className="pr-2 py-1">{toDisplayString(step.status ?? '')}</td>
                            <td className="py-1">{toDisplayString(step.duration_ms ?? 0)} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
            <LogTail key={selectedId} itemId={selectedId} />
          </>
        )}
      </div>
    </div>
  );
};

export default RunsTab;
