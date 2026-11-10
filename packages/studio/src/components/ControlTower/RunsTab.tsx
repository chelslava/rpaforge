import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRefreshCw } from 'react-icons/fi';
import { useOrchestratorStore, type ServeRun } from '../../stores/orchestratorStore';
import LogTail from './LogTail';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void refreshRuns();
    // Initial load only — the filter select re-fetches explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <button
            type="button"
            onClick={() => void refreshRuns()}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ui-text-muted hover:bg-ui-surface-hover"
            aria-label={t('orchestrator.runs.refresh')}
          >
            <FiRefreshCw className={`h-3 w-3 ${runsLoading ? 'animate-spin' : ''}`} />
            {t('orchestrator.runs.refresh')}
          </button>
        </div>
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
                            <td className="pr-2 py-1 font-mono">{String(step.activity ?? '')}</td>
                            <td className="pr-2 py-1">{String(step.status ?? '')}</td>
                            <td className="py-1">{String(step.duration_ms ?? 0)} ms</td>
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
