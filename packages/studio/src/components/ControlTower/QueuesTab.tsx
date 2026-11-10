import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRefreshCw } from 'react-icons/fi';
import { useOrchestratorStore } from '../../stores/orchestratorStore';

const QUEUE_STATUS_KEYS = ['New', 'InProgress', 'Retried', 'Successful', 'Failed', 'DeadLetter'] as const;

/**
 * Queue depth panel (issue #858): maps 1:1 to serve `GET /metrics` —
 * per-status counters for the daemon's work queue. Dead-letter requeue
 * is NOT exposed over serve v2 yet, so it is intentionally absent here.
 */
const QueuesTab: React.FC = () => {
  const { t } = useTranslation('common');
  const metrics = useOrchestratorStore((s) => s.metrics);
  const metricsError = useOrchestratorStore((s) => s.metricsError);
  const refreshMetrics = useOrchestratorStore((s) => s.refreshMetrics);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void refreshMetrics();
    // Initial load only; user refreshes explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshMetrics();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="text-xs">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleRefresh()}
          className="flex items-center gap-1 rounded px-2 py-1 text-ui-text-muted hover:bg-ui-surface-hover"
          aria-label={t('orchestrator.queues.refresh')}
        >
          <FiRefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {t('orchestrator.queues.refresh')}
        </button>
        {metrics && (
          <span className="text-ui-text-muted">
            {t('orchestrator.queues.queueLabel', { queue: metrics.queue })}
            {metrics.queue_backend && ` · ${metrics.queue_backend}`}
          </span>
        )}
      </div>

      {metricsError && <div className="mb-2 text-red-500">{metricsError}</div>}

      {!metrics && !metricsError ? (
        <div className="text-ui-text-muted">{t('orchestrator.queues.loading')}</div>
      ) : (
        <div data-testid="orchestrator-queue-stats" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUEUE_STATUS_KEYS.map((status) => (
            <div key={status} className="rounded bg-ui-surface-muted p-3">
              <div className="text-ui-text-muted">{t(`orchestrator.queues.${status}`)}</div>
              <div className="mt-1 text-lg font-semibold text-ui-text">
                {metrics?.stats?.[status] ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-ui-text-muted">{t('orchestrator.queues.requeueNote')}</p>
    </div>
  );
};

export default QueuesTab;
