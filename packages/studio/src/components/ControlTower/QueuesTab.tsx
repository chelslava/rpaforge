import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCpu, FiRefreshCw, FiRotateCcw } from 'react-icons/fi';
import {
  useOrchestratorStore,
  type QueuedItemDiagnosis,
} from '../../stores/orchestratorStore';
import { QUEUE_STATUS_KEYS } from './health';
import { toDisplayString } from '../../utils/toDisplayString';

/**
 * Queue depth panel (issue #858) + dead-letter requeue (issue #877): maps 1:1
 * to serve `GET /metrics` and the `/queues/{name}/items` + requeue endpoints.
 */
const QueuesTab: React.FC = () => {
  const { t } = useTranslation('common');
  const [diagnosisFor, setDiagnosisFor] = useState<string | null>(null);
  const [diagnosisCache, setDiagnosisCache] = useState<
    Record<string, QueuedItemDiagnosis | null>
  >({});
  const metrics = useOrchestratorStore((s) => s.metrics);
  const metricsError = useOrchestratorStore((s) => s.metricsError);
  const refreshMetrics = useOrchestratorStore((s) => s.refreshMetrics);
  const queueItems = useOrchestratorStore((s) => s.queueItems);
  const queueItemsError = useOrchestratorStore((s) => s.queueItemsError);
  const fetchQueueItems = useOrchestratorStore((s) => s.fetchQueueItems);
  const requeueItem = useOrchestratorStore((s) => s.requeueItem);
  const requeueAllDeadLetter = useOrchestratorStore((s) => s.requeueAllDeadLetter);
  const fetchItemDiagnosis = useOrchestratorStore((s) => s.fetchItemDiagnosis);
  const [refreshing, setRefreshing] = useState(false);
  const [requeueing, setRequeueing] = useState<string | null>(null);
  const [requeueError, setRequeueError] = useState<string | null>(null);

  useEffect(() => {
    void refreshMetrics();
    void fetchQueueItems();
    // Initial load only; user refreshes explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshMetrics(), fetchQueueItems()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRequeueItem = async (itemId: string) => {
    setRequeueing(itemId);
    setRequeueError(null);
    try {
      await requeueItem(itemId);
    } catch (error) {
      setRequeueError(error instanceof Error ? error.message : 'requeue failed');
    } finally {
      setRequeueing(null);
    }
  };

  const handleRequeueAll = async () => {
    setRequeueing('__all__');
    setRequeueError(null);
    try {
      await requeueAllDeadLetter();
    } catch (error) {
      setRequeueError(error instanceof Error ? error.message : 'requeue failed');
    } finally {
      setRequeueing(null);
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

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-semibold text-ui-text">
            {t('orchestrator.queues.deadLetterTitle')}
          </span>
          <button
            type="button"
            data-testid="orchestrator-requeue-all"
            disabled={requeueing !== null || queueItems.length === 0}
            onClick={() => void handleRequeueAll()}
            className="flex items-center gap-1 rounded bg-blue-600/20 px-2 py-1 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50"
          >
            <FiRotateCcw className="h-3 w-3" />
            {t('orchestrator.queues.requeueAll')}
          </button>
        </div>

        {requeueError && <div className="mb-2 text-red-500">{requeueError}</div>}
        {queueItemsError && <div className="mb-2 text-red-500">{queueItemsError}</div>}

        {queueItems.length === 0 ? (
          <div className="p-2 text-ui-text-muted">
            {t('orchestrator.queues.deadLetterEmpty')}
          </div>
        ) : (
          queueItems.map((item) => {
            const diagram = toDisplayString(item.payload?.diagram_path ?? item.id);
            if (diagnosisFor === item.id) {
              return (
                <DiagnosisRow
                  key={`${item.id}-expanded`}
                  item={item}
                  diagram={diagram}
                  diagnosis={diagnosisCache[item.id]}
                  onCollapse={() => setDiagnosisFor(null)}
                  onRequeue={() => void handleRequeueItem(item.id)}
                  requeueing={requeueing !== null}
                />
              );
            }
            return (
              <div
                key={item.id}
                className="flex items-center gap-2 border-b border-ui-border py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-ui-text">{diagram}</div>
                  <div className="text-ui-text-muted">
                    {item.reference && <span className="mr-2">{item.reference}</span>}
                    {item.error_message && (
                      <span className="text-red-500" title={item.error_message}>
                        {item.error_message}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid={`orchestrator-diagnose-${item.id}`}
                  onClick={() => {
                    setDiagnosisFor(item.id);
                    if (!(item.id in diagnosisCache)) {
                      void fetchItemDiagnosis(item.id)
                        .then((result) =>
                          setDiagnosisCache((current) => ({
                            ...current,
                            [item.id]: result,
                          }))
                        )
                        .catch(() =>
                          setDiagnosisCache((current) => ({
                            ...current,
                            [item.id]: null,
                          }))
                        );
                    }
                  }}
                  className="rounded bg-purple-600/20 px-2 py-1 text-purple-400 hover:bg-purple-600/30"
                  aria-label={t('orchestrator.queues.diagnosis', { id: item.id })}
                >
                  <FiCpu className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  data-testid={`orchestrator-requeue-item-${item.id}`}
                  disabled={requeueing !== null}
                  onClick={() => void handleRequeueItem(item.id)}
                  className="rounded bg-blue-600/20 px-2 py-1 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50"
                  aria-label={t('orchestrator.queues.requeueItem', { id: item.id })}
                >
                  <FiRotateCcw className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};


const DiagnosisRow: React.FC<{
  item: { id: string; reference?: string | null; error_message?: string | null };
  diagram: string;
  diagnosis: QueuedItemDiagnosis | null | undefined;
  onCollapse: () => void;
  onRequeue: () => void;
  requeueing: boolean;
}> = ({ item, diagram, diagnosis, onCollapse, onRequeue, requeueing }) => {
  const { t } = useTranslation('common');
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-ui-border py-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-ui-text">{diagram}</div>
          <div className="text-ui-text-muted">
            {item.reference && <span className="mr-2">{item.reference}</span>}
            {item.error_message && (
              <span className="text-red-500" title={item.error_message}>
                {item.error_message}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          data-testid={`orchestrator-diagnose-${item.id}`}
          onClick={onCollapse}
          className="rounded bg-purple-600/20 px-2 py-1 text-purple-400 hover:bg-purple-600/30"
          aria-label={t('orchestrator.queues.diagnosis', { id: item.id })}
        >
          <FiCpu className="h-3 w-3" />
        </button>
        <button
          type="button"
          data-testid={`orchestrator-requeue-item-${item.id}`}
          disabled={requeueing}
          onClick={onRequeue}
          className="rounded bg-blue-600/20 px-2 py-1 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50"
          aria-label={t('orchestrator.queues.requeueItem', { id: item.id })}
        >
          <FiRotateCcw className="h-3 w-3" />
        </button>
      </div>
      <div
        className="border-b border-ui-border bg-ui-surface-inset px-3 py-2 text-xs"
        data-testid={`orchestrator-diagnosis-${item.id}`}
      >
        {diagnosis === undefined ? (
          <span className="text-ui-text-muted">
            {t('orchestrator.queues.diagnosisLoading')}
          </span>
        ) : diagnosis === null ? (
          <span className="text-ui-text-muted">
            {t('orchestrator.queues.diagnosisNone')}
          </span>
        ) : (
          <div className="space-y-1">
            <div className="font-medium text-ui-text">
              {diagnosis.diagnosis.root_cause}{" "}
              {diagnosis.diagnosis.confidence && (
                <span className="text-ui-text-muted">
                  ({t('orchestrator.queues.diagnosisConfidence')}:{' '}
                  {diagnosis.diagnosis.confidence})
                </span>
              )}
            </div>
            {diagnosis.diagnosis.explanation && (
              <div className="text-ui-text-muted">
                {diagnosis.diagnosis.explanation}
              </div>
            )}
            <div className="text-ui-text-muted">
              {t('orchestrator.queues.diagnosisProposals', {
                count: diagnosis.diagnosis.proposals?.length ?? 0,
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QueuesTab;
