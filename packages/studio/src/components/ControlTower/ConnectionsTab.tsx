import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiEdit2, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { useOrchestratorStore, type ConnectionHealth } from '../../stores/orchestratorStore';
import { healthBadgeClass, formatUptime, QUEUE_STATUS_KEYS } from './health';

interface FormState {
  id?: string;
  name: string;
  baseUrl: string;
  token: string;
}

const EMPTY_FORM: FormState = { name: '', baseUrl: 'http://127.0.0.1:8765', token: '' };

interface ConnectionsTabProps {
  /** True when rendered in place of the tabs (no connections yet). */
  embedded?: boolean;
}

const ConnectionsTab: React.FC<ConnectionsTabProps> = ({ embedded = false }) => {
  const { t } = useTranslation('common');
  const connections = useOrchestratorStore((s) => s.connections);
  const health = useOrchestratorStore((s) => s.health);
  const healthMessage = useOrchestratorStore((s) => s.healthMessage);
  const activeConnectionId = useOrchestratorStore((s) => s.activeConnectionId);
  const setActiveConnection = useOrchestratorStore((s) => s.setActiveConnection);
  const addConnection = useOrchestratorStore((s) => s.addConnection);
  const updateConnection = useOrchestratorStore((s) => s.updateConnection);
  const deleteConnection = useOrchestratorStore((s) => s.deleteConnection);
  const checkHealth = useOrchestratorStore((s) => s.checkHealth);
  const metrics = useOrchestratorStore((s) => s.metrics);
  const refreshMetrics = useOrchestratorStore((s) => s.refreshMetrics);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form) return;
    setFormError(null);
    try {
      if (form.id) {
        await updateConnection({
          id: form.id,
          name: form.name,
          baseUrl: form.baseUrl,
          token: form.token || undefined,
        });
      } else {
        await addConnection({ name: form.name, baseUrl: form.baseUrl, token: form.token || undefined });
      }
      setForm(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'save failed');
    }
  };

  useEffect(() => {
    // Host summary (issue #880) — refresh silently when the tab is opened.
    void refreshMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCheck = async (id: string) => {
    setChecking(id);
    try {
      await checkHealth(id);
    } finally {
      setChecking(null);
    }
  };

  return (
    <div className="text-xs">
      <div className="mb-2 flex items-center gap-2">
        {!embedded && (
          <button
            type="button"
            data-testid="orchestrator-connection-new"
            onClick={() => {
              setFormError(null);
              setForm({ ...EMPTY_FORM });
            }}
            className="flex items-center gap-1 rounded bg-accent-primary/20 px-2 py-1 text-accent-primary hover:bg-accent-primary/30"
          >
            <FiPlus className="h-3 w-3" />
            {t('orchestrator.connections.new')}
          </button>
        )}
      </div>

      {connections.length === 0 && !form ? (
        <div className="p-2 text-ui-text-muted">{t('orchestrator.connections.empty')}</div>
      ) : (
        !embedded && (
          <div data-testid="orchestrator-connection-list">
            {connections.map((connection) => (
              <div key={connection.id} className="flex items-center gap-2 border-b border-ui-border py-2 last:border-0">
                <input
                  type="radio"
                  id={`orch-conn-${connection.id}`}
                  name="orchestrator-active-connection"
                  checked={activeConnectionId === connection.id}
                  onChange={() => setActiveConnection(connection.id)}
                  className="accent-accent-primary"
                  aria-label={t('orchestrator.connections.setActive', { name: connection.name })}
                />
                <label htmlFor={`orch-conn-${connection.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 ${healthBadgeClass(health[connection.id] as ConnectionHealth)}`}>
                      {t(`orchestrator.health.${health[connection.id] ?? 'unknown'}`)}
                    </span>
                    <span className="font-semibold text-ui-text">{connection.name}</span>
                  </div>
                  <div className="font-mono text-ui-text-muted">{connection.baseUrl}</div>
                  {healthMessage[connection.id] && (
                    <div className="text-red-500">{healthMessage[connection.id]}</div>
                  )}
                </label>
                <span className="text-ui-text-muted">
                  {connection.hasToken ? t('orchestrator.connections.tokenSet') : t('orchestrator.connections.tokenMissing')}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCheck(connection.id)}
                  className="rounded p-1 text-ui-text-muted hover:bg-ui-surface-hover"
                  aria-label={t('orchestrator.connections.check', { name: connection.name })}
                >
                  <FiRefreshCw className={`h-3.5 w-3.5 ${checking === connection.id ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setForm({ id: connection.id, name: connection.name, baseUrl: connection.baseUrl, token: '' });
                  }}
                  className="rounded p-1 text-ui-text-muted hover:bg-ui-surface-hover"
                  aria-label={t('orchestrator.connections.edit', { name: connection.name })}
                >
                  <FiEdit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteConnection(connection.id)}
                  className="rounded p-1 text-red-500 hover:bg-red-600/20"
                  aria-label={t('orchestrator.connections.delete', { name: connection.name })}
                >
                  <FiTrash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {!embedded &&
        metrics &&
        activeConnectionId &&
        health[activeConnectionId] === 'healthy' && (
          <div
            className="mt-3 rounded bg-ui-surface-muted p-3"
            data-testid="orchestrator-host-metrics"
          >
            <div className="mb-1 flex flex-wrap items-center gap-x-3">
              <span className="font-semibold text-ui-text">
                {t('orchestrator.metrics.title')}
              </span>
              <span className="text-ui-text-muted">
                {t('orchestrator.queues.queueLabel', { queue: metrics.queue })}
                {metrics.queue_backend && ` · ${metrics.queue_backend}`}
              </span>
              {typeof metrics.uptime_sec === 'number' && (
                <span className="text-ui-text-muted">
                  {t('orchestrator.metrics.uptime')}:{' '}
                  <span className="font-semibold text-ui-text">
                    {formatUptime(metrics.uptime_sec)}
                  </span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {QUEUE_STATUS_KEYS.map((status) => (
                <span key={status} className="text-ui-text-muted">
                  {t(`orchestrator.queues.${status}`)}:{' '}
                  <span className="font-semibold text-ui-text">
                    {metrics.stats?.[status] ?? 0}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

      {(form || (embedded && connections.length === 0)) && (
        <div className="mt-3 rounded bg-ui-surface-muted p-3" data-testid="orchestrator-connection-form">
          <div className="space-y-2">
            <label className="block">
              <span className="text-ui-text-muted">{t('orchestrator.connections.fieldName')}</span>
              <input
                value={form?.name ?? ''}
                onChange={(event) => setForm((current) => (current ? { ...current, name: event.target.value } : current))}
                className="mt-0.5 w-full rounded border border-ui-border bg-ui-surface px-2 py-1 text-ui-text"
              />
            </label>
            <label className="block">
              <span className="text-ui-text-muted">{t('orchestrator.connections.fieldUrl')}</span>
              <input
                value={form?.baseUrl ?? EMPTY_FORM.baseUrl}
                onChange={(event) => setForm((current) => (current ? { ...current, baseUrl: event.target.value } : current))}
                className="mt-0.5 w-full rounded border border-ui-border bg-ui-surface px-2 py-1 font-mono text-ui-text"
              />
            </label>
            <label className="block">
              <span className="text-ui-text-muted">{t('orchestrator.connections.fieldToken')}</span>
              <input
                type="password"
                value={form?.token ?? ''}
                placeholder={form?.id ? t('orchestrator.connections.tokenKeepPlaceholder') : ''}
                onChange={(event) => setForm((current) => (current ? { ...current, token: event.target.value } : current))}
                className="mt-0.5 w-full rounded border border-ui-border bg-ui-surface px-2 py-1 font-mono text-ui-text"
              />
              <span className="mt-0.5 block text-ui-text-muted">{t('orchestrator.connections.tokenNote')}</span>
            </label>
          </div>
          {formError && <div className="mt-2 text-red-500">{formError}</div>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded px-3 py-1.5 text-ui-text-muted hover:bg-ui-surface-hover"
            >
              {t('actions.cancel')}
            </button>
            <button
              type="button"
              data-testid="orchestrator-connection-save"
              disabled={!form?.name || !form?.baseUrl}
              onClick={() => void handleSave()}
              className="flex items-center gap-1 rounded bg-accent-primary px-3 py-1.5 text-white hover:opacity-90 disabled:opacity-50"
            >
              <FiCheck className="h-3.5 w-3.5" />
              {t('orchestrator.connections.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionsTab;
